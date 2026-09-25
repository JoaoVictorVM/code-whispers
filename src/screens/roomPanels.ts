import { play } from '../audio/sfx'
import { CONNECTION_ERROR_MESSAGES, hostRoom, joinRoomByCode, leaveRoom } from '../network/room'
import { ROOM_CODE_LENGTH, normalizeRoomCode, sanitizeRoomCodeInput } from '../network/roomCode'
import { gameState } from '../state/gameState'
import { NICKNAME_RULE_MESSAGE } from '../state/profile'
import type { GameState, MatchMode } from '../types/game'
import { canAnimate, gsap } from '../ui/motion'

export const MODE_OPTIONS: readonly { value: MatchMode; label: string }[] = [
  { value: 3, label: 'Rápida (3)' },
  { value: 5, label: 'Média (5)' },
  { value: 7, label: 'Maior (7)' },
]

export const COPIED_FEEDBACK_MS = 2000

type PendingAction = 'host' | 'guest' | null

export interface RoomPanels {
  element: HTMLElement
  destroy(): void
}

const panelClass = 'ink-card flex flex-col gap-4 p-5 sm:p-6'
const primaryButtonClass = 'btn-chunky w-full bg-tangerine px-5 py-3 text-lg text-ink'
const secondaryButtonClass = 'btn-chunky bg-paper px-5 py-2 text-sm text-ink'
const fieldClass = 'field-ink w-full px-3 py-2.5 font-bold'
const tileClass =
  'room-tile grid size-11 place-items-center rounded-lg border-[3px] border-ink bg-sunflower font-display text-2xl text-ink shadow-[0_4px_0_var(--color-ink)] sm:size-12'

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
  let shownCode = ''
  let lastError: GameState['connection']['error'] = null
  const animated = canAnimate()
  let copyTimer: ReturnType<typeof setTimeout> | null = null

  const wrapper = element('div', 'grid w-full max-w-3xl gap-4 sm:grid-cols-2')
  wrapper.dataset.component = 'room-panels'

  const hostPanel = element('div', panelClass)
  hostPanel.dataset.role = 'host-panel'
  const hostTitle = element('h2', 'font-display text-2xl', 'Criar sala')

  const hostForm = element('div', 'flex flex-col gap-4')
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
  hostForm.append(modeLabelElement, createButton, hostError)

  const hostWaiting = element('div', 'flex flex-col items-center gap-4 text-center')
  const codeDisplay = element('output', 'flex justify-center gap-1.5 sm:gap-2')
  codeDisplay.dataset.role = 'room-code'
  const copyButton = element('button', secondaryButtonClass, 'Copiar')
  copyButton.type = 'button'
  copyButton.dataset.role = 'copy-code'
  const copyError = element('p', 'text-sm font-bold text-cherry')
  copyError.dataset.role = 'copy-error'
  const modeInfo = element('p', 'text-sm font-extrabold uppercase tracking-wider text-ink/70')
  modeInfo.dataset.role = 'room-mode'
  const waitingLabel = element('p', 'font-bold text-ink/80', 'Aguardando o outro jogador…')
  waitingLabel.setAttribute('aria-live', 'polite')
  const cancelButton = element('button', 'text-sm font-bold text-ink/60 underline decoration-2 underline-offset-4 hover:text-ink', 'Cancelar')
  cancelButton.type = 'button'
  cancelButton.dataset.role = 'cancel-room'
  hostWaiting.append(codeDisplay, copyButton, copyError, modeInfo, waitingLabel, cancelButton)

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
      showCode(room.code)
      modeInfo.textContent = `Modo: ${modeLabel(room.mode)}`
    } else {
      shownCode = ''
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
      errorType === 'not-found' || errorType === 'room-full' ? connection.error!.message : ''
    guestError.hidden = !guestError.textContent

    if (connection.error && connection.error !== lastError) {
      shake(errorType === 'signaling' ? hostPanel : guestPanel)
      play('error')
    }
    lastError = connection.error

    if (!hosting) resetCopyFeedback()
  }

  function showCode(code: string): void {
    if (code === shownCode) return
    shownCode = code
    const tiles = Array.from(code, (char) => element('span', tileClass, char))
    codeDisplay.replaceChildren(...tiles)
    if (!animated) return
    gsap.from(tiles, {
      rotationX: -90,
      y: -20,
      opacity: 0,
      duration: 0.45,
      ease: 'back.out(2)',
      stagger: {
        each: 0.08,
        onStart: () => play('pop'),
      },
    })
  }

  function shake(target: HTMLElement): void {
    if (!animated) return
    gsap.fromTo(target, { x: -10 }, { x: 0, duration: 0.5, ease: 'elastic.out(1.4, 0.2)' })
  }

  function resetCopyFeedback(): void {
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = null
    copyButton.textContent = 'Copiar'
    copyError.textContent = ''
    copyError.hidden = true
  }

  function selectCode(): void {
    const selection = window.getSelection()
    if (!selection) return
    const range = document.createRange()
    range.selectNodeContents(codeDisplay)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  async function copyCode(): Promise<void> {
    const code = codeDisplay.textContent ?? ''
    resetCopyFeedback()
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(code)
      copyButton.textContent = 'Copiado!'
      play('success')
      if (animated) gsap.fromTo(codeDisplay.children, { y: 0 }, { y: -10, duration: 0.14, yoyo: true, repeat: 1, stagger: 0.04, ease: 'power2.out' })
      copyTimer = setTimeout(() => {
        copyTimer = null
        copyButton.textContent = 'Copiar'
      }, COPIED_FEEDBACK_MS)
    } catch {
      selectCode()
      copyError.textContent = CONNECTION_ERROR_MESSAGES.clipboard
      copyError.hidden = false
    }
  }

  createButton.addEventListener('click', () => {
    const profile = gameState.get().localPlayer
    if (!profile) return
    pending = 'host'
    play('tap')
    hostRoom(profile, Number(modeSelect.value) as MatchMode)
  })

  joinButton.addEventListener('click', () => {
    const profile = gameState.get().localPlayer
    if (!profile || normalizeRoomCode(codeInput.value) === null) return
    pending = 'guest'
    play('tap')
    joinRoomByCode(profile, codeInput.value)
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

  copyButton.addEventListener('click', () => {
    void copyCode()
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
      if (copyTimer) clearTimeout(copyTimer)
      wrapper.remove()
    },
  }
}
