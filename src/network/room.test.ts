import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gameState } from '../state/gameState'
import type { PlayerProfile } from '../types/game'

interface FakeAction {
  send: ReturnType<typeof vi.fn>
  onMessage: ((data: unknown, context: { peerId: string }) => void) | null
}

interface FakeRoom {
  actions: Record<string, FakeAction>
  makeAction: (name: string) => FakeAction
  leave: ReturnType<typeof vi.fn>
  onPeerJoin: ((peerId: string) => void) | null
  onPeerLeave: ((peerId: string) => void) | null
}

const trystero = vi.hoisted(() => ({
  rooms: [] as FakeRoom[],
  relayOpen: true,
  joinRoom: vi.fn(),
  getRelaySockets: vi.fn(),
}))

vi.mock('trystero/nostr', () => ({
  joinRoom: trystero.joinRoom,
  getRelaySockets: trystero.getRelaySockets,
  selfId: 'self-peer',
}))

const {
  hostRoom,
  hostTelephoneRoom,
  startTelephoneMatch,
  joinRoomByCode,
  leaveRoom,
  getActiveRoom,
  JOIN_TIMEOUT_MS,
  SIGNALING_TIMEOUT_MS,
  NOSTR_RELAY_URLS,
} =
  await import('./room')

function createFakeRoom(): FakeRoom {
  const room: FakeRoom = {
    actions: {},
    makeAction(name) {
      const action: FakeAction = { send: vi.fn().mockResolvedValue(undefined), onMessage: null }
      room.actions[name] = action
      return action
    },
    leave: vi.fn().mockResolvedValue(undefined),
    onPeerJoin: null,
    onPeerLeave: null,
  }
  return room
}

function lastRoom(): FakeRoom {
  return trystero.rooms[trystero.rooms.length - 1]
}

function receive(action: string, data: unknown, peerId: string): void {
  lastRoom().actions[action].onMessage?.(data, { peerId })
}

const host: PlayerProfile = { nickname: 'João', avatarId: 1 }
const guest: PlayerProfile = { nickname: 'Maria', avatarId: 4 }

function resetFakeTrystero(): void {
  vi.useFakeTimers()
  gameState.reset()
  trystero.rooms.length = 0
  trystero.relayOpen = true
  trystero.joinRoom.mockReset().mockImplementation(() => {
    const room = createFakeRoom()
    trystero.rooms.push(room)
    return room
  })
  trystero.getRelaySockets.mockReset().mockImplementation(() => ({
    'wss://relay': { readyState: trystero.relayOpen ? WebSocket.OPEN : WebSocket.CONNECTING },
  }))
}

