import type { MessageAction, Room } from 'trystero/nostr'
import { gameState } from '../state/gameState'
import type { GameState, LobbyPlayer, StepKind } from '../types/game'
import { getActiveRoom } from './room'
import {
  answerPayload,
  appendStep,
  createChains,
  firstCursor,
  parseChains,
  parseProgress,
  parseStepMessage,
  stepInput,
  stepKind,
  validateAnswer,
  type AnswerPayload,
  type StepContent,
} from './telephoneProtocol'

type ProfilePayload = { nickname: string; avatarId: number }
type EntryPayload = { author: ProfilePayload; kind: StepKind; content: StepContent }
type ChainPayload = { owner: ProfilePayload; entries: EntryPayload[] }
type StepPayload = { step: number; total: number; kind: StepKind; received: StepContent | null }
type SubmitPayload = { step: number; answer: AnswerPayload }
type RetractPayload = { step: number }
type ProgressPayload = { step: number; readyIds: string[] }
type FinishPayload = { chains: ChainPayload[] }

interface TelephoneActions {
  step: MessageAction<StepPayload>
  submit: MessageAction<SubmitPayload>
  retract: MessageAction<RetractPayload>
  progress: MessageAction<ProgressPayload>
  finish: MessageAction<FinishPayload>
}

let attachedRoom: Room | null = null
let actions: TelephoneActions | null = null
let unsubscribe: (() => void) | null = null
let hostStep = -1
let hostChains: ChainPayload[] = []
let hostAnswers = new Map<number, StepContent>()

function resetHost(): void {
  hostStep = -1
  hostChains = []
  hostAnswers = new Map()
}

function isHost(state: GameState): boolean {
  return state.room?.kind === 'telephone' && state.room.role === 'host'
}

function isPlaying(state: GameState): boolean {
  return state.connection.status === 'connected' && state.lobby?.stage === 'playing'
}

function seatOf(players: readonly LobbyPlayer[], id: string): number {
  return players.findIndex((player) => player.id === id)
}

function asRecord(data: unknown): Record<string, unknown> | null {
  return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null
}

function readyIds(players: readonly LobbyPlayer[]): string[] {
  return players.filter((_, seat) => hostAnswers.has(seat)).map((player) => player.id)
}

function dispatchStep(): void {
  const { lobby } = gameState.get()
  if (!lobby || !actions) return
  const total = lobby.players.length
  const kind = stepKind(hostStep, total)
  lobby.players.forEach((player, seat) => {
    if (player.id === lobby.selfId) return
    const received = stepInput(hostChains, seat, hostStep)
    actions?.step.send({ step: hostStep, total, kind, received }, { target: player.id }).catch(() => undefined)
  })
  gameState.patch({
    telephone: {
      step: hostStep,
      totalSteps: total,
      stepKind: kind,
      received: stepInput(hostChains, seatOf(lobby.players, lobby.selfId), hostStep),
      readyIds: [],
      localReady: false,
      chains: null,
      revealCursor: firstCursor(),
    },
  })
}

function startMatch(): void {
  const state = gameState.get()
  if (!isHost(state) || !isPlaying(state) || hostStep !== -1 || !state.lobby || !actions) return
  hostChains = createChains(state.lobby.players)
  hostAnswers = new Map()
  hostStep = 0
  dispatchStep()
}

function finishMatch(): void {
  const { lobby, telephone } = gameState.get()
  if (!lobby || !telephone || !actions) return
  actions.finish.send({ chains: hostChains }).catch(() => undefined)
  gameState.patch({
    screen: 'revelacao',
    lobby: { ...lobby, stage: 'reveal' },
    telephone: { ...telephone, readyIds: [], localReady: false, chains: hostChains, revealCursor: firstCursor() },
  })
}

function publishProgress(): void {
  const { lobby, telephone } = gameState.get()
  if (!lobby || !telephone || !actions) return
  const ready = readyIds(lobby.players)
  actions.progress.send({ step: hostStep, readyIds: ready }).catch(() => undefined)
  gameState.patch({
    telephone: { ...telephone, readyIds: ready, localReady: hostAnswers.has(seatOf(lobby.players, lobby.selfId)) },
  })
}

function closeStepIfComplete(): void {
  const { lobby } = gameState.get()
  if (!lobby || hostAnswers.size < lobby.players.length) return
  hostChains = appendStep(hostChains, hostAnswers, hostStep, lobby.players)
  hostAnswers = new Map()
  if (hostStep + 1 < lobby.players.length) {
    hostStep += 1
    dispatchStep()
  } else {
    finishMatch()
  }
}

function recordAnswer(seat: number, content: StepContent): void {
  hostAnswers.set(seat, content)
  publishProgress()
  closeStepIfComplete()
}

function guestSeat(peerId: string): number {
  const players = gameState.get().lobby?.players ?? []
  const seat = seatOf(players, peerId)
  return seat > 0 ? seat : -1
}

function handleSubmit(data: unknown, peerId: string): void {
  const state = gameState.get()
  if (!isHost(state) || !isPlaying(state) || !state.lobby || hostStep < 0) return
  const seat = guestSeat(peerId)
  const record = asRecord(data)
  if (seat < 0 || !record) return
  if (record.step !== hostStep) {
    console.warn('Code Whispers: resposta de outra etapa ignorada', data)
    return
  }
  const validation = validateAnswer(stepKind(hostStep, state.lobby.players.length), record.answer)
  if (!validation.valid) {
    console.warn(`Code Whispers: resposta inválida ignorada (${validation.reason})`)
    return
  }
  recordAnswer(seat, validation.value)
}

