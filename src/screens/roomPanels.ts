import { CONNECTION_ERROR_MESSAGES, hostRoom, joinRoomByCode, leaveRoom } from '../network/room'
import { ROOM_CODE_LENGTH, normalizeRoomCode, sanitizeRoomCodeInput } from '../network/roomCode'
import { gameState } from '../state/gameState'
import { NICKNAME_RULE_MESSAGE } from '../state/profile'
import type { GameState, MatchMode } from '../types/game'

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

const panelClass = 'flex flex-col gap-4 rounded-xl bg-surface p-5'
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 font-semibold text-white transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent'
const secondaryButtonClass =
  'rounded-lg border border-muted/40 px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-bg/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
const fieldClass =
  'w-full rounded-lg border border-bg bg-bg px-3 py-2 text-text focus:border-accent focus:outline-none'

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
    const spinner = element('span', 'size-4 animate-spin rounded-full border-2 border-white/40 border-t-white')
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
  let copyTimer: ReturnType<typeof setTimeout> | null = null

  const wrapper = element('div', 'grid w-full max-w-3xl gap-4 sm:grid-cols-2')
  wrapper.dataset.component = 'room-panels'

  const hostPanel = element('div', panelClass)
  hostPanel.dataset.role = 'host-panel'
  const hostTitle = element('h2', 'text-lg font-semibold', 'Criar sala')

  const hostForm = element('div', 'flex flex-col gap-4')
  const modeLabelElement = element('label', 'flex flex-col gap-1 text-sm text-muted', 'Modo')
  const modeSelect = element('select', fieldClass)
  modeSelect.dataset.role = 'mode-select'
  for (const option of MODE_OPTIONS) {
    const optionElement = element('option', '', option.label)
    optionElement.value = String(option.value)
    modeSelect.append(optionElement)
  }
  modeLabelElement.append(modeSelect)
  const createButton = element('button', primaryButtonClass)
  createButton.type = 'button'
  createButton.dataset.role = 'create-room'
  const hostError = element('p', 'text-sm text-danger')
  hostError.dataset.role = 'host-error'
  hostError.setAttribute('role', 'alert')
  hostForm.append(modeLabelElement, createButton, hostError)

  const hostWaiting = element('div', 'flex flex-col items-center gap-3 text-center')
  const codeDisplay = element('output', 'select-all font-mono text-4xl font-bold tracking-[0.3em] text-accent')
  codeDisplay.dataset.role = 'room-code'
  const copyButton = element('button', secondaryButtonClass, 'Copiar')
  copyButton.type = 'button'
  copyButton.dataset.role = 'copy-code'
  const copyError = element('p', 'text-sm text-warning')
  copyError.dataset.role = 'copy-error'
  const modeInfo = element('p', 'text-sm text-muted')
  modeInfo.dataset.role = 'room-mode'
  const waitingLabel = element('p', 'text-sm text-muted', 'Aguardando o outro jogador…')
  waitingLabel.setAttribute('aria-live', 'polite')
  const cancelButton = element('button', 'text-sm text-muted underline hover:text-text', 'Cancelar')
  cancelButton.type = 'button'
  cancelButton.dataset.role = 'cancel-room'
  hostWaiting.append(codeDisplay, copyButton, copyError, modeInfo, waitingLabel, cancelButton)

  hostPanel.append(hostTitle, hostForm, hostWaiting)

  const guestPanel = element('div', panelClass)
  guestPanel.dataset.role = 'guest-panel'
  const guestTitle = element('h2', 'text-lg font-semibold', 'Entrar em sala')
  const codeLabel = element('label', 'flex flex-col gap-1 text-sm text-muted', 'Código da sala')
  const codeInput = element(
    'input',
    `${fieldClass} font-mono text-xl uppercase tracking-[0.3em] placeholder:tracking-normal placeholder:text-muted`,
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
  const guestError = element('p', 'text-sm text-danger')
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
    createButton.disabled = !localPlayer || busy
    createButton.title = profileReason
    setButtonContent(createButton, creating ? 'Criando sala…' : 'Criar sala', creating)

    if (hosting && room) {
      codeDisplay.textContent = room.code
      modeInfo.textContent = `Modo: ${modeLabel(room.mode)}`
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

    if (!hosting) resetCopyFeedback()
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
    hostRoom(profile, Number(modeSelect.value) as MatchMode)
  })

  joinButton.addEventListener('click', () => {
    const profile = gameState.get().localPlayer
    if (!profile || normalizeRoomCode(codeInput.value) === null) return
    pending = 'guest'
    joinRoomByCode(profile, codeInput.value)
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
