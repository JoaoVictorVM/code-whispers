import type { Chain } from '../types/game'
import { avatarSrc } from './avatarPicker'
import { seatTone } from './seatTone'

export interface ChainTabsOptions {
  chains: readonly Chain[]
  selected: number
  onSelect: (index: number) => void
}

export interface ChainTabs {
  element: HTMLElement
  setSelected(index: number): void
  destroy(): void
}

export function createChainTabs({ chains, selected, onSelect }: ChainTabsOptions): ChainTabs {
  const list = document.createElement('div')
  list.dataset.component = 'chain-tabs'
  list.setAttribute('role', 'tablist')
  list.setAttribute('aria-label', 'Cadeias')
  list.className = 'flex flex-wrap justify-center gap-2'

  const tabs = chains.map((chain, index) => {
    const tab = document.createElement('button')
    tab.type = 'button'
    tab.dataset.role = 'chain-tab'
    tab.dataset.chain = String(index)
    tab.setAttribute('role', 'tab')
    tab.className = 'btn-chunky gap-2 px-3 py-1.5 text-sm text-ink'
    const avatar = document.createElement('img')
    avatar.src = avatarSrc('./avatars', chain.owner.avatarId)
    avatar.alt = ''
    avatar.width = 24
    avatar.height = 24
    avatar.className = `size-6 rounded-full border-2 border-ink ${seatTone(index)}`
    tab.append(avatar, chain.owner.nickname)
    tab.addEventListener('click', () => onSelect(index))
    list.append(tab)
    return tab
  })

  function setSelected(index: number): void {
    tabs.forEach((tab, position) => {
      const active = position === index
      tab.setAttribute('aria-selected', String(active))
      tab.tabIndex = active ? 0 : -1
      tab.classList.toggle('bg-sunflower', active)
      tab.classList.toggle('bg-paper', !active)
    })
  }

  setSelected(selected)

  return {
    element: list,
    setSelected,
    destroy() {
      list.remove()
    },
  }
}
