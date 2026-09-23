export interface DisconnectModalOptions {
  opponentNickname: string
  onConfirm: () => void
}

export function createDisconnectModal({ opponentNickname, onConfirm }: DisconnectModalOptions): HTMLElement {
  const overlay = document.createElement('div')
  overlay.dataset.component = 'disconnect-modal'
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-4 backdrop-blur-sm'

  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'alertdialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-labelledby', 'disconnect-message')
  dialog.className = 'flex w-full max-w-sm flex-col items-center gap-6 rounded-xl bg-surface p-6 text-center shadow-xl'

  const message = document.createElement('p')
  message.id = 'disconnect-message'
  message.className = 'text-lg font-medium'
  message.textContent = `${opponentNickname} desconectou. A partida foi encerrada.`

  const button = document.createElement('button')
  button.type = 'button'
  button.className =
    'rounded-lg bg-accent px-6 py-3 font-semibold text-white hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
  button.textContent = 'Voltar ao início'
  button.addEventListener('click', onConfirm, { once: true })

  dialog.append(message, button)
  overlay.append(dialog)
  queueMicrotask(() => button.focus())
  return overlay
}