function handleRetract(data: unknown, peerId: string): void {
  const state = gameState.get()
  if (!isHost(state) || !isPlaying(state) || hostStep < 0) return
  const seat = guestSeat(peerId)
  if (seat < 0 || asRecord(data)?.step !== hostStep || !hostAnswers.has(seat)) return
  hostAnswers.delete(seat)
  publishProgress()
}

function isFromHost(state: GameState, peerId: string): boolean {
  return !isHost(state) && state.room?.kind === 'telephone' && state.lobby?.hostId === peerId
}

function withSelf(ids: readonly string[], selfId: string, ready: boolean): string[] {
  const others = ids.filter((id) => id !== selfId)
  return ready ? [...others, selfId] : others
}

function handleStep(data: unknown, peerId: string): void {
  const state = gameState.get()
  if (!isFromHost(state, peerId) || !isPlaying(state) || !state.lobby) return
  const message = parseStepMessage(data)
  if (!message || message.total !== state.lobby.players.length) {
    console.warn('Code Whispers: etapa malformada ignorada', data)
    return
  }
  if (state.telephone && message.step <= state.telephone.step) return
  gameState.patch({
    telephone: {
      step: message.step,
      totalSteps: message.total,
      stepKind: message.kind,
      received: message.received,
      readyIds: [],
      localReady: false,
      chains: null,
      revealCursor: firstCursor(),
    },
  })
}

function handleProgress(data: unknown, peerId: string): void {
  const state = gameState.get()
  const { lobby, telephone } = state
  if (!isFromHost(state, peerId) || !isPlaying(state) || !lobby || !telephone) return
  const message = parseProgress(data, telephone.totalSteps)
  if (!message || message.step !== telephone.step) return
  gameState.patch({ telephone: { ...telephone, readyIds: withSelf(message.readyIds, lobby.selfId, telephone.localReady) } })
}

function handleFinish(data: unknown, peerId: string): void {
  const state = gameState.get()
  const { lobby, telephone } = state
  if (!isFromHost(state, peerId) || !isPlaying(state) || !lobby || !telephone) return
  const chains = parseChains(asRecord(data)?.chains, lobby.players.length)
  if (!chains) {
    console.warn('Code Whispers: cadeias malformadas ignoradas', data)
    return
  }
  gameState.patch({
    screen: 'revelacao',
    lobby: { ...lobby, stage: 'reveal' },
    telephone: { ...telephone, readyIds: [], localReady: false, chains, revealCursor: firstCursor() },
  })
}

function attach(room: Room): void {
  attachedRoom = room
  resetHost()
  const created: TelephoneActions = {
    step: room.makeAction<StepPayload>('tel_step'),
    submit: room.makeAction<SubmitPayload>('tel_submit'),
    retract: room.makeAction<RetractPayload>('tel_retract'),
    progress: room.makeAction<ProgressPayload>('tel_progress'),
    finish: room.makeAction<FinishPayload>('tel_finish'),
  }
  created.submit.onMessage = (data, { peerId }) => {
    if (attachedRoom === room) handleSubmit(data, peerId)
  }
  created.retract.onMessage = (data, { peerId }) => {
    if (attachedRoom === room) handleRetract(data, peerId)
  }
  created.step.onMessage = (data, { peerId }) => {
    if (attachedRoom === room) handleStep(data, peerId)
  }
  created.progress.onMessage = (data, { peerId }) => {
    if (attachedRoom === room) handleProgress(data, peerId)
  }
  created.finish.onMessage = (data, { peerId }) => {
    if (attachedRoom === room) handleFinish(data, peerId)
  }
  actions = created
}

function detach(): void {
  attachedRoom = null
  actions = null
  resetHost()
}

function watch(state: GameState): void {
  const room = getActiveRoom()
  if (state.connection.status === 'connected' && state.room?.kind === 'telephone' && room && room !== attachedRoom) {
    attach(room)
  } else if (!state.room && attachedRoom) {
    detach()
  }
  if (state.lobby?.stage === 'lobby') resetHost()
  if (isHost(state) && isPlaying(state) && hostStep === -1) queueMicrotask(startMatch)
}

export function startTelephone(): void {
  unsubscribe?.()
  unsubscribe = gameState.onChange(watch)
  watch(gameState.get())
}

export function stopTelephone(): void {
  unsubscribe?.()
  unsubscribe = null
  detach()
}

export function submitStep(content: StepContent): boolean {
  const state = gameState.get()
  const { lobby, telephone } = state
  if (!lobby || !telephone || !isPlaying(state) || telephone.localReady) return false
  const validation = validateAnswer(telephone.stepKind, typeof content === 'string' ? { text: content } : content)
  if (!validation.valid) return false
  if (isHost(state)) {
    recordAnswer(seatOf(lobby.players, lobby.selfId), validation.value)
    return true
  }
  if (!actions) return false
  actions.submit
    .send({ step: telephone.step, answer: answerPayload(validation.value) }, { target: lobby.hostId })
    .catch(() => undefined)
  gameState.patch({
    telephone: { ...telephone, localReady: true, readyIds: withSelf(telephone.readyIds, lobby.selfId, true) },
  })
  return true
}

export function retractStep(): boolean {
  const state = gameState.get()
  const { lobby, telephone } = state
  if (!lobby || !telephone || !isPlaying(state) || !telephone.localReady) return false
  if (isHost(state)) {
    const seat = seatOf(lobby.players, lobby.selfId)
    if (!hostAnswers.has(seat)) return false
    hostAnswers.delete(seat)
    publishProgress()
    return true
  }
  if (!actions) return false
  actions.retract.send({ step: telephone.step }, { target: lobby.hostId }).catch(() => undefined)
  gameState.patch({
    telephone: { ...telephone, localReady: false, readyIds: withSelf(telephone.readyIds, lobby.selfId, false) },
  })
  return true
}

startTelephone()
