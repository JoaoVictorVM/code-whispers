import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gameState } from '../state/gameState'
import { createGameHud, type GameHud } from './gameHud'

describe('gameHud', () => {
  let hud: GameHud

  beforeEach(() => {
    gameState.reset()
    gameState.patch({
      round: 2,
      room: { code: 'AB3XYZ', role: 'host', mode: 5 },
      localPlayer: { nickname: 'Bia', avatarId: 1 },
      remotePlayer: { nickname: 'Ana', avatarId: 6 },
    })
    hud = createGameHud({ phase: 'explain', phaseLabel: 'Explicar' })
    document.body.append(hud.element)
  })

  afterEach(() => hud.destroy())

  it('shows the round header, the phase track and both cans', () => {
    expect(hud.element.querySelector('h1')?.textContent).toBe('Rodada 2 de 5 · Explicar')
    expect(hud.element.querySelector('[data-step="explain"]')?.getAttribute('aria-current')).toBe('step')
    expect(hud.element.querySelector('[data-can="remote"] image')?.getAttribute('href')).toBe('./avatars/avatar-06.png')
  })

  it('shows the waiting bubble only while the local player waits', () => {
    const bubble = () => hud.element.querySelector('[data-bubble="remote"]')!.getAttribute('opacity')
    expect(bubble()).toBe('0')
    gameState.patch({ readyFlags: { local: true, opponent: false } })
    expect(bubble()).toBe('1')
    gameState.patch({ readyFlags: { local: true, opponent: true } })
    expect(bubble()).toBe('0')
  })

  it('stops reacting after destroy', () => {
    hud.destroy()
    expect(document.body.contains(hud.element)).toBe(false)
    expect(() => gameState.patch({ readyFlags: { local: true, opponent: false } })).not.toThrow()
  })
})
