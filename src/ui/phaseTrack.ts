import { canAnimate, gsap } from './motion'

export type TrackPhase = 'code' | 'explain' | 'review'

export const TRACK_STEPS: readonly { phase: TrackPhase; label: string }[] = [
  { phase: 'code', label: 'Escrever' },
  { phase: 'explain', label: 'Explicar' },
  { phase: 'review', label: 'Avaliar' },
]

export function createPhaseTrack(current: TrackPhase): HTMLElement {
  const currentIndex = TRACK_STEPS.findIndex((step) => step.phase === current)
  const track = document.createElement('ol')
  track.dataset.component = 'phase-track'
  track.className = 'relative flex items-center gap-1.5'
  track.setAttribute('aria-label', 'Fases da rodada')

  const squares = TRACK_STEPS.map((step, index) => {
    const item = document.createElement('li')
    item.className = 'flex items-center gap-1.5'
    const square = document.createElement('span')
    square.dataset.step = step.phase
    const done = index < currentIndex
    const active = index === currentIndex
    square.className = [
      'rounded-lg border-[3px] border-ink px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-ink shadow-[0_3px_0_var(--color-ink)]',
      active ? 'bg-sunflower' : done ? 'bg-mint' : 'bg-paper/70',
    ].join(' ')
    square.textContent = step.label
    if (active) square.setAttribute('aria-current', 'step')
    item.append(square)
    if (index < TRACK_STEPS.length - 1) {
      const link = document.createElement('span')
      link.className = `h-1 w-4 rounded-full ${index < currentIndex ? 'bg-mint' : 'bg-paper/30'}`
      link.setAttribute('aria-hidden', 'true')
      item.append(link)
    }
    track.append(item)
    return square
  })

  const pawn = document.createElement('span')
  pawn.dataset.role = 'pawn'
  pawn.setAttribute('aria-hidden', 'true')
  pawn.className = 'pointer-events-none absolute -top-3 size-4 rounded-full border-[3px] border-ink bg-sky shadow-[0_2px_0_var(--color-ink)]'
  track.append(pawn)

  requestAnimationFrame(() => {
    const target = squares[currentIndex]
    const from = squares[currentIndex === 0 ? TRACK_STEPS.length - 1 : currentIndex - 1]
    const place = (square: HTMLElement) => square.offsetLeft + square.offsetWidth / 2 - pawn.offsetWidth / 2
    pawn.style.left = `${place(target)}px`
    if (!canAnimate()) return
    gsap.from(pawn, { x: place(from) - place(target), duration: 0.6, delay: 0.5, ease: 'power2.inOut' })
    gsap.fromTo(pawn, { y: 0 }, { y: -14, duration: 0.3, delay: 0.5, yoyo: true, repeat: 1, ease: 'sine.out' })
  })

  return track
}
