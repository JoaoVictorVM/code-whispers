import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LobbyPlayer } from '../types/game'

const room = vi.hoisted(() => ({
  leaveRoom: vi.fn(),
  startTelephoneMatch: vi.fn(),
  CONNECTION_ERROR_MESSAGES: { clipboard: 'Não foi possível copiar — selecione o código manualmente.' },
}))

vi.mock('../network/room', () => room)

const { gameState } = await import('../state/gameState')
const { default: sala, missingPlayersHint } = await import('./sala')

const players: LobbyPlayer[] = [
  { id: 'host-peer', nickname: 'João', avatarId: 1, isHost: true },
  { id: 'peer-gui', nickname: 'Gui', avatarId: 3, isHost: false },
  { id: 'peer-breno', nickname: 'Breno', avatarId: 5, isHost: false },
]

let root: HTMLElement

function query<T extends HTMLElement>(role: string): T {
  return root.querySelector<T>(`[data-role="${role}"]`)!
}

function enterLobby(selfId: string, seated: LobbyPlayer[]): void {
  gameState.patch({
    screen: 'sala',
    room: { code: 'AB3XYZ', role: selfId === 'host-peer' ? 'host' : 'guest', kind: 'telephone', mode: 3 },
    lobby: { selfId, hostId: 'host-peer', players: seated, stage: 'lobby', departedNickname: null },
    connection: { status: 'connected', error: null },
  })
}

describe('waiting room screen', () => {
  beforeEach(() => {
    gameState.reset()
    room.leaveRoom.mockReset()
    room.startTelephoneMatch.mockReset()
    document.body.innerHTML = '<div id="app"></div>'
    root = document.querySelector<HTMLElement>('#app')!
  })

  afterEach(() => {
    sala.unmount()
  })

  it('shows the code, the counter and eight seats', () => {
    enterLobby('host-peer', players.slice(0, 2))
    sala.mount(root)
    expect(query('room-code').textContent).toBe('AB3XYZ')
    expect(query('player-count').textContent).toBe('2/8 jogadores')
    expect(root.querySelectorAll('[data-role="seat"]')).toHaveLength(2)
    expect(root.querySelectorAll('[data-role="empty-seat"]')).toHaveLength(6)
  })

  it('keeps seats in the host order', () => {
    enterLobby('host-peer', players)
    sala.mount(root)
    const names = Array.from(root.querySelectorAll('[data-role="seat-nickname"]'), (node) => node.textContent)
    expect(names).toEqual(['João', 'Gui', 'Breno'])
  })

  it('marks the host and the local player', () => {
    enterLobby('peer-gui', players)
    sala.mount(root)
    const [hostSeat, selfSeat, otherSeat] = Array.from(root.querySelectorAll<HTMLElement>('[data-role="seat"]'))
    expect(hostSeat.textContent).toContain('Host')
    expect(hostSeat.textContent).not.toContain('Você')
    expect(selfSeat.textContent).toContain('Você')
    expect(otherSeat.textContent).not.toContain('Você')
  })

  it('unlocks the start button only with three players', () => {
    enterLobby('host-peer', players.slice(0, 2))
    sala.mount(root)
    const start = query<HTMLButtonElement>('start-match')
    expect(start.hidden).toBe(false)
    expect(start.disabled).toBe(true)
    expect(query('start-hint').textContent).toBe('Falta 1 jogador')
    gameState.patch({ lobby: { ...gameState.get().lobby!, players } })
    expect(start.disabled).toBe(false)
    expect(query('start-hint').hidden).toBe(true)
    start.click()
    expect(room.startTelephoneMatch).toHaveBeenCalledTimes(1)
  })

  it('shows guests a waiting label instead of the start button', () => {
    enterLobby('peer-gui', players)
    sala.mount(root)
    expect(query('start-match').hidden).toBe(true)
    expect(query('waiting-host').hidden).toBe(false)
    expect(query('waiting-host').textContent).toBe('Esperando João começar…')
    expect(query('leave-room').textContent).toBe('Sair da sala')
  })

  it('updates the seats when the list changes', () => {
    enterLobby('host-peer', players)
    sala.mount(root)
    gameState.patch({ lobby: { ...gameState.get().lobby!, players: [players[0], players[2]] } })
    expect(query('player-count').textContent).toBe('2/8 jogadores')
    expect(root.querySelectorAll('[data-role="seat"]')).toHaveLength(2)
    expect(query('start-hint').textContent).toBe('Falta 1 jogador')
  })

  it('leaves the room and returns home', () => {
    enterLobby('host-peer', players)
    sala.mount(root)
    expect(query('leave-room').textContent).toBe('Encerrar sala')
    query<HTMLButtonElement>('leave-room').click()
    expect(room.leaveRoom).toHaveBeenCalledTimes(1)
    expect(gameState.get().screen).toBe('inicio')
  })

  it('words the missing players hint in singular and plural', () => {
    expect(missingPlayersHint(1)).toBe('Falta 1 jogador')
    expect(missingPlayersHint(2)).toBe('Faltam 2 jogadores')
  })
})
