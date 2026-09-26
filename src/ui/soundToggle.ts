import { isMuted, onMuteChange, play, toggleMuted } from '../audio/sfx'

const ICON_ON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="size-6"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
const ICON_OFF =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="size-6"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'

export function createSoundToggle(): { element: HTMLButtonElement; destroy(): void } {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.role = 'sound-toggle'
  button.className =
    'btn-chunky fixed right-4 top-4 z-40 size-12 rounded-full bg-sunflower p-0 text-ink'

  function render(muted: boolean): void {
    button.innerHTML = muted ? ICON_OFF : ICON_ON
    button.setAttribute('aria-pressed', String(muted))
    button.setAttribute('aria-label', muted ? 'Ativar sons' : 'Desativar sons')
    button.title = muted ? 'Ativar sons' : 'Desativar sons'
  }

  button.addEventListener('click', () => {
    const nowMuted = toggleMuted()
    if (!nowMuted) play('select')
  })

  render(isMuted())
  const unsubscribe = onMuteChange(render)

  return {
    element: button,
    destroy() {
      unsubscribe()
      button.remove()
    },
  }
}
