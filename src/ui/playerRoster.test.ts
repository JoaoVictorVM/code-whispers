import { describe, expect, it } from 'vitest'
import type { LobbyPlayer } from '../types/game'
import { createPlayerRoster } from './playerRoster'

const players: LobbyPlayer[] = [
  { id: 'host-peer', nickname: 'João', avatarId: 1, isHost: true },
  { id: 'self-peer', nickname: 'Gui', avatarId: 3, isHost: false },
  { id: 'peer-b', nickname: 'Breno', avatarId: 5, isHost: false },
]

function entry(roster: HTMLElement, id: string): HTMLElement {
  return roster.querySelector<HTMLElement>(`[data-player-id="${id}"]`)!
}

describe('player roster', () => {
  it('shows every player in seat order and marks the local one', () => {
    const roster = createPlayerRoster({ players, selfId: 'self-peer' })
    const names = Array.from(roster.element.querySelectorAll<HTMLElement>('[data-role="roster-player"]'), (item) => item.dataset.playerId)
    expect(names).toEqual(['host-peer', 'self-peer', 'peer-b'])
    expect(entry(roster.element, 'self-peer').textContent).toContain('Você')
    expect(entry(roster.element, 'host-peer').textContent).toContain('João')
  })

  it('starts with everyone writing', () => {
    const roster = createPlayerRoster({ players, selfId: 'self-peer' })
    expect(roster.element.querySelectorAll('[data-role="typing"]')).toHaveLength(3)
    expect(roster.element.querySelectorAll('[data-role="ready-check"]')).toHaveLength(0)
  })

  it('switches players between writing and ready', () => {
    const roster = createPlayerRoster({ players, selfId: 'self-peer' })
    roster.update(['peer-b'])
    expect(entry(roster.element, 'peer-b').dataset.ready).toBe('true')
    expect(entry(roster.element, 'peer-b').querySelector('[data-role="ready-check"]')).not.toBeNull()
    expect(entry(roster.element, 'peer-b').textContent).toContain('Breno está pronto')
    expect(entry(roster.element, 'host-peer').querySelector('[data-role="typing"]')).not.toBeNull()
    roster.update([])
    expect(entry(roster.element, 'peer-b').dataset.ready).toBe('false')
    expect(entry(roster.element, 'peer-b').querySelectorAll('[data-role="ready-check"], [data-role="typing"]')).toHaveLength(1)
  })
})
