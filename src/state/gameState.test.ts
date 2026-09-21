import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gameState } from './gameState'

describe('gameState', () => {
  beforeEach(() => {
    gameState.reset()
  })

  it('test_patch_updates_state', () => {
    gameState.patch({ screen: 'code' })
    expect(gameState.get().screen).toBe('code')
  })

  it('test_patch_notifies_subscribers_once', () => {
    const listener = vi.fn()
    gameState.onChange(listener)
    gameState.patch({ screen: 'explica', round: 2, phase: 'explain' })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(gameState.get())
  })

  it('test_onChange_returns_unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = gameState.onChange(listener)
    unsubscribe()
    gameState.patch({ round: 3 })
    expect(listener).not.toHaveBeenCalled()
  })

  it('test_multiple_subscribers_all_notified', () => {
    const first = vi.fn()
    const second = vi.fn()
    gameState.onChange(first)
    gameState.onChange(second)
    gameState.patch({ mode: 5 })
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('starts with the documented initial values', () => {
    const initial = gameState.get()
    expect(initial.screen).toBe('inicio')
    expect(initial.localPlayer).toBeNull()
    expect(initial.remotePlayer).toBeNull()
    expect(initial.mode).toBe(3)
    expect(initial.round).toBe(1)
    expect(initial.phase).toBe('code')
    expect(initial.readyFlags).toEqual({ local: false, opponent: false })
    expect(initial.submissions).toEqual({})
    expect(initial.tallies.local).toEqual({ correct: 0, half: 0, wrong: 0 })
  })
})
