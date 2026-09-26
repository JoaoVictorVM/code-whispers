import { play } from '../audio/sfx'
import { canAnimate, gsap } from './motion'

export interface PhaseSplashOptions {
  round: number
  totalRounds: number
  phaseLabel: string
}

let active: HTMLElement | null = null

export function showPhaseSplash({ round, totalRounds, phaseLabel }: PhaseSplashOptions): void {
  if (!canAnimate()) return
  active?.remove()

  const overlay = document.createElement('div')
  overlay.dataset.component = 'phase-splash'
  overlay.setAttribute('aria-hidden', 'true')
  overlay.className = 'pointer-events-none fixed inset-0 z-30 flex items-center justify-center overflow-hidden'

  const band = document.createElement('div')
  band.className = 'absolute inset-x-[-10%] h-44 -rotate-3 border-y-[6px] border-ink bg-tangerine sm:h-56'

  const content = document.createElement('div')
  content.className = 'relative flex -rotate-3 flex-col items-center gap-1 text-center'
  const roundLine = document.createElement('span')
  roundLine.className = 'font-display text-xl text-ink sm:text-2xl'
  roundLine.textContent = `Rodada ${round} de ${totalRounds}`
  const phaseLine = document.createElement('span')
  phaseLine.className = 'display-title text-6xl uppercase sm:text-8xl'
  phaseLine.textContent = phaseLabel
  content.append(roundLine, phaseLine)

  overlay.append(band, content)
  document.body.append(overlay)
  active = overlay
  play('whoosh')

  gsap
    .timeline({
      onComplete: () => {
        overlay.remove()
        if (active === overlay) active = null
      },
    })
    .fromTo(band, { scaleX: 0, transformOrigin: 'left center' }, { scaleX: 1, duration: 0.22, ease: 'power3.out' })
    .fromTo(phaseLine, { scale: 2.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.26, ease: 'power4.in' }, '-=0.05')
    .fromTo(roundLine, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2 }, '<0.1')
    .to([band, content], { xPercent: 120, duration: 0.3, ease: 'power3.in', delay: 0.45 })
}
