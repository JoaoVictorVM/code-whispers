import { describe, expect, it } from 'vitest'
import type { LobbyPlayer } from '../types/game'
import {
  TELEPHONE_MAX_PLAYERS,
  addPlayer,
  canStart,
  isFull,
  missingPlayers,
  parsePlayers,
  removePlayer,
} from './lobbyProtocol'

function seat(index: number): LobbyPlayer {
  return { id: `peer-${index}`, nickname: `Jogador ${index}`, avatarId: (index % 8) + 1, isHost: index === 0 }
}

function seats(count: number): LobbyPlayer[] {
  return Array.from({ length: count }, (_, index) => seat(index))
}

describe('lobby protocol', () => {
  it('adds players in arrival order and ignores duplicates', () => {
    let players = addPlayer([], seat(0))
    players = addPlayer(players, seat(1))
    players = addPlayer(players, seat(2))
    players = addPlayer(players, seat(1))
    expect(players.map((player) => player.id)).toEqual(['peer-0', 'peer-1', 'peer-2'])
  })

  it('removes a player by id and keeps the others in order', () => {
    expect(removePlayer(seats(4), 'peer-1').map((player) => player.id)).toEqual(['peer-0', 'peer-2', 'peer-3'])
  })

  it('allows starting only between three and eight players', () => {
    const results = Array.from({ length: 9 }, (_, index) => canStart(seats(index + 1)))
    expect(results).toEqual([false, false, true, true, true, true, true, true, false])
  })

  it('counts how many players are missing down to zero', () => {
    expect([1, 2, 3, 5].map((count) => missingPlayers(seats(count)))).toEqual([2, 1, 0, 0])
  })

  it('reports a full room at eight players', () => {
    expect(isFull(seats(TELEPHONE_MAX_PLAYERS - 1))).toBe(false)
    expect(isFull(seats(TELEPHONE_MAX_PLAYERS))).toBe(true)
  })

  it('parses a valid list and trims nicknames', () => {
    const list = [seat(0), { ...seat(1), nickname: '  Gui  ' }]
    expect(parsePlayers(list)).toEqual([seat(0), { ...seat(1), nickname: 'Gui' }])
  })

  it('rejects invalid player lists', () => {
    const [host, guest] = seats(2)
    expect(parsePlayers([])).toBeNull()
    expect(parsePlayers('players')).toBeNull()
    expect(parsePlayers([guest, host])).toBeNull()
    expect(parsePlayers([host, { ...guest, isHost: true }])).toBeNull()
    expect(parsePlayers([host, { ...guest, id: host.id }])).toBeNull()
    expect(parsePlayers([host, { ...guest, nickname: 'x' }])).toBeNull()
    expect(parsePlayers([host, { ...guest, avatarId: 42 }])).toBeNull()
    expect(parsePlayers([host, { ...guest, id: '' }])).toBeNull()
    expect(parsePlayers(seats(TELEPHONE_MAX_PLAYERS + 1))).toBeNull()
  })
})
