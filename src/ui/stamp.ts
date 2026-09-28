import { play } from '../audio/sfx'
import { canAnimate, gsap } from './motion'

export type StampTone = 'mint' | 'cherry' | 'sunflower' | 'tangerine'

const toneClasses: Record<StampTone, string> = {
  mint: 'border-mint text-mint',
  cherry: 'border-cherry text-cherry',
  sunflower: 'border-sunflower text-sunflower',
  tangerine: 'border-tangerine text-tangerine',
}

export type StampSize = 'large' | 'corner'

const sizeClasses: Record<StampSize, string> = {
  large:
    'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-2xl border-[6px] bg-grape-deep/60 px-6 py-2 text-4xl backdrop-blur-[1px] sm:text-5xl',
  corner: '-right-3 -top-4 rotate-6 rounded-xl border-4 bg-grape-deep px-3 py-1 text-lg shadow-[0_3px_0_var(--color-ink)]',
}

export function createStamp(text: string, tone: StampTone = 'mint', size: StampSize = 'large'): HTMLElement {
  const stamp = document.createElement('div')
  stamp.dataset.component = 'stamp'
  stamp.setAttribute('aria-hidden', 'true')
  stamp.className = `pointer-events-none absolute z-10 font-display tracking-wide ${sizeClasses[size]} ${toneClasses[tone]}`
  stamp.textContent = text
  return stamp
}

export function slamStamp(stamp: HTMLElement, shakeTarget?: HTMLElement): void {
  play('stamp')
  if (!canAnimate()) return
  gsap.fromTo(stamp, { scale: 2.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.28, ease: 'power4.in' })
  if (shakeTarget) {
    gsap.fromTo(shakeTarget, { x: -6, y: 4 }, { x: 0, y: 0, duration: 0.45, delay: 0.26, ease: 'elastic.out(1.6, 0.25)' })
  }
}
