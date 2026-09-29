import { play } from '../audio/sfx'
import { hostRoom, hostTelephoneRoom, joinRoomByCode, leaveRoom } from '../network/room'
import { ROOM_CODE_LENGTH, normalizeRoomCode, sanitizeRoomCodeInput } from '../network/roomCode'
import { gameState } from '../state/gameState'
import { NICKNAME_RULE_MESSAGE } from '../state/profile'
import type { GameState, MatchMode, RoomKind } from '../types/game'
import { canAnimate, gsap } from '../ui/motion'
import { createRoomCodeDisplay } from '../ui/roomCodeDisplay'

export const MODE_OPTIONS: readonly { value: MatchMode; label: string }[] = [
  { value: 3, label: 'Rápida (3)' },
  { value: 5, label: 'Média (5)' },
  { value: 7, label: 'Maior (7)' },
]

export const KIND_OPTIONS: readonly { value: RoomKind; title: string; detail: string }[] = [
  { value: 'duel', title: 'Duelo', detail: '2 jogadores' },
  { value: 'telephone', title: 'Telefone sem fio', detail: '3 a 8 jogadores' },
]

export { COPIED_FEEDBACK_MS } from '../ui/roomCodeDisplay'

type PendingAction = 'host' | 'guest' | null

export interface RoomPanels {
  element: HTMLElement
  destroy(): void
}

const panelClass = 'ink-card flex flex-col gap-4 p-5 sm:p-6'
const primaryButtonClass = 'btn-chunky w-full bg-tangerine px-5 py-3 text-lg text-ink'
const fieldClass = 'field-ink w-full px-3 py-2.5 font-bold'

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function setButtonContent(button: HTMLButtonElement, label: string, loading: boolean): void {
  button.replaceChildren()
  if (loading) {
    const spinner = element('span', 'size-4 animate-spin rounded-full border-[3px] border-ink/25 border-t-ink')
    spinner.setAttribute('aria-hidden', 'true')
    button.append(spinner)
  }
  button.append(label)
  button.setAttribute('aria-busy', String(loading))
}

function modeLabel(mode: MatchMode): string {
  return MODE_OPTIONS.find((option) => option.value === mode)?.label ?? String(mode)
}

