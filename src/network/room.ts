import { getRelaySockets, joinRoom, selfId, type MessageAction, type Room } from 'trystero/nostr'
import { createMatchState, gameState } from '../state/gameState'
import { AVATAR_IDS, validateNickname } from '../state/profile'
import type {
  ConnectionErrorType,
  GameState,
  MatchMode,
  PlayerProfile,
  RoomRole,
} from '../types/game'
import { TELEPHONE_MAX_PLAYERS, addPlayer, canStart, isFull, parsePlayers, removePlayer } from './lobbyProtocol'
import { generateRoomCode, normalizeRoomCode } from './roomCode'

export const APP_ID = 'code-whispers'
export const NOSTR_RELAY_URLS = [
  'wss://nos.lol',
  'wss://bucket.coracle.social',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://relay.snort.social',
]
export const JOIN_TIMEOUT_MS = 10_000
export const SIGNALING_TIMEOUT_MS = 15_000
const SIGNALING_POLL_MS = 250
const MATCH_MODES: readonly MatchMode[] = [3, 5, 7]

export const CONNECTION_ERROR_MESSAGES: Record<ConnectionErrorType, string> = {
  'not-found': 'Sala não encontrada. Confira o código e tente de novo.',
  'room-full': 'Sala cheia — essa sala já tem 2 jogadores.',
  clipboard: 'Não foi possível copiar — selecione o código manualmente.',
  signaling: 'Não foi possível criar a sala. Verifique sua conexão e tente de novo.',
  'in-progress': 'Essa partida já começou. Espere o grupo voltar para a sala de espera.',
}

export const TELEPHONE_ROOM_FULL_MESSAGE = `Sala cheia: essa sala já tem ${TELEPHONE_MAX_PLAYERS} jogadores.`

type HelloPayload = { nickname: string; avatarId: number }
type SeatPayload = { id: string; nickname: string; avatarId: number; isHost: boolean }
type DuelWelcomePayload = HelloPayload & { kind: 'duel'; mode: MatchMode }
type TelephoneWelcomePayload = HelloPayload & { kind: 'telephone'; players: SeatPayload[] }
type WelcomePayload = DuelWelcomePayload | TelephoneWelcomePayload
type RoomFullPayload = { capacity?: number }
type PlayersPayload = { players: SeatPayload[] }
type EndedPayload = { nickname: string }
type EmptyPayload = Record<string, never>

interface Handshake {
  hello: MessageAction<HelloPayload>
  welcome: MessageAction<WelcomePayload>
  roomFull: MessageAction<RoomFullPayload>
  inProgress: MessageAction<EmptyPayload>
  telLobby: MessageAction<PlayersPayload>
  telStart: MessageAction<PlayersPayload>
  telEnded: MessageAction<EndedPayload>
}

let activeRoom: Room | null = null
let activeHandshake: Handshake | null = null
let opponentPeerId: string | null = null
let session = 0
const timers = new Set<ReturnType<typeof setTimeout>>()

export function getActiveRoom(): Room | null {
  return activeRoom
}

export function getOpponentPeerId(): string | null {
  return opponentPeerId
}

function schedule(callback: () => void, delay: number): void {
  const timer = setTimeout(() => {
    timers.delete(timer)
    callback()
  }, delay)
  timers.add(timer)
}

function clearTimers(): void {
  for (const timer of timers) clearTimeout(timer)
  timers.clear()
}

function teardown(): void {
  session += 1
  clearTimers()
  opponentPeerId = null
  activeHandshake = null
  const room = activeRoom
  activeRoom = null
  if (room) {
    room.onPeerJoin = null
    room.onPeerLeave = null
    room.leave().catch(() => undefined)
  }
}

function matchStartState(): Partial<GameState> {
  return { screen: 'code', ...createMatchState() }
}

function parseProfile(data: unknown): PlayerProfile | null {
  if (typeof data !== 'object' || data === null) return null
  const { nickname, avatarId } = data as Record<string, unknown>
  if (typeof nickname !== 'string' || typeof avatarId !== 'number') return null
  if (!AVATAR_IDS.includes(avatarId)) return null
  const validation = validateNickname(nickname)
  if (!validation.valid) return null
  return { nickname: validation.trimmed, avatarId }
}

