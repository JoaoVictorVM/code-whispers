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

  it('replaces the round line with a custom heading when motion is allowed', () => {
    const matchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({ ...matchMedia(query), matches: false })) as typeof window.matchMedia
    try {
      showPhaseSplash({ round: 1, totalRounds: 3, phaseLabel: 'Explique', heading: 'Etapa 2 de 3' })
      const splash = document.querySelector('[data-component="phase-splash"]')
      expect(splash?.textContent).toContain('Etapa 2 de 3')
      expect(splash?.textContent).toContain('Explique')
      expect(splash?.textContent).not.toContain('Rodada')
    } finally {
      window.matchMedia = matchMedia
      document.querySelector('[data-component="phase-splash"]')?.remove()
    }
  })
})