export function createRoomPanels(): RoomPanels {
  let pending: PendingAction = null
  let lastError: GameState['connection']['error'] = null
  const animated = canAnimate()

  const wrapper = element('div', 'grid w-full max-w-3xl gap-4 sm:grid-cols-2')
  wrapper.dataset.component = 'room-panels'

  const hostPanel = element('div', panelClass)
  hostPanel.dataset.role = 'host-panel'
  const hostTitle = element('h2', 'font-display text-2xl', 'Criar sala')

  const hostForm = element('div', 'flex flex-col gap-4')
  const kindLabelElement = element('label', 'flex flex-col gap-1.5 text-sm font-extrabold uppercase tracking-wider', 'Tipo de partida')
  const kindSelect = element('select', 'sr-only')
  kindSelect.dataset.role = 'kind-select'
  for (const option of KIND_OPTIONS) {
    const optionElement = element('option', '', `${option.title} (${option.detail})`)
    optionElement.value = option.value
    kindSelect.append(optionElement)
  }
  const kindChips = element('div', 'grid grid-cols-2 gap-2')
  kindChips.dataset.role = 'kind-chips'
  kindChips.setAttribute('aria-hidden', 'true')
  const kindButtons = KIND_OPTIONS.map((option) => {
    const chip = element('button', 'btn-chunky flex-col gap-0.5 px-2 py-2 text-ink')
    chip.type = 'button'
    chip.tabIndex = -1
    chip.dataset.kind = option.value
    chip.append(
      element('span', 'font-display text-lg leading-tight', option.title),
      element('span', 'text-xs font-extrabold uppercase', option.detail),
    )
    chip.addEventListener('click', () => {
      if (kindSelect.disabled || kindSelect.value === chip.dataset.kind) return
      kindSelect.value = chip.dataset.kind!
      kindSelect.dispatchEvent(new Event('change'))
    })
    kindChips.append(chip)
    return chip
  })
  kindLabelElement.append(kindSelect, kindChips)
  const modeLabelElement = element('label', 'flex flex-col gap-1.5 text-sm font-extrabold uppercase tracking-wider', 'Modo')
  const modeSelect = element('select', 'sr-only')
  modeSelect.dataset.role = 'mode-select'
  for (const option of MODE_OPTIONS) {
    const optionElement = element('option', '', option.label)
    optionElement.value = String(option.value)
    modeSelect.append(optionElement)
  }
  const modeChips = element('div', 'grid grid-cols-3 gap-2')
  modeChips.dataset.role = 'mode-chips'
  modeChips.setAttribute('aria-hidden', 'true')
  const chipButtons = MODE_OPTIONS.map((option) => {
    const chip = element('button', 'btn-chunky flex-col gap-0 px-2 py-2 text-ink')
    chip.type = 'button'
    chip.tabIndex = -1
    chip.dataset.mode = String(option.value)
    const [name, rounds] = option.label.replace(')', '').split(' (')
    chip.append(element('span', 'font-display text-2xl leading-none', rounds), element('span', 'text-xs font-extrabold uppercase', name))
    chip.addEventListener('click', () => {
      if (modeSelect.disabled || modeSelect.value === chip.dataset.mode) return
      modeSelect.value = chip.dataset.mode!
      modeSelect.dispatchEvent(new Event('change'))
    })
    modeChips.append(chip)
    return chip
  })
  modeLabelElement.append(modeSelect, modeChips)
  const createButton = element('button', primaryButtonClass)
  createButton.type = 'button'
  createButton.dataset.role = 'create-room'
  const hostError = element('p', 'text-sm font-bold text-cherry')
  hostError.dataset.role = 'host-error'
  hostError.setAttribute('role', 'alert')
  hostForm.append(kindLabelElement, modeLabelElement, createButton, hostError)

  const hostWaiting = element('div', 'flex flex-col items-center gap-4 text-center')
  const codeDisplay = createRoomCodeDisplay()
  const modeInfo = element('p', 'text-sm font-extrabold uppercase tracking-wider text-ink/70')
  modeInfo.dataset.role = 'room-mode'
  const waitingLabel = element('p', 'font-bold text-ink/80', 'Aguardando o outro jogador…')
  waitingLabel.setAttribute('aria-live', 'polite')
  const cancelButton = element('button', 'text-sm font-bold text-ink/60 underline decoration-2 underline-offset-4 hover:text-ink', 'Cancelar')
  cancelButton.type = 'button'
  cancelButton.dataset.role = 'cancel-room'
  hostWaiting.append(codeDisplay.element, modeInfo, waitingLabel, cancelButton)

  hostPanel.append(hostTitle, hostForm, hostWaiting)

  const guestPanel = element('div', panelClass)
  guestPanel.dataset.role = 'guest-panel'
  const guestTitle = element('h2', 'font-display text-2xl', 'Entrar em sala')
  const codeLabel = element('label', 'flex flex-col gap-1.5 text-sm font-extrabold uppercase tracking-wider', 'Código da sala')
  const codeInput = element(
    'input',
    `${fieldClass} font-mono text-2xl uppercase tracking-[0.35em] placeholder:tracking-normal`,
  )
  codeInput.id = 'room-code-input'
  codeInput.dataset.role = 'room-code-input'
  codeInput.type = 'text'
  codeInput.autocomplete = 'off'
  codeInput.spellcheck = false
  codeInput.maxLength = ROOM_CODE_LENGTH
  codeInput.placeholder = 'ABC123'
  codeInput.setAttribute('aria-describedby', 'guest-error')
  codeLabel.append(codeInput)
  const joinButton = element('button', primaryButtonClass)
  joinButton.type = 'button'
  joinButton.dataset.role = 'join-room'
  const guestError = element('p', 'text-sm font-bold text-cherry')
  guestError.id = 'guest-error'
  guestError.dataset.role = 'guest-error'
  guestError.setAttribute('role', 'alert')
  guestPanel.append(guestTitle, codeLabel, joinButton, guestError)

  wrapper.append(hostPanel, guestPanel)

  function render(state: GameState): void {
    const { connection, room, localPlayer } = state
    const busy = connection.status === 'connecting'
    if (!busy && connection.status !== 'connected') pending = null

    const hosting = room?.role === 'host' && busy
    const creating = pending === 'host' && busy && !hosting
    const joining = pending === 'guest' && busy
    const profileReason = localPlayer ? '' : NICKNAME_RULE_MESSAGE

    hostForm.hidden = hosting
    hostWaiting.hidden = !hosting
    kindSelect.disabled = busy
    for (const chip of kindButtons) {
      const active = chip.dataset.kind === kindSelect.value
      chip.disabled = busy
      chip.classList.toggle('bg-bubblegum', active)
      chip.classList.toggle('bg-paper', !active)
      chip.setAttribute('aria-pressed', String(active))
    }
    modeLabelElement.hidden = kindSelect.value !== 'duel'
    modeSelect.disabled = busy
    for (const chip of chipButtons) {
      const active = chip.dataset.mode === modeSelect.value
      chip.disabled = busy
      chip.classList.toggle('bg-sky', active)
      chip.classList.toggle('bg-paper', !active)
      chip.setAttribute('aria-pressed', String(active))
    }
    createButton.disabled = !localPlayer || busy
    createButton.title = profileReason
    setButtonContent(createButton, creating ? 'Criando sala…' : 'Criar sala', creating)

    if (hosting && room) {
      codeDisplay.show(room.code)
      modeInfo.textContent = `Modo: ${modeLabel(room.mode)}`
    } else {
      codeDisplay.reset()
    }

    const codeValid = normalizeRoomCode(codeInput.value) !== null
    codeInput.disabled = joining || hosting
    joinButton.disabled = !localPlayer || !codeValid || busy
    joinButton.title = profileReason
    setButtonContent(joinButton, joining ? 'Conectando…' : 'Entrar', joining)

    const errorType = connection.error?.type
    hostError.textContent = errorType === 'signaling' ? connection.error!.message : ''
    hostError.hidden = !hostError.textContent
    guestError.textContent =
      errorType === 'not-found' || errorType === 'room-full' || errorType === 'in-progress' ? connection.error!.message : ''
    guestError.hidden = !guestError.textContent

    if (connection.error && connection.error !== lastError) {
      shake(errorType === 'signaling' ? hostPanel : guestPanel)
      play('error')
    }
    lastError = connection.error
  }

  function shake(target: HTMLElement): void {
    if (!animated) return
    gsap.fromTo(target, { x: -10 }, { x: 0, duration: 0.5, ease: 'elastic.out(1.4, 0.2)' })
  }

  createButton.addEventListener('click', () => {
    const profile = gameState.get().localPlayer
    if (!profile) return
    pending = 'host'
    play('tap')
    if (kindSelect.value === 'telephone') hostTelephoneRoom(profile)
    else hostRoom(profile, Number(modeSelect.value) as MatchMode)
  })

  joinButton.addEventListener('click', () => {
    const profile = gameState.get().localPlayer
    if (!profile || normalizeRoomCode(codeInput.value) === null) return
    pending = 'guest'
    play('tap')
    joinRoomByCode(profile, codeInput.value)
  })

  kindSelect.addEventListener('change', () => {
    play('select')
    render(gameState.get())
    const chip = kindButtons.find((candidate) => candidate.dataset.kind === kindSelect.value)
    if (animated && chip) gsap.fromTo(chip, { scale: 0.88 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1.3, 0.4)' })
  })

  modeSelect.addEventListener('change', () => {
    play('select')
    render(gameState.get())
    const chip = chipButtons.find((candidate) => candidate.dataset.mode === modeSelect.value)
    if (animated && chip) gsap.fromTo(chip, { scale: 0.88 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1.3, 0.4)' })
  })

  codeInput.addEventListener('input', () => {
    const sanitized = sanitizeRoomCodeInput(codeInput.value)
    if (sanitized !== codeInput.value) codeInput.value = sanitized
    render(gameState.get())
  })

  codeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !joinButton.disabled) joinButton.click()
  })

  cancelButton.addEventListener('click', () => {
    pending = null
    play('tap')
    leaveRoom()
  })

  const unsubscribe = gameState.onChange(render)
  render(gameState.get())

  return {
    element: wrapper,
    destroy() {
      unsubscribe()
      codeDisplay.destroy()
      wrapper.remove()
    },
  }
}