function parseMode(data: unknown): MatchMode | null {
  if (typeof data !== 'object' || data === null) return null
  const { mode } = data as Record<string, unknown>
  return MATCH_MODES.find((candidate) => candidate === mode) ?? null
}

function fail(type: ConnectionErrorType, message = CONNECTION_ERROR_MESSAGES[type]): void {
  teardown()
  gameState.patch({
    room: null,
    remotePlayer: null,
    lobby: null,
    connection: { status: 'idle', error: { type, message } },
  })
}

function roomFullMessage(data: unknown): string {
  const capacity = typeof data === 'object' && data !== null ? (data as Record<string, unknown>).capacity : undefined
  return capacity === TELEPHONE_MAX_PLAYERS ? TELEPHONE_ROOM_FULL_MESSAGE : CONNECTION_ERROR_MESSAGES['room-full']
}

function isTelephoneWelcome(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as Record<string, unknown>).kind === 'telephone'
}

function isFromTelephoneHost(peerId: string): boolean {
  return opponentPeerId === peerId && gameState.get().room?.kind === 'telephone'
}

function acceptTelephoneHost(peerId: string, data: unknown, code: string): void {
  const players = parsePlayers((data as Record<string, unknown>).players)
  if (!parseProfile(data) || !players) return
  if (players[0].id !== peerId || !players.some((player) => player.id === selfId)) return
  opponentPeerId = peerId
  clearTimers()
  gameState.patch({
    ...matchStartState(),
    screen: 'sala',
    room: { code, role: 'guest', kind: 'telephone', mode: gameState.get().mode },
    remotePlayer: null,
    lobby: { selfId, hostId: peerId, players, stage: 'lobby', departedNickname: null },
    connection: { status: 'connected', error: null },
  })
}

function applyLobbyList(data: unknown): void {
  const lobby = gameState.get().lobby
  const players = parsePlayers(typeof data === 'object' && data !== null ? (data as Record<string, unknown>).players : null)
  if (!lobby || !players || players[0].id !== lobby.hostId) return
  if (!players.some((player) => player.id === lobby.selfId)) return
  gameState.patch({ lobby: { ...lobby, players } })
}

function openRoom(code: string, currentSession: number): { room: Room; handshake: Handshake } {
  const room = joinRoom({ appId: APP_ID, relayConfig: { urls: NOSTR_RELAY_URLS } }, code)
  activeRoom = room
  const handshake: Handshake = {
    hello: room.makeAction<HelloPayload>('hello'),
    welcome: room.makeAction<WelcomePayload>('welcome'),
    roomFull: room.makeAction<RoomFullPayload>('room_full'),
    inProgress: room.makeAction<EmptyPayload>('in_progress'),
    telLobby: room.makeAction<PlayersPayload>('tel_lobby'),
    telStart: room.makeAction<PlayersPayload>('tel_start'),
    telEnded: room.makeAction<EndedPayload>('tel_ended'),
  }
  activeHandshake = handshake
  room.onPeerLeave = (peerId) => {
    if (currentSession !== session) return
    const state = gameState.get()
    if (state.room?.kind === 'telephone' && state.room.role === 'host') {
      handleGuestDeparture(peerId)
      return
    }
    if (peerId !== opponentPeerId) return
    const departedNickname = state.lobby?.players.find((player) => player.id === peerId)?.nickname ?? null
    gameState.patch({
      connection: { status: 'disconnected', error: null },
      ...(state.lobby ? { lobby: { ...state.lobby, departedNickname } } : {}),
    })
  }
  return { room, handshake }
}

function hasOpenRelay(): boolean {
  const sockets = Object.values((getRelaySockets() ?? {}) as Record<string, WebSocket>)
  return sockets.some((socket) => socket.readyState === WebSocket.OPEN)
}

function acceptOpponent(
  peerId: string,
  remotePlayer: PlayerProfile,
  role: RoomRole,
  code: string,
  mode: MatchMode,
): void {
  opponentPeerId = peerId
  clearTimers()
  gameState.patch({
    ...matchStartState(),
    room: { code, role, kind: 'duel', mode },
    mode,
    remotePlayer,
    connection: { status: 'connected', error: null },
  })
}

