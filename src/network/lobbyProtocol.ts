import { AVATAR_IDS, validateNickname } from '../state/profile'
import type { LobbyPlayer } from '../types/game'

export const TELEPHONE_MIN_PLAYERS = 3
export const TELEPHONE_MAX_PLAYERS = 8

export function addPlayer(players: readonly LobbyPlayer[], player: LobbyPlayer): LobbyPlayer[] {
  if (players.some((seated) => seated.id === player.id)) return [...players]
  return [...players, player]
}

export function removePlayer(players: readonly LobbyPlayer[], id: string): LobbyPlayer[] {
  return players.filter((player) => player.id !== id)
}

export function isFull(players: readonly LobbyPlayer[]): boolean {
  return players.length >= TELEPHONE_MAX_PLAYERS
}

export function canStart(players: readonly LobbyPlayer[]): boolean {
  return players.length >= TELEPHONE_MIN_PLAYERS && players.length <= TELEPHONE_MAX_PLAYERS
}

export function missingPlayers(players: readonly LobbyPlayer[]): number {
  return Math.max(0, TELEPHONE_MIN_PLAYERS - players.length)
}

function parsePlayer(data: unknown): LobbyPlayer | null {
  if (typeof data !== 'object' || data === null) return null
  const { id, nickname, avatarId, isHost } = data as Record<string, unknown>
  if (typeof id !== 'string' || id === '') return null
  if (typeof nickname !== 'string' || typeof isHost !== 'boolean') return null
  if (typeof avatarId !== 'number' || !AVATAR_IDS.includes(avatarId)) return null
  const validation = validateNickname(nickname)
  if (!validation.valid) return null
  return { id, nickname: validation.trimmed, avatarId, isHost }
}

export function parsePlayers(data: unknown): LobbyPlayer[] | null {
  if (!Array.isArray(data) || data.length === 0 || data.length > TELEPHONE_MAX_PLAYERS) return null
  const players: LobbyPlayer[] = []
  for (const [index, entry] of data.entries()) {
    const player = parsePlayer(entry)
    if (!player || player.isHost !== (index === 0)) return null
    if (players.some((seated) => seated.id === player.id)) return null
    players.push(player)
  }
  return players
}
