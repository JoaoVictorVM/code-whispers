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
}))

const { hostRoom, joinRoomByCode, leaveRoom, getActiveRoom, JOIN_TIMEOUT_MS, SIGNALING_TIMEOUT_MS } =
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

describe('room lifecycle', () => {
  beforeEach(() => {
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
  })

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
    expect(trystero.joinRoom).toHaveBeenCalledWith({ appId: 'code-whispers' }, room?.code)
  })

  it('test_host_accepts_first_hello_and_sends_welcome', () => {
    hostRoom(host, 5)
    receive('hello', guest, 'peer-a')
    expect(lastRoom().actions.welcome.send).toHaveBeenCalledWith(
      { nickname: 'João', avatarId: 1, mode: 5 },
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

  it('test_joinRoomByCode_sends_hello_on_join', () => {
    joinRoomByCode(guest, ' ab3xyz ')
    expect(trystero.joinRoom).toHaveBeenCalledWith({ appId: 'code-whispers' }, 'AB3XYZ')
    lastRoom().onPeerJoin?.('host-peer')
    expect(lastRoom().actions.hello.send).toHaveBeenCalledTimes(1)
    expect(lastRoom().actions.hello.send).toHaveBeenCalledWith(guest, { target: 'host-peer' })
  })

  it('test_guest_receives_welcome_and_updates_gameState', () => {
    joinRoomByCode(guest, 'AB3XYZ')
    receive('welcome', { ...host, mode: 7 }, 'host-peer')
    const state = gameState.get()
    expect(state.room).toEqual({ code: 'AB3XYZ', role: 'guest', mode: 7 })
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

  it('test_hello_payload_uses_F02_profile', () => {
    gameState.patch({ localPlayer: { nickname: 'Perfil', avatarId: 6 } })
    const profile = gameState.get().localPlayer!
    joinRoomByCode(profile, 'AB3XYZ')
    lastRoom().onPeerJoin?.('host-peer')
    expect(lastRoom().actions.hello.send).toHaveBeenCalledWith(profile, { target: 'host-peer' })
    leaveRoom()
    hostRoom(profile, 3)
    receive('hello', guest, 'peer-a')
    expect(lastRoom().actions.welcome.send).toHaveBeenCalledWith({ ...profile, mode: 3 }, { target: 'peer-a' })
  })

  it('test_room_session_shape_available_for_F04', () => {
    joinRoomByCode(guest, 'AB3XYZ')
    receive('welcome', { ...host, mode: 5 }, 'host-peer')
    expect(gameState.get().room).toStrictEqual({ code: 'AB3XYZ', role: 'guest', mode: 5 })
    expect(getActiveRoom()).toBe(lastRoom())
    expect(typeof getActiveRoom()?.makeAction).toBe('function')
  })

  it('test_room_session_and_remote_profile_available_for_F09', () => {
    gameState.patch({ localPlayer: host })
    hostRoom(host, 7)
    receive('hello', guest, 'peer-a')
    const { localPlayer, remotePlayer, room } = gameState.get()
    expect(localPlayer).toEqual(host)
    expect(remotePlayer).toEqual(guest)
    expect(room?.mode).toBe(7)
  })
})
