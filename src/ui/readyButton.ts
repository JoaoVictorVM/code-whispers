export interface ReadyButtonOptions {
  localReady: boolean
  opponentReady: boolean
  opponentNickname: string
  onToggle: () => void
  disabled?: boolean
  disabledReason?: string
}

const buttonBase = 'btn-chunky min-w-40 px-8 py-3 text-xl text-ink'

export function createReadyButton(options: ReadyButtonOptions): HTMLElement {
  const { localReady, opponentReady, opponentNickname, onToggle, disabled = false, disabledReason = '' } = options

  const wrapper = document.createElement('div')
  wrapper.className = 'flex flex-col items-end gap-3'
  wrapper.dataset.component = 'ready-button'

  if (opponentReady && !localReady) {
    const badge = document.createElement('span')
    badge.dataset.role = 'opponent-ready-badge'
    badge.className =
      'ready-badge -rotate-2 rounded-full border-[3px] border-ink bg-bubblegum px-4 py-1 text-sm font-extrabold text-ink shadow-[0_3px_0_var(--color-ink)]'
    badge.textContent = `${opponentNickname} está pronto`
    wrapper.append(badge)
  }

  const row = document.createElement('div')
  row.className = 'flex flex-row-reverse flex-wrap items-center justify-start gap-3'

  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.role = 'ready-toggle'
  button.className = localReady
    ? `${buttonBase} bg-paper`
    : `${buttonBase} bg-tangerine`
  button.textContent = localReady ? 'Cancelar' : 'Pronto'
  button.disabled = disabled && !localReady
  button.addEventListener('click', onToggle)
  row.append(button)

  if (button.disabled && disabledReason) {
    const reason = document.createElement('span')
    reason.id = 'ready-disabled-reason'
    reason.dataset.role = 'disabled-reason'
    reason.className = 'text-sm font-bold text-cherry'
    reason.textContent = disabledReason
    button.setAttribute('aria-describedby', reason.id)
    row.append(reason)
  }

  if (localReady && !opponentReady) {
    const waiting = document.createElement('span')
    waiting.dataset.role = 'waiting-label'
    waiting.className = 'animate-pulse font-bold text-lilac'
    waiting.textContent = `Aguardando ${opponentNickname}…`
    row.append(waiting)
  }

  wrapper.append(row)
  return wrapper
}
