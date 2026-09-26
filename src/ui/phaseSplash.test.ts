import { describe, expect, it, vi } from 'vitest'
import { showPhaseSplash } from './phaseSplash'
import { celebrate } from './confetti'

describe('decorative effects under reduced motion', () => {
  it('skips the phase splash', () => {
    showPhaseSplash({ round: 1, totalRounds: 3, phaseLabel: 'Escrever' })
    expect(document.querySelector('[data-component="phase-splash"]')).toBeNull()
  })

  it('skips the confetti', () => {
    const append = vi.spyOn(document.body, 'appendChild')
    expect(() => celebrate()).not.toThrow()
    expect(append).not.toHaveBeenCalled()
    append.mockRestore()
  })
})
