import { describe, expect, it } from 'vitest'
import { createRoundHeader } from './roundHeader'

describe('roundHeader', () => {
  it('renders round, total and phase', () => {
    const header = createRoundHeader({ round: 2, totalRounds: 5, phaseLabel: 'Escrever' })
    expect(header.tagName).toBe('H1')
    expect(header.textContent).toBe('Rodada 2 de 5 · Escrever')
  })
})
