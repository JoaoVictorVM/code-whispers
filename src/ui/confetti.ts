import confetti from 'canvas-confetti'
import { canAnimate } from './motion'

const COLORS = ['#ff8a3d', '#56c2ff', '#ff5fa2', '#ffc53d', '#3ddc97', '#fff6e5']

export function celebrate(): void {
  if (!canAnimate()) return
  try {
    const burst = (originX: number, angle: number) =>
      confetti({ particleCount: 70, angle, spread: 65, startVelocity: 55, origin: { x: originX, y: 0.75 }, colors: COLORS, disableForReducedMotion: true })
    burst(0.1, 60)
    burst(0.9, 120)
    setTimeout(() => confetti({ particleCount: 120, spread: 110, origin: { y: 0.35 }, colors: COLORS, disableForReducedMotion: true }), 250)
  } catch {
    return
  }
}
