import { play } from '../audio/sfx'
import { CONNECTION_ERROR_MESSAGES } from '../network/room'
import { canAnimate, gsap } from './motion'

export const COPIED_FEEDBACK_MS = 2000

const tileClass =
  'room-tile grid size-11 place-items-center rounded-lg border-[3px] border-ink bg-sunflower font-display text-2xl text-ink shadow-[0_4px_0_var(--color-ink)] sm:size-12'

export interface RoomCodeDisplay {
  element: HTMLElement
  show(code: string): void
  reset(): void
  destroy(): void
}

export function createRoomCodeDisplay(): RoomCodeDisplay {
  const animated = canAnimate()
  let shownCode = ''
  let copyTimer: ReturnType<typeof setTimeout> | null = null

  const wrapper = document.createElement('div')
  wrapper.dataset.component = 'room-code-display'
  wrapper.className = 'flex flex-col items-center gap-4'

  const codeDisplay = document.createElement('output')
  codeDisplay.dataset.role = 'room-code'
  codeDisplay.className = 'flex justify-center gap-1.5 sm:gap-2'

  const copyButton = document.createElement('button')
  copyButton.type = 'button'
  copyButton.dataset.role = 'copy-code'
  copyButton.className = 'btn-chunky bg-paper px-5 py-2 text-sm text-ink'
  copyButton.textContent = 'Copiar'

  const copyError = document.createElement('p')
  copyError.dataset.role = 'copy-error'
  copyError.className = 'text-sm font-bold text-cherry'
  copyError.hidden = true

  wrapper.append(codeDisplay, copyButton, copyError)

  function resetCopyFeedback(): void {
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = null
    copyButton.textContent = 'Copiar'
    copyError.textContent = ''
    copyError.hidden = true
  }

  function show(code: string): void {
    if (code === shownCode) return
    shownCode = code
    const tiles = Array.from(code, (char) => {
      const tile = document.createElement('span')
      tile.className = tileClass
      tile.textContent = char
      return tile
    })
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

  copyButton.addEventListener('click', () => {
    void copyCode()
  })

  return {
    element: wrapper,
    show,
    reset() {
      shownCode = ''
      resetCopyFeedback()
    },
    destroy() {
      if (copyTimer) clearTimeout(copyTimer)
      wrapper.remove()
    },
  }
}
