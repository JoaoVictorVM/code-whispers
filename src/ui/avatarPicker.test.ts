import { describe, expect, it, vi } from 'vitest'
import { createAvatarPicker } from './avatarPicker'

const eightIds = [1, 2, 3, 4, 5, 6, 7, 8]

function tilesOf(node: HTMLElement) {
  return Array.from(node.querySelectorAll<HTMLButtonElement>('[data-avatar-id]'))
}

describe('avatarPicker', () => {
  it('test_renders_eight_avatar_tiles', () => {
    const node = createAvatarPicker({ avatarIds: eightIds, selectedId: null, onSelect: vi.fn() })
    const tiles = tilesOf(node)
    expect(tiles).toHaveLength(8)
    expect(tiles[0].querySelector('img')?.getAttribute('src')).toBe('./avatars/avatar-01.png')
  })

  it('test_selected_avatar_has_ring_class', () => {
    const node = createAvatarPicker({ avatarIds: eightIds, selectedId: 3, onSelect: vi.fn() })
    const tiles = tilesOf(node)
    const selected = tiles.filter((t) => t.classList.contains('selected'))
    expect(selected).toHaveLength(1)
    expect(selected[0].dataset.avatarId).toBe('3')
    expect(selected[0].getAttribute('aria-checked')).toBe('true')
  })

  it('test_click_invokes_onSelect_with_id', () => {
    const onSelect = vi.fn()
    const node = createAvatarPicker({ avatarIds: eightIds, selectedId: 1, onSelect })
    node.querySelector<HTMLButtonElement>('[data-avatar-id="5"]')!.click()
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(5)
  })
})
