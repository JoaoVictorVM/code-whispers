export interface ReadyButtonOptions {
  localReady: boolean
  opponentReady: boolean
  opponentNickname: string
  onToggle: () => void
  disabled?: boolean
  disabledReason?: string
}

const buttonBase =
  'rounded-lg px-6 py-3 font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function createReadyButton(options: ReadyButtonOptions): HTMLElement {
  const { localReady, opponentReady, opponentNickname, onToggle, disabled = false, disabledReason = '' } = options

  const wrapper = document.createElement('div')
  wrapper.className = 'flex flex-col items-start gap-2'
  wrapper.dataset.component = 'ready-button'

  if (opponentReady && !localReady) {
    const badge = document.createElement('span')
    badge.dataset.role = 'opponent-ready-badge'
    badge.className = 'rounded-full bg-success/20 px-3 py-1 text-sm text-success'
    badge.textContent = `${opponentNickname} está pronto`
    wrapper.append(badge)
  }

  const row = document.createElement('div')
  row.className = 'flex items-center gap-3'

  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.role = 'ready-toggle'
  button.className = localReady
    ? `${buttonBase} bg-surface text-text hover:bg-surface/80`
    : `${buttonBase} bg-accent text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent`
  button.textContent = localReady ? 'Cancelar' : 'Pronto'
  button.disabled = disabled && !localReady
  button.addEventListener('click', onToggle)
  row.append(button)

  if (button.disabled && disabledReason) {
    const reason = document.createElement('span')
    reason.id = 'ready-disabled-reason'
    reason.dataset.role = 'disabled-reason'
    reason.className = 'text-sm text-danger'
    reason.textContent = disabledReason
    button.setAttribute('aria-describedby', reason.id)
    row.append(reason)
  }

  if (localReady && !opponentReady) {
    const waiting = document.createElement('span')
    waiting.dataset.role = 'waiting-label'
    waiting.className = 'text-sm text-muted'
    waiting.textContent = `Aguardando ${opponentNickname}…`
    row.append(waiting)
  }

  wrapper.append(row)
  return wrapper
}