export function hostRoom(profile: PlayerProfile, mode: MatchMode): void {
  teardown()
  const currentSession = session
  const code = generateRoomCode()
  gameState.patch({
    room: null,
    remotePlayer: null,
    lobby: null,
    connection: { status: 'connecting', error: null },
  })

  let handshake: Handshake
  try {
    handshake = openRoom(code, currentSession).handshake
  } catch {
    fail('signaling')
    return
  }

  handshake.hello.onMessage = (data, { peerId }) => {
    if (currentSession !== session) return
    if (opponentPeerId !== null && peerId !== opponentPeerId) {
      handshake.roomFull.send({}, { target: peerId }).catch(() => undefined)
      return
    }
    const remotePlayer = parseProfile(data)
    if (!remotePlayer) return
    handshake.welcome
      .send({ nickname: profile.nickname, avatarId: profile.avatarId, kind: 'duel', mode }, { target: peerId })
      .catch(() => undefined)
    if (opponentPeerId === peerId) return
    acceptOpponent(peerId, remotePlayer, 'host', code, mode)
  }

  whenRelayReady(currentSession, () => gameState.patch({ room: { code, role: 'host', kind: 'duel', mode }, mode }))
}

function whenRelayReady(currentSession: number, onReady: () => void): void {
  if (hasOpenRelay()) {
    onReady()
    return
  }

  const startedAt = Date.now()
  const waitForRelay = () => {
    if (currentSession !== session) return
    if (hasOpenRelay()) {
      onReady()
    } else if (Date.now() - startedAt >= SIGNALING_TIMEOUT_MS) {
      fail('signaling')
    } else {
      schedule(waitForRelay, SIGNALING_POLL_MS)
    }
  }
  schedule(waitForRelay, SIGNALING_POLL_MS)
}

export function hostTelephoneRoom(profile: PlayerProfile): void {
  teardown()
  const currentSession = session
  const code = generateRoomCode()
  gameState.patch({
    room: null,
    remotePlayer: null,
    lobby: null,
    connection: { status: 'connecting', error: null },
  })

  let handshake: Handshake
  try {
    handshake = openRoom(code, currentSession).handshake
  } catch {
    fail('signaling')
    return
  }

  handshake.hello.onMessage = (data, { peerId }) => {
    if (currentSession === session) seatGuest(handshake, profile, data, peerId)
  }

  whenRelayReady(currentSession, () => {
    gameState.patch({
      ...matchStartState(),
      screen: 'sala',
      room: { code, role: 'host', kind: 'telephone', mode: gameState.get().mode },
      remotePlayer: null,
      lobby: {
        selfId,
        hostId: selfId,
        players: [{ id: selfId, nickname: profile.nickname, avatarId: profile.avatarId, isHost: true }],
        stage: 'lobby',
        departedNickname: null,
      },
      connection: { status: 'connected', error: null },
    })
  })
}

function seatGuest(handshake: Handshake, profile: PlayerProfile, data: unknown, peerId: string): void {
  const lobby = gameState.get().lobby
  if (!lobby) return
  const guest = parseProfile(data)
  if (!guest) return
  const seated = lobby.players.some((player) => player.id === peerId)
  if (!seated && lobby.stage !== 'lobby') {
    handshake.inProgress.send({}, { target: peerId }).catch(() => undefined)
    return
  }
  if (!seated && isFull(lobby.players)) {
    handshake.roomFull.send({ capacity: TELEPHONE_MAX_PLAYERS }, { target: peerId }).catch(() => undefined)
    return
  }
  const players = addPlayer(lobby.players, { id: peerId, ...guest, isHost: false })
  gameState.patch({ lobby: { ...lobby, players } })
  handshake.welcome
    .send({ kind: 'telephone', nickname: profile.nickname, avatarId: profile.avatarId, players }, { target: peerId })
    .catch(() => undefined)
  handshake.telLobby.send({ players }).catch(() => undefined)
}

export function startTelephoneMatch(): boolean {
  const { room, lobby } = gameState.get()
  if (!activeHandshake || room?.kind !== 'telephone' || room.role !== 'host') return false
  if (!lobby || lobby.stage !== 'lobby' || !canStart(lobby.players)) return false
  activeHandshake.telStart.send({ players: lobby.players }).catch(() => undefined)
  gameState.patch({ screen: 'etapa', lobby: { ...lobby, stage: 'playing' } })
  return true
}

