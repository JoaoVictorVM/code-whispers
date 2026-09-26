import { play } from '../audio/sfx'
import { canAnimate, gsap } from './motion'

export type StampTone = 'mint' | 'cherry' | 'sunflower' | 'tangerine'

const toneClasses: Record<StampTone, string> = {
  mint: 'border-mint text-mint',
  cherry: 'border-cherry text-cherry',
  sunflower: 'border-sunflower text-sunflower',
  tangerine: 'border-tangerine text-tangerine',
}

export function createStamp(text: string, tone: StampTone = 'mint'): HTMLElement {
  const stamp = document.createElement('div')
  stamp.dataset.component = 'stamp'
  stamp.setAttribute('aria-hidden', 'true')
  stamp.className = `pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-2xl border-[6px] bg-grape-deep/60 px-6 py-2 font-display text-4xl tracking-wide backdrop-blur-[1px] sm:text-5xl ${toneClasses[tone]}`
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
