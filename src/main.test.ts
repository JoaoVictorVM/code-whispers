import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('trystero/nostr', () => ({ joinRoom: vi.fn(), getRelaySockets: vi.fn(() => ({})) }))
import { bootstrap } from './main'
import { gameState } from './state/gameState'
import type { ScreenId } from './types/game'

const headings: Record<ScreenId, string> = {
  inicio: 'Code Whispers',
  code: 'Rodada 1 de 3 · Escrever',
  explica: 'Rodada 1 de 3 · Explicar',
  revisa: 'Rodada 1 de 3 · Avaliar',
  final: 'Fim de jogo — Rápida, 3 rodadas',
}

describe('screen router', () => {
  let root: HTMLElement
  let dispose: () => void

  beforeEach(() => {
    gameState.reset()
    document.body.innerHTML = '<div id="app"></div>'
    root = document.querySelector<HTMLElement>('#app')!
    dispose = bootstrap(root)
  })

  afterEach(() => {
    dispose()
  })

  it('test_initial_mount_renders_current_screen', () => {
    expect(root.querySelector('h1')?.textContent).toBe('Code Whispers')
    expect(root.querySelector('[data-screen="inicio"]')).not.toBeNull()
  })

  it('test_screen_change_unmounts_previous_and_mounts_next', () => {
    const previous = root.querySelector('[data-screen="inicio"]')
    gameState.patch({ screen: 'code' })
    expect(root.contains(previous)).toBe(false)
    expect(root.querySelector('[data-screen="code"] h1')?.textContent).toBe('Rodada 1 de 3 · Escrever')
    expect(root.children).toHaveLength(1)
  })

  it('test_all_five_screens_mount_without_error', () => {
    for (const id of Object.keys(headings) as ScreenId[]) {
      expect(() => gameState.patch({ screen: id })).not.toThrow()
      expect(root.querySelector('h1')?.textContent).toBe(headings[id])
      expect(root.children).toHaveLength(1)
    }
  })

  it('test_no_op_screen_change_does_not_remount', () => {
    const mounted = root.querySelector('[data-screen="inicio"]')
    gameState.patch({ round: 2 })
    expect(root.querySelector('[data-screen="inicio"]')).toBe(mounted)
  })

  it('shows the disconnect modal over a game screen when the opponent leaves', () => {
    gameState.patch({
      screen: 'code',
      remotePlayer: { nickname: 'Ana', avatarId: 2 },
      connection: { status: 'connected', error: null },
    })
    expect(root.querySelector('[data-component="disconnect-modal"]')).toBeNull()
    gameState.patch({ connection: { status: 'disconnected', error: null } })
    const modal = root.querySelector('[data-component="disconnect-modal"]')
    expect(modal?.textContent).toContain('Ana desconectou. A partida foi encerrada.')
    expect(root.querySelector('[data-screen="code"]')).not.toBeNull()
  })

  it('does not show the disconnect modal on the start screen', () => {
    gameState.patch({ connection: { status: 'disconnected', error: null } })
    expect(root.querySelector('[data-component="disconnect-modal"]')).toBeNull()
  })

  it('confirming the disconnect modal returns to the start screen with state reset', () => {
    gameState.patch({
      screen: 'revisa',
      round: 3,
      room: { code: 'AB3XYZ', role: 'host', mode: 5 },
      remotePlayer: { nickname: 'Ana', avatarId: 2 },
      connection: { status: 'disconnected', error: null },
    })
    root.querySelector<HTMLButtonElement>('[data-component="disconnect-modal"] button')!.click()
    const state = gameState.get()
    expect(state.screen).toBe('inicio')
    expect(state.room).toBeNull()
    expect(state.remotePlayer).toBeNull()
    expect(state.round).toBe(1)
    expect(state.connection).toEqual({ status: 'idle', error: null })
    expect(root.querySelector('[data-component="disconnect-modal"]')).toBeNull()
    expect(root.querySelector('[data-screen="inicio"]')).not.toBeNull()
  })
})
