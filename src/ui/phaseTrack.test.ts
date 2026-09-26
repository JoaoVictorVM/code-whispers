import { describe, expect, it } from 'vitest'
import { createPhaseTrack } from './phaseTrack'

describe('phaseTrack', () => {
  it('marks the current phase and the completed ones', () => {
    const track = createPhaseTrack('explain')
    const steps = Array.from(track.querySelectorAll<HTMLElement>('[data-step]'))
    expect(steps.map((step) => step.textContent)).toEqual(['Escrever', 'Explicar', 'Avaliar'])
    expect(steps[1].getAttribute('aria-current')).toBe('step')
    expect(steps[0].className).toContain('bg-mint')
    expect(steps[2].className).toContain('bg-paper')
    expect(track.querySelector('[data-role="pawn"]')).not.toBeNull()
  })
})
