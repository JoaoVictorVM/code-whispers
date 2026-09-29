import type { MessageAction, Room } from 'trystero/nostr'
import { createMatchState, gameState } from '../state/gameState'
import type { GameState, RoundSubmissions, ScreenId } from '../types/game'
import { getActiveRoom, getOpponentPeerId } from './room'
import {
  applyVerdicts,
  isPlayPhase,
  nextPhase,
  pushPending,
  roundsForMode,
  stepIndex,
  takeApplicable,
  validateReadyPayload,
  type PendingMessage,
  type PlayPhase,
  type ReadyPayload,
  type ReadyPayloadByPhase,
} from './syncProtocol'

type ReadyMessage = { round: number; phase: PlayPhase; data: ReadyPayload }
type UnreadyMessage = { round: number; phase: PlayPhase }
type EmptyMessage = Record<string, never>

interface SyncActions {
  ready: MessageAction<ReadyMessage>
  unready: MessageAction<UnreadyMessage>
  rematch: MessageAction<EmptyMessage>
}

const PHASE_SCREENS: Record<PlayPhase, ScreenId> = {
  code: 'code',
  explain: 'explica',
  review: 'revisa',
}

let attachedRoom: Room | null = null
let actions: SyncActions | null = null
let localReady: ReadyPayload | null = null
let opponentReady: ReadyPayload | null = null
let pending: PendingMessage[] = []
let opponentRematchPending = false
let unsubscribe: (() => void) | null = null

function currentPlayPhase(state: GameState): PlayPhase | null {
  return isPlayPhase(state.phase) ? state.phase : null
}

function currentStep(state: GameState): number | null {
  const phase = currentPlayPhase(state)
  return phase ? stepIndex(state.round, phase) : null
}

function totalRounds(state: GameState): number {
  return roundsForMode(state.room?.mode ?? state.mode)
}

function resetTransport(): void {
  localReady = null
  opponentReady = null
  pending = []
  opponentRematchPending = false
}

function isFromOpponent(peerId: string): boolean {
  const opponent = getOpponentPeerId()
  return opponent === null || opponent === peerId
}

function parseEnvelope(data: unknown): { round: number; phase: PlayPhase } | null {
  if (typeof data !== 'object' || data === null) return null
  const { round, phase } = data as Record<string, unknown>
  if (typeof round !== 'number' || !Number.isInteger(round) || round < 1) return null
  if (!isPlayPhase(phase)) return null
  return { round, phase }
}

function roundSubmissions(state: GameState, phase: PlayPhase, local: ReadyPayload, remote: ReadyPayload): RoundSubmissions {
  const existing = state.submissions[state.round] ?? {}
  if (phase === 'code') {
    return {
      ...existing,
      localCode: local as ReadyPayloadByPhase['code'],
      remoteCode: remote as ReadyPayloadByPhase['code'],
    }
  }
  if (phase === 'explain') {
    return {
      ...existing,
      localExplanation: (local as ReadyPayloadByPhase['explain']).explanation,
      remoteExplanation: (remote as ReadyPayloadByPhase['explain']).explanation,
    }
  }
  return {
    ...existing,
    localVerdict: (local as ReadyPayloadByPhase['review']).verdict,
    remoteVerdict: (remote as ReadyPayloadByPhase['review']).verdict,
  }
}

function advance(): void {
  const state = gameState.get()
  const phase = currentPlayPhase(state)
  if (!phase || !localReady || !opponentReady) return

  const submissions = {
    ...state.submissions,
    [state.round]: roundSubmissions(state, phase, localReady, opponentReady),
  }
  const tallies =
    phase === 'review'
      ? applyVerdicts(
          state.tallies,
          (localReady as ReadyPayloadByPhase['review']).verdict,
          (opponentReady as ReadyPayloadByPhase['review']).verdict,
        )
      : state.tallies

  localReady = null
  opponentReady = null
  const next = nextPhase(state.round, phase, totalRounds(state))

  if (next === 'summary') {
    pending = []
    gameState.patch({
      screen: 'final',
      phase: 'summary',
      readyFlags: { local: false, opponent: false },
      rematchFlags: { local: false, opponent: opponentRematchPending },
      submissions,
      tallies,
    })
    opponentRematchPending = false
    return
  }

  gameState.patch({
    screen: PHASE_SCREENS[next.phase],
    round: next.round,
    phase: next.phase,
    readyFlags: { local: false, opponent: false },
    submissions,
    tallies,
  })
  drainPending()
}

function drainPending(): void {
  const step = currentStep(gameState.get())
  if (step === null) return
  const { applicable, rest } = takeApplicable(pending, step)
  pending = rest
  for (const message of applicable) {
    if (message.kind === 'ready' && message.data) applyOpponentReady(message.data)
    else applyOpponentUnready()
  }
}

function applyOpponentReady(data: ReadyPayload): void {
  opponentReady = data
  gameState.patch({ readyFlags: { ...gameState.get().readyFlags, opponent: true } })
  if (localReady) advance()
}

