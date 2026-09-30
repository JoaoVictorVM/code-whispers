import { beforeEach, describe, expect, it } from 'vitest'
import { gameState } from '../state/gameState'
import type { TelephoneState } from '../types/game'
import { createStepHud, stepHeaderText } from './stepHud'

const telephone: TelephoneState = {
  step: 1,
  totalSteps: 4,
  stepKind: 'code',
  received: 'Uma função que soma dois números.',
  readyIds: [],
  localReady: false,
  chains: null,
  revealCursor: { chain: 0, entry: 0 },
}

describe('step hud', () => {
  beforeEach(() => {
    gameState.reset()
    gameState.patch({
      lobby: {
        selfId: 'self-peer',
        hostId: 'host-peer',
        players: [
          { id: 'host-peer', nickname: 'João', avatarId: 1, isHost: true },
          { id: 'self-peer', nickname: 'Gui', avatarId: 3, isHost: false },
          { id: 'peer-b', nickname: 'Breno', avatarId: 5, isHost: false },
          { id: 'peer-c', nickname: 'Lia', avatarId: 2, isHost: false },
        ],
        stage: 'playing',
        departedNickname: null,
      },
      telephone,
    })
  })

  it('names each step kind', () => {
    expect(stepHeaderText(0, 4, 'describe')).toBe('Etapa 1 de 4 · Descreva')
    expect(stepHeaderText(1, 4, 'code')).toBe('Etapa 2 de 4 · Programe')
    expect(stepHeaderText(2, 4, 'explain')).toBe('Etapa 3 de 4 · Explique')
  })

  it('follows the current step and who is ready', () => {
    const hud = createStepHud()
    expect(hud.element.querySelector('[data-role="step-header"]')?.textContent).toBe('Etapa 2 de 4 · Programe')
    expect(hud.element.querySelectorAll('[data-role="roster-player"]')).toHaveLength(4)
    gameState.patch({ telephone: { ...telephone, step: 2, stepKind: 'explain', readyIds: ['peer-b', 'peer-c'] } })
    expect(hud.element.querySelector('[data-role="step-header"]')?.textContent).toBe('Etapa 3 de 4 · Explique')
    expect(hud.element.querySelectorAll('[data-role="ready-check"]')).toHaveLength(2)
    hud.destroy()
    gameState.patch({ telephone: { ...telephone, step: 3 } })
    expect(hud.element.isConnected).toBe(false)
  })
})
