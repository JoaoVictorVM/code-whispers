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

  it('leaving the waiting room clears the lobby', () => {
    hostTelephoneRoom(host)
    leaveRoom()
    expect(gameState.get().lobby).toBeNull()
    expect(gameState.get().room).toBeNull()
    expect(lastRoom().leave).toHaveBeenCalled()
  })
})
