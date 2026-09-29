import { canAnimate, gsap } from './motion'

export interface DisconnectModalOptions {
  opponentNickname: string
  onConfirm: () => void
  message?: string
}

export function createDisconnectModal({ opponentNickname, onConfirm, message: customMessage }: DisconnectModalOptions): HTMLElement {
  const overlay = document.createElement('div')
  overlay.dataset.component = 'disconnect-modal'
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-grape-deep/80 p-4 backdrop-blur-sm'

  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'alertdialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-labelledby', 'disconnect-message')
  dialog.className = 'ink-card flex w-full max-w-sm flex-col items-center gap-5 p-7 text-center'
  const icon = document.createElement('div')
  icon.setAttribute('aria-hidden', 'true')
  icon.className =
    'grid size-20 rotate-12 place-items-center rounded-2xl border-[3px] border-ink bg-bubblegum font-display text-4xl text-ink shadow-[0_4px_0_var(--color-ink)]'
  icon.textContent = '✂'

  const message = document.createElement('p')
  message.id = 'disconnect-message'
  message.className = 'font-display text-xl leading-snug'
  message.textContent = customMessage ?? `${opponentNickname} desconectou. A partida foi encerrada.`

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'btn-chunky bg-tangerine px-6 py-3 text-lg text-ink'
  button.textContent = 'Voltar ao início'
  button.addEventListener('click', onConfirm, { once: true })

  dialog.append(icon, message, button)
  overlay.append(dialog)
  if (canAnimate()) {
    gsap.from(overlay, { opacity: 0, duration: 0.2 })
    gsap.from(dialog, { scale: 0.6, rotation: -8, duration: 0.6, ease: 'elastic.out(1.1, 0.45)' })
    gsap.from(icon, { rotation: -40, y: -30, duration: 0.7, delay: 0.1, ease: 'bounce.out' })
  }
  queueMicrotask(() => button.focus())
  return overlay
}
