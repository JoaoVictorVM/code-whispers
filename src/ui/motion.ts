import { gsap } from 'gsap'

export { gsap }

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

export function canAnimate(): boolean {
  return !prefersReducedMotion() && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
}