function applyMatchStart(data: unknown): void {
  const lobby = gameState.get().lobby
  const players = parsePlayers(typeof data === 'object' && data !== null ? (data as Record<string, unknown>).players : null)
  if (!lobby || lobby.stage !== 'lobby' || !players || !canStart(players)) return
  if (players[0].id !== lobby.hostId || !players.some((player) => player.id === lobby.selfId)) return
  gameState.patch({ screen: 'etapa', lobby: { ...lobby, players, stage: 'playing' } })
}

function handleGuestDeparture(peerId: string): void {
  const lobby = gameState.get().lobby
  const leaving = lobby?.players.find((player) => player.id === peerId && !player.isHost)
  if (!lobby || !leaving) return
  if (lobby.stage === 'playing') {
    activeHandshake?.telEnded.send({ nickname: leaving.nickname }).catch(() => undefined)
    gameState.patch({
      lobby: { ...lobby, departedNickname: leaving.nickname },
      connection: { status: 'disconnected', error: null },
    })
    return
  }
  const players = removePlayer(lobby.players, peerId)
  gameState.patch({ lobby: { ...lobby, players } })
  activeHandshake?.telLobby.send({ players }).catch(() => undefined)
}

function applyMatchEnded(data: unknown): void {
  const lobby = gameState.get().lobby
  const nickname = typeof data === 'object' && data !== null ? (data as Record<string, unknown>).nickname : null
  if (!lobby || lobby.stage !== 'playing' || typeof nickname !== 'string') return
  const validation = validateNickname(nickname)
  if (!validation.valid) return
  gameState.patch({
    lobby: { ...lobby, departedNickname: validation.trimmed },
    connection: { status: 'disconnected', error: null },
  })
}

export function getSelfId(): string {
  return selfId
}

export function joinRoomByCode(profile: PlayerProfile, rawCode: string): void {
  const code = normalizeRoomCode(rawCode)
  if (!code) return
  teardown()
  const currentSession = session
  gameState.patch({
    room: null,
    remotePlayer: null,
    lobby: null,
    connection: { status: 'connecting', error: null },
  })

  let opened: { room: Room; handshake: Handshake }
  try {
    opened = openRoom(code, currentSession)
  } catch {
    fail('not-found')
    return
  }
  const { room, handshake } = opened

  room.onPeerJoin = (peerId) => {
    if (currentSession !== session || opponentPeerId !== null) return
    handshake.hello
      .send({ nickname: profile.nickname, avatarId: profile.avatarId }, { target: peerId })
      .catch(() => undefined)
  }

  handshake.welcome.onMessage = (data, { peerId }) => {
    if (currentSession !== session || opponentPeerId !== null) return
    if (isTelephoneWelcome(data)) {
      acceptTelephoneHost(peerId, data, code)
      return
    }
    const remotePlayer = parseProfile(data)
    const mode = parseMode(data)
    if (!remotePlayer || mode === null) return
    acceptOpponent(peerId, remotePlayer, 'guest', code, mode)
  }

  handshake.roomFull.onMessage = (data) => {
    if (currentSession !== session || opponentPeerId !== null) return
    fail('room-full', roomFullMessage(data))
  }

  handshake.inProgress.onMessage = () => {
    if (currentSession !== session || opponentPeerId !== null) return
    fail('in-progress')
  }

  handshake.telLobby.onMessage = (data, { peerId }) => {
    if (currentSession === session && isFromTelephoneHost(peerId)) applyLobbyList(data)
  }

  handshake.telStart.onMessage = (data, { peerId }) => {
    if (currentSession === session && isFromTelephoneHost(peerId)) applyMatchStart(data)
  }

  handshake.telEnded.onMessage = (data, { peerId }) => {
    if (currentSession === session && isFromTelephoneHost(peerId)) applyMatchEnded(data)
  }

  schedule(() => {
    if (currentSession === session && opponentPeerId === null) fail('not-found')
  }, JOIN_TIMEOUT_MS)
}

export function leaveRoom(): void {
  teardown()
  gameState.patch({
    ...matchStartState(),
    screen: gameState.get().screen,
    room: null,
    remotePlayer: null,
    lobby: null,
    connection: { status: 'idle', error: null },
  })
}