describe('room lifecycle', () => {
  beforeEach(resetFakeTrystero)

  afterEach(() => {
    leaveRoom()
    vi.useRealTimers()
  })

  it('test_hostRoom_generates_code_and_sets_gameState', () => {
    hostRoom(host, 3)
    const { room, connection } = gameState.get()
    expect(room?.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    expect(room?.role).toBe('host')
    expect(room?.mode).toBe(3)
    expect(connection.status).toBe('connecting')
    expect(trystero.joinRoom).toHaveBeenCalledWith(
      { appId: 'code-whispers', relayConfig: { urls: NOSTR_RELAY_URLS } },
      room?.code,
    )
  })

  it('test_host_accepts_first_hello_and_sends_welcome', () => {
    hostRoom(host, 5)
    receive('hello', guest, 'peer-a')
    expect(lastRoom().actions.welcome.send).toHaveBeenCalledWith(
      { nickname: 'João', avatarId: 1, kind: 'duel', mode: 5 },
      { target: 'peer-a' },
    )
    const state = gameState.get()
    expect(state.remotePlayer).toEqual(guest)
    expect(state.connection.status).toBe('connected')
    expect(state.screen).toBe('code')
    expect(state.round).toBe(1)
    expect(state.mode).toBe(5)
  })

  it('test_host_rejects_second_hello_with_room_full', () => {
    hostRoom(host, 3)
    receive('hello', guest, 'peer-a')
    receive('hello', { nickname: 'Intruso', avatarId: 2 }, 'peer-b')
    const room = lastRoom()
    expect(room.actions.room_full.send).toHaveBeenCalledTimes(1)
    expect(room.actions.room_full.send).toHaveBeenCalledWith({}, { target: 'peer-b' })
    expect(room.actions.welcome.send).toHaveBeenCalledTimes(1)
    expect(gameState.get().remotePlayer).toEqual(guest)
  })

  it('host ignores malformed hello payloads', () => {
    hostRoom(host, 3)
    receive('hello', { nickname: 'A', avatarId: 1 }, 'peer-a')
    receive('hello', { nickname: 'Valido', avatarId: 99 }, 'peer-a')
    expect(lastRoom().actions.welcome.send).not.toHaveBeenCalled()
    expect(gameState.get().connection.status).toBe('connecting')
  })

  it('host waits for a relay before showing the code', () => {
    trystero.relayOpen = false
    hostRoom(host, 3)
    expect(gameState.get().room).toBeNull()
    expect(gameState.get().connection.status).toBe('connecting')
    trystero.relayOpen = true
    vi.advanceTimersByTime(300)
    expect(gameState.get().room?.role).toBe('host')
  })

  it('host reports signaling error when no relay connects in time', () => {
    trystero.relayOpen = false
    hostRoom(host, 3)
    vi.advanceTimersByTime(SIGNALING_TIMEOUT_MS + 500)
    expect(gameState.get().connection.error?.type).toBe('signaling')
    expect(gameState.get().room).toBeNull()
    expect(lastRoom().leave).toHaveBeenCalled()
  })

  it('host reports signaling error when joinRoom throws', () => {
    trystero.joinRoom.mockImplementation(() => {
      throw new Error('no relays')
    })
    hostRoom(host, 3)
    expect(gameState.get().connection.error?.type).toBe('signaling')
    expect(gameState.get().connection.status).toBe('idle')
  })

  it('uses the fixed list of nostr relays', () => {
    expect(NOSTR_RELAY_URLS.length).toBeGreaterThanOrEqual(3)
    expect(NOSTR_RELAY_URLS.every((url) => url.startsWith('wss://'))).toBe(true)
    hostRoom(host, 3)
    expect(trystero.joinRoom.mock.calls[0][0].relayConfig.urls).toBe(NOSTR_RELAY_URLS)
  })

  it('test_joinRoomByCode_sends_hello_on_join', () => {
    joinRoomByCode(guest, ' ab3xyz ')
    expect(trystero.joinRoom).toHaveBeenCalledWith(
      { appId: 'code-whispers', relayConfig: { urls: NOSTR_RELAY_URLS } },
      'AB3XYZ',
    )
    lastRoom().onPeerJoin?.('host-peer')
    expect(lastRoom().actions.hello.send).toHaveBeenCalledTimes(1)
    expect(lastRoom().actions.hello.send).toHaveBeenCalledWith(guest, { target: 'host-peer' })
  })

  it('test_guest_receives_welcome_and_updates_gameState', () => {
    joinRoomByCode(guest, 'AB3XYZ')
    receive('welcome', { ...host, mode: 7 }, 'host-peer')
    const state = gameState.get()
    expect(state.room).toEqual({ code: 'AB3XYZ', role: 'guest', kind: 'duel', mode: 7 })
    expect(state.mode).toBe(7)
    expect(state.remotePlayer).toEqual(host)
    expect(state.connection.status).toBe('connected')
    expect(state.screen).toBe('code')
  })

  it('test_guest_times_out_without_welcome', () => {
    joinRoomByCode(guest, 'AB3XYZ')
    vi.advanceTimersByTime(JOIN_TIMEOUT_MS - 1)
    expect(gameState.get().connection.status).toBe('connecting')
    vi.advanceTimersByTime(1)
    expect(gameState.get().connection.error?.type).toBe('not-found')
    expect(lastRoom().leave).toHaveBeenCalled()
  })

  it('welcome cancels the join timeout', () => {
    joinRoomByCode(guest, 'AB3XYZ')
    receive('welcome', { ...host, mode: 3 }, 'host-peer')
    vi.advanceTimersByTime(JOIN_TIMEOUT_MS * 2)
    expect(gameState.get().connection.status).toBe('connected')
  })

  it('test_guest_receives_room_full', () => {
    joinRoomByCode(guest, 'AB3XYZ')
    receive('room_full', {}, 'host-peer')
    expect(gameState.get().connection.error?.type).toBe('room-full')
    expect(gameState.get().connection.error?.message).toContain('Sala cheia')
    expect(lastRoom().leave).toHaveBeenCalled()
  })

  it('test_onPeerLeave_sets_disconnected', () => {
    hostRoom(host, 3)
    receive('hello', guest, 'peer-a')
    lastRoom().onPeerLeave?.('peer-b')
    expect(gameState.get().connection.status).toBe('connected')
    lastRoom().onPeerLeave?.('peer-a')
    expect(gameState.get().connection.status).toBe('disconnected')
  })

  it('test_leaveRoom_resets_state', () => {
    hostRoom(host, 3)
    receive('hello', guest, 'peer-a')
    const room = lastRoom()
    leaveRoom()
    const state = gameState.get()
    expect(state.room).toBeNull()
    expect(state.remotePlayer).toBeNull()
    expect(state.connection).toEqual({ status: 'idle', error: null })
    expect(room.leave).toHaveBeenCalled()
    expect(getActiveRoom()).toBeNull()
  })

  it('ignores callbacks from a room that was already left', () => {
    joinRoomByCode(guest, 'AB3XYZ')
    const stale = lastRoom()
    leaveRoom()
    stale.actions.welcome.onMessage?.({ ...host, mode: 3 }, { peerId: 'host-peer' })
    expect(gameState.get().connection.status).toBe('idle')
    expect(gameState.get().remotePlayer).toBeNull()
  })

  it('test_hello_and_welcome_payloads_use_local_profile', () => {
    gameState.patch({ localPlayer: { nickname: 'Perfil', avatarId: 6 } })
    const profile = gameState.get().localPlayer!
    joinRoomByCode(profile, 'AB3XYZ')
    lastRoom().onPeerJoin?.('host-peer')
    expect(lastRoom().actions.hello.send).toHaveBeenCalledWith(profile, { target: 'host-peer' })
    leaveRoom()
    hostRoom(profile, 3)
    receive('hello', guest, 'peer-a')
    expect(lastRoom().actions.welcome.send).toHaveBeenCalledWith({ ...profile, kind: 'duel', mode: 3 }, { target: 'peer-a' })
  })

  it('test_room_session_and_handle_available_for_match_sync', () => {
    joinRoomByCode(guest, 'AB3XYZ')
    receive('welcome', { ...host, mode: 5 }, 'host-peer')
    expect(gameState.get().room).toStrictEqual({ code: 'AB3XYZ', role: 'guest', kind: 'duel', mode: 5 })
    expect(getActiveRoom()).toBe(lastRoom())
    expect(typeof getActiveRoom()?.makeAction).toBe('function')
  })

  it('test_room_session_and_remote_profile_available_for_summary', () => {
    gameState.patch({ localPlayer: host })
    hostRoom(host, 7)
    receive('hello', guest, 'peer-a')
    const { localPlayer, remotePlayer, room } = gameState.get()
    expect(localPlayer).toEqual(host)
    expect(remotePlayer).toEqual(guest)
    expect(room?.mode).toBe(7)
  })
})

const telephonePlayers = [
  { id: 'host-peer', ...host, isHost: true },
  { id: 'self-peer', ...guest, isHost: false },
]

const threeSeats = [...telephonePlayers, { id: 'peer-b', nickname: 'Gui', avatarId: 3, isHost: false }]

describe('telephone room', () => {
  beforeEach(resetFakeTrystero)

  afterEach(() => {
    leaveRoom()
    vi.useRealTimers()
  })

  it('host opens the waiting room once a relay is ready', () => {
    trystero.relayOpen = false
    hostTelephoneRoom(host)
    expect(gameState.get().screen).toBe('inicio')
    expect(gameState.get().connection.status).toBe('connecting')
    trystero.relayOpen = true
    vi.advanceTimersByTime(300)
    const { screen, room, lobby, connection } = gameState.get()
    expect(screen).toBe('sala')
    expect(room).toMatchObject({ role: 'host', kind: 'telephone' })
    expect(room?.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    expect(lobby).toEqual({
      selfId: 'self-peer',
      hostId: 'self-peer',
      players: [{ id: 'self-peer', ...host, isHost: true }],
      stage: 'lobby',
      departedNickname: null,
    })
    expect(connection).toEqual({ status: 'connected', error: null })
  })

  it('host reports a signaling error when no relay connects in time', () => {
    trystero.relayOpen = false
    hostTelephoneRoom(host)
    vi.advanceTimersByTime(SIGNALING_TIMEOUT_MS + 500)
    expect(gameState.get().connection.error?.type).toBe('signaling')
    expect(gameState.get().lobby).toBeNull()
  })

  it('host seats guests in arrival order and broadcasts the list', () => {
    hostTelephoneRoom(host)
    receive('hello', guest, 'peer-a')
    receive('hello', { nickname: 'Gui', avatarId: 3 }, 'peer-b')
    const players = [
      { id: 'self-peer', ...host, isHost: true },
      { id: 'peer-a', ...guest, isHost: false },
      { id: 'peer-b', nickname: 'Gui', avatarId: 3, isHost: false },
    ]
    expect(gameState.get().lobby?.players).toEqual(players)
    expect(lastRoom().actions.welcome.send).toHaveBeenLastCalledWith(
      { kind: 'telephone', ...host, players },
      { target: 'peer-b' },
    )
    expect(lastRoom().actions.tel_lobby.send).toHaveBeenLastCalledWith({ players })
  })

  it('host welcomes a repeated hello again without seating it twice', () => {
    hostTelephoneRoom(host)
    receive('hello', guest, 'peer-a')
    receive('hello', guest, 'peer-a')
    expect(gameState.get().lobby?.players).toHaveLength(2)
    expect(lastRoom().actions.welcome.send).toHaveBeenCalledTimes(2)
  })

  it('host ignores malformed hello payloads', () => {
    hostTelephoneRoom(host)
    receive('hello', { nickname: 'x', avatarId: 1 }, 'peer-a')
    expect(gameState.get().lobby?.players).toHaveLength(1)
    expect(lastRoom().actions.welcome.send).not.toHaveBeenCalled()
  })

  it('host rejects the ninth player as a full room', () => {
    hostTelephoneRoom(host)
    for (let index = 1; index <= 7; index += 1) {
      receive('hello', { nickname: `Jogador ${index}`, avatarId: index }, `peer-${index}`)
    }
    receive('hello', guest, 'peer-late')
    expect(gameState.get().lobby?.players).toHaveLength(8)
    expect(lastRoom().actions.room_full.send).toHaveBeenCalledWith({ capacity: 8 }, { target: 'peer-late' })
  })

  it('host rejects new players once the match has started', () => {
    hostTelephoneRoom(host)
    receive('hello', guest, 'peer-a')
    const lobby = gameState.get().lobby!
    gameState.patch({ lobby: { ...lobby, stage: 'playing' } })
    receive('hello', { nickname: 'Gui', avatarId: 3 }, 'peer-b')
    expect(lastRoom().actions.in_progress.send).toHaveBeenCalledWith({}, { target: 'peer-b' })
    expect(gameState.get().lobby?.players).toHaveLength(2)
  })

  it('guest enters the waiting room on a telephone welcome', () => {
    joinRoomByCode(guest, 'AB3XYZ')
    receive('welcome', { kind: 'telephone', ...host, players: telephonePlayers }, 'host-peer')
    const { screen, room, lobby, connection } = gameState.get()
    expect(screen).toBe('sala')
    expect(room).toEqual({ code: 'AB3XYZ', role: 'guest', kind: 'telephone', mode: 3 })
    expect(lobby).toEqual({
      selfId: 'self-peer',
      hostId: 'host-peer',
      players: telephonePlayers,
      stage: 'lobby',
      departedNickname: null,
    })
    expect(connection).toEqual({ status: 'connected', error: null })
    vi.advanceTimersByTime(JOIN_TIMEOUT_MS + 100)
    expect(gameState.get().connection.error).toBeNull()
  })

  it('guest ignores a telephone welcome that does not seat it', () => {
    joinRoomByCode(guest, 'AB3XYZ')
    receive('welcome', { kind: 'telephone', ...host, players: telephonePlayers.slice(0, 1) }, 'host-peer')
    receive('welcome', { kind: 'telephone', ...host, players: telephonePlayers }, 'other-peer')
    expect(gameState.get().screen).toBe('inicio')
    expect(gameState.get().lobby).toBeNull()
  })

  it('guest follows list broadcasts from the host only', () => {
    joinRoomByCode(guest, 'AB3XYZ')
    receive('welcome', { kind: 'telephone', ...host, players: telephonePlayers }, 'host-peer')
    const grown = [...telephonePlayers, { id: 'peer-b', nickname: 'Gui', avatarId: 3, isHost: false }]
    receive('tel_lobby', { players: grown }, 'peer-b')
    expect(gameState.get().lobby?.players).toEqual(telephonePlayers)
    receive('tel_lobby', { players: grown }, 'host-peer')
    expect(gameState.get().lobby?.players).toEqual(grown)
    receive('tel_lobby', { players: 'broken' }, 'host-peer')
    expect(gameState.get().lobby?.players).toEqual(grown)
  })

  it('guest shows the telephone full room message', () => {
    joinRoomByCode(guest, 'AB3XYZ')
    receive('room_full', { capacity: 8 }, 'host-peer')
    expect(gameState.get().connection.error).toEqual({
      type: 'room-full',
      message: 'Sala cheia: essa sala já tem 8 jogadores.',
    })
  })

  it('guest shows the match in progress message', () => {
    joinRoomByCode(guest, 'AB3XYZ')
    receive('in_progress', {}, 'host-peer')
    const { screen, connection } = gameState.get()
    expect(screen).toBe('inicio')
    expect(connection.error).toEqual({
      type: 'in-progress',
      message: 'Essa partida já começou. Espere o grupo voltar para a sala de espera.',
    })
  })

  it('host starts only with at least three players and locks the room', () => {
    hostTelephoneRoom(host)
    receive('hello', guest, 'peer-a')
    expect(startTelephoneMatch()).toBe(false)
    expect(lastRoom().actions.tel_start.send).not.toHaveBeenCalled()
    receive('hello', { nickname: 'Gui', avatarId: 3 }, 'peer-b')
    expect(startTelephoneMatch()).toBe(true)
    const { screen, lobby } = gameState.get()
    expect(screen).toBe('etapa')
    expect(lobby?.stage).toBe('playing')
    expect(lastRoom().actions.tel_start.send).toHaveBeenCalledWith({ players: lobby?.players })
    expect(startTelephoneMatch()).toBe(false)
    receive('hello', { nickname: 'Breno', avatarId: 5 }, 'peer-c')
    expect(lastRoom().actions.in_progress.send).toHaveBeenCalledWith({}, { target: 'peer-c' })
  })

  it('guests cannot start the match', () => {
    joinRoomByCode(guest, 'AB3XYZ')
    receive('welcome', { kind: 'telephone', ...host, players: threeSeats }, 'host-peer')
    expect(startTelephoneMatch()).toBe(false)
    expect(gameState.get().lobby?.stage).toBe('lobby')
  })

  it('guest follows the start broadcast from the host', () => {
    joinRoomByCode(guest, 'AB3XYZ')
    receive('welcome', { kind: 'telephone', ...host, players: threeSeats }, 'host-peer')
    receive('tel_start', { players: threeSeats }, 'peer-b')
    expect(gameState.get().screen).toBe('sala')
    receive('tel_start', { players: telephonePlayers }, 'host-peer')
    expect(gameState.get().screen).toBe('sala')
    receive('tel_start', { players: threeSeats }, 'host-peer')
    expect(gameState.get().screen).toBe('etapa')
    expect(gameState.get().lobby).toMatchObject({ stage: 'playing', players: threeSeats })
  })

  it('a guest leaving the waiting room is only removed from the list', () => {
    hostTelephoneRoom(host)
    receive('hello', guest, 'peer-a')
    receive('hello', { nickname: 'Gui', avatarId: 3 }, 'peer-b')
    lastRoom().onPeerLeave?.('peer-a')
    const remaining = [
      { id: 'self-peer', ...host, isHost: true },
      { id: 'peer-b', nickname: 'Gui', avatarId: 3, isHost: false },
    ]
    expect(gameState.get().lobby?.players).toEqual(remaining)
    expect(lastRoom().actions.tel_lobby.send).toHaveBeenLastCalledWith({ players: remaining })
    expect(gameState.get().connection.status).toBe('connected')
  })

  it('a guest leaving during the match ends it for everyone', () => {
    hostTelephoneRoom(host)
    receive('hello', guest, 'peer-a')
    receive('hello', { nickname: 'Gui', avatarId: 3 }, 'peer-b')
    startTelephoneMatch()
    lastRoom().onPeerLeave?.('peer-b')
    expect(lastRoom().actions.tel_ended.send).toHaveBeenCalledWith({ nickname: 'Gui' })
    expect(gameState.get().connection.status).toBe('disconnected')
    expect(gameState.get().lobby?.departedNickname).toBe('Gui')
  })

  it('a guest leaving during the reveal is only removed from the list', () => {
    hostTelephoneRoom(host)
    receive('hello', guest, 'peer-a')
    receive('hello', { nickname: 'Gui', avatarId: 3 }, 'peer-b')
    startTelephoneMatch()
    gameState.patch({ lobby: { ...gameState.get().lobby!, stage: 'reveal' } })
    lastRoom().onPeerLeave?.('peer-b')
    expect(lastRoom().actions.tel_ended.send).not.toHaveBeenCalled()
    expect(gameState.get().lobby?.players).toHaveLength(2)
    expect(gameState.get().connection.status).toBe('connected')
  })

  it('guest disconnects when the host ends the match', () => {
    joinRoomByCode(guest, 'AB3XYZ')
    receive('welcome', { kind: 'telephone', ...host, players: threeSeats }, 'host-peer')
    receive('tel_ended', { nickname: 'Gui' }, 'host-peer')
    expect(gameState.get().connection.status).toBe('connected')
    receive('tel_start', { players: threeSeats }, 'host-peer')
    receive('tel_ended', { nickname: 'Gui' }, 'peer-b')
    expect(gameState.get().connection.status).toBe('connected')
    receive('tel_ended', { nickname: 'Gui' }, 'host-peer')
    expect(gameState.get().connection.status).toBe('disconnected')
    expect(gameState.get().lobby?.departedNickname).toBe('Gui')
  })

  it('guest reacts only to the host leaving', () => {
    joinRoomByCode(guest, 'AB3XYZ')
    receive('welcome', { kind: 'telephone', ...host, players: threeSeats }, 'host-peer')
    lastRoom().onPeerLeave?.('peer-b')
    expect(gameState.get().connection.status).toBe('connected')
    lastRoom().onPeerLeave?.('host-peer')
    expect(gameState.get().connection.status).toBe('disconnected')
    expect(gameState.get().lobby?.departedNickname).toBe('João')
  })

  it('starting or leaving a telephone room clears the step state', () => {
    hostTelephoneRoom(host)
    receive('hello', guest, 'peer-a')
    receive('hello', { nickname: 'Gui', avatarId: 3 }, 'peer-b')
    const leftover = { step: 2, totalSteps: 3, stepKind: 'code' as const, received: null, readyIds: [], localReady: true, chains: null, revealCursor: { chain: 0, entry: 0 } }
    gameState.patch({ telephone: leftover })
    startTelephoneMatch()
    expect(gameState.get().telephone).toBeNull()
    gameState.patch({ telephone: leftover })
    leaveRoom()
    expect(gameState.get().telephone).toBeNull()
  })

  it('leaving the waiting room clears the lobby', () => {
    hostTelephoneRoom(host)
    leaveRoom()
    expect(gameState.get().lobby).toBeNull()
    expect(gameState.get().room).toBeNull()
    expect(lastRoom().leave).toHaveBeenCalled()
  })
})