function applyOpponentUnready(): void {
  opponentReady = null
  gameState.patch({ readyFlags: { ...gameState.get().readyFlags, opponent: false } })
}

function buffer(message: PendingMessage): void {
  const result = pushPending(pending, message)
  pending = result.buffer
  if (result.dropped.length > 0) {
    console.warn('Code Whispers: mensagens futuras descartadas por excesso no buffer', result.dropped)
  }
}

function handleIncomingReady(data: unknown, peerId: string): void {
  if (!isFromOpponent(peerId)) return
  const envelope = parseEnvelope(data)
  if (!envelope) {
    console.warn('Code Whispers: mensagem ready malformada ignorada', data)
    return
  }
  const validation = validateReadyPayload(envelope.phase, (data as Record<string, unknown>).data)
  if (!validation.valid) {
    console.warn(`Code Whispers: payload de ready inválido ignorado (${validation.reason})`)
    return
  }
  const step = stepIndex(envelope.round, envelope.phase)
  const current = currentStep(gameState.get())
  if (current === null || step < current) return
  if (step > current) {
    buffer({ kind: 'ready', step, data: validation.value })
    return
  }
  applyOpponentReady(validation.value)
}

function handleIncomingUnready(data: unknown, peerId: string): void {
  if (!isFromOpponent(peerId)) return
  const envelope = parseEnvelope(data)
  if (!envelope) return
  const step = stepIndex(envelope.round, envelope.phase)
  const current = currentStep(gameState.get())
  if (current === null || step < current) return
  if (step > current) {
    buffer({ kind: 'unready', step })
    return
  }
  applyOpponentUnready()
}

function handleIncomingRematch(peerId: string): void {
  if (!isFromOpponent(peerId)) return
  const state = gameState.get()
  if (state.phase !== 'summary') {
    opponentRematchPending = true
    return
  }
  gameState.patch({ rematchFlags: { ...state.rematchFlags, opponent: true } })
  restartIfBothWantRematch()
}

function restartIfBothWantRematch(): void {
  const { rematchFlags } = gameState.get()
  if (!rematchFlags.local || !rematchFlags.opponent) return
  resetTransport()
  gameState.patch({ screen: 'code', ...createMatchState() })
}

function attach(room: Room): void {
  attachedRoom = room
  resetTransport()
  const ready = room.makeAction<ReadyMessage>('ready')
  const unready = room.makeAction<UnreadyMessage>('unready')
  const rematchAction = room.makeAction<EmptyMessage>('rematch')
  ready.onMessage = (data, { peerId }) => {
    if (attachedRoom === room) handleIncomingReady(data, peerId)
  }
  unready.onMessage = (data, { peerId }) => {
    if (attachedRoom === room) handleIncomingUnready(data, peerId)
  }
  rematchAction.onMessage = (_data, { peerId }) => {
    if (attachedRoom === room) handleIncomingRematch(peerId)
  }
  actions = { ready, unready, rematch: rematchAction }
}

function detach(): void {
  attachedRoom = null
  actions = null
  resetTransport()
}

function watch(state: GameState): void {
  const room = getActiveRoom()
  if (state.connection.status === 'connected' && state.room?.kind === 'duel' && room && room !== attachedRoom) {
    attach(room)
  } else if (!state.room && attachedRoom) {
    detach()
  }
}

export function startSync(): void {
  unsubscribe?.()
  unsubscribe = gameState.onChange(watch)
  watch(gameState.get())
}

export function stopSync(): void {
  unsubscribe?.()
  unsubscribe = null
  detach()
}

export function getTotalRounds(): number {
  return totalRounds(gameState.get())
}

export function ready<P extends PlayPhase>(payload: ReadyPayloadByPhase[P]): boolean {
  const state = gameState.get()
  const phase = currentPlayPhase(state)
  if (!phase || !actions || state.connection.status !== 'connected') return false
  const validation = validateReadyPayload(phase, payload)
  if (!validation.valid) return false
  localReady = validation.value
  actions.ready
    .send({ round: state.round, phase, data: validation.value })
    .catch(() => undefined)
  gameState.patch({ readyFlags: { ...state.readyFlags, local: true } })
  if (opponentReady) advance()
  return true
}

export function unready(): boolean {
  const state = gameState.get()
  const phase = currentPlayPhase(state)
  if (!phase || !actions || !localReady || opponentReady) return false
  localReady = null
  actions.unready.send({ round: state.round, phase }).catch(() => undefined)
  gameState.patch({ readyFlags: { ...state.readyFlags, local: false } })
  return true
}

export function rematch(): boolean {
  const state = gameState.get()
  if (state.phase !== 'summary' || !actions || state.rematchFlags.local) return false
  actions.rematch.send({}).catch(() => undefined)
  gameState.patch({ rematchFlags: { ...state.rematchFlags, local: true } })
  restartIfBothWantRematch()
  return true
}

startSync()
