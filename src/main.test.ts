import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bootstrap } from './main'
import { gameState } from './state/gameState'
import type { ScreenId } from './types/game'

const headings: Record<ScreenId, string> = {
  inicio: 'Início',
  code: 'Escrever',
  explica: 'Explicar',
  revisa: 'Avaliar',
  final: 'Fim de jogo',
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
    expect(root.querySelector('h1')?.textContent).toBe('Início')
    expect(root.querySelector('[data-screen="inicio"]')).not.toBeNull()
  })

  it('test_screen_change_unmounts_previous_and_mounts_next', () => {
    const previous = root.querySelector('[data-screen="inicio"]')
    gameState.patch({ screen: 'code' })
    expect(root.contains(previous)).toBe(false)
    expect(root.querySelector('[data-screen="code"] h1')?.textContent).toBe('Escrever')
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
})
