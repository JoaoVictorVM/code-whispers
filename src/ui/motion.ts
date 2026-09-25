import { gsap } from 'gsap'
import { Flip } from 'gsap/Flip'
import { SplitText } from 'gsap/SplitText'

gsap.registerPlugin(Flip, SplitText)

export { Flip, SplitText, gsap }

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

export function canAnimate(): boolean {
  return !prefersReducedMotion() && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
}
