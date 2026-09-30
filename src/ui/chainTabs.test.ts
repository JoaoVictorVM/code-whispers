import { describe, expect, it, vi } from 'vitest'
import { createChainTabs } from './chainTabs'

const chains = [
  { owner: { nickname: 'João', avatarId: 1 }, entries: [] },
  { owner: { nickname: 'Gui', avatarId: 3 }, entries: [] },
  { owner: { nickname: 'Breno', avatarId: 5 }, entries: [] },
]

describe('chain tabs', () => {
  it('shows one tab per chain owner and marks the selected one', () => {
    const tabs = createChainTabs({ chains, selected: 1, onSelect: vi.fn() })
    const buttons = Array.from(tabs.element.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(buttons.map((button) => button.textContent)).toEqual(['João', 'Gui', 'Breno'])
    expect(buttons.map((button) => button.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
  })

  it('reports the chosen chain and moves the selection', () => {
    const onSelect = vi.fn()
    const tabs = createChainTabs({ chains, selected: 0, onSelect })
    tabs.element.querySelector<HTMLButtonElement>('[data-chain="2"]')!.click()
    expect(onSelect).toHaveBeenCalledWith(2)
    tabs.setSelected(2)
    expect(tabs.element.querySelector('[data-chain="2"]')?.getAttribute('aria-selected')).toBe('true')
    expect(tabs.element.querySelector('[data-chain="0"]')?.getAttribute('aria-selected')).toBe('false')
  })
})
