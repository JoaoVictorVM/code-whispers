import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MatchMode, PlayerProfile } from '../types/game'

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
  joinRoom: vi.fn(),
  getRelaySockets: vi.fn(),
}))

vi.mock('trystero/nostr', () => ({
  joinRoom: trystero.joinRoom,
  getRelaySockets: trystero.getRelaySockets,
  selfId: 'self-peer',
}))

const { gameState } = await import('../state/gameState')
const { hostRoom, hostTelephoneRoom, joinRoomByCode, leaveRoom, getActiveRoom } = await import('./room')
const { ready, unready, rematch, startSync, stopSync, getTotalRounds } = await import('./sync')
const { roundsForMode } = await import('./syncProtocol')

const host: PlayerProfile = { nickname: 'João', avatarId: 1 }
const guest: PlayerProfile = { nickname: 'Maria', avatarId: 4 }
const OPPONENT = 'peer-a'

const localCode = { language: 'python', code: 'a = 1\nb = 2\nprint(a + b)' } as const
const remoteCode = { language: 'go', code: 'package main\nfunc main() {\n}' } as const
const localExplanation = 'Declara um programa Go vazio.'
const remoteExplanation = 'Soma dois números e imprime.'

function room(): FakeRoom {
  return trystero.rooms[trystero.rooms.length - 1]
}

function send(action: string): ReturnType<typeof vi.fn> {
  return room().actions[action].send
}

function incoming(action: string, data: unknown, peerId = OPPONENT): void {
  room().actions[action].onMessage?.(data, { peerId })
}

function opponentReady(round: number, phase: string, data: unknown): void {
  incoming('ready', { round, phase, data })
}

function connect(mode: MatchMode = 3): void {
  hostRoom(host, mode)
  incoming('hello', guest)
}

function playRound(round: number, localVerdict: 'wrong' | 'half' | 'correct', remoteVerdict: 'wrong' | 'half' | 'correct'): void {
  ready(localCode)
  opponentReady(round, 'code', remoteCode)
  ready({ explanation: localExplanation })
  opponentReady(round, 'explain', { explanation: remoteExplanation })
  ready({ verdict: localVerdict })
  opponentReady(round, 'review', { verdict: remoteVerdict })
}

describe('match synchronization', () => {
  beforeEach(() => {
    gameState.reset()
    trystero.rooms.length = 0
    trystero.joinRoom.mockReset().mockImplementation(() => {
      const fake: FakeRoom = {
        actions: {},
        makeAction(name) {
          const action: FakeAction = { send: vi.fn().mockResolvedValue(undefined), onMessage: null }
          fake.actions[name] = action
          return action
        },
        leave: vi.fn().mockResolvedValue(undefined),
        onPeerJoin: null,
        onPeerLeave: null,
      }
      trystero.rooms.push(fake)
      return fake
    })
    trystero.getRelaySockets.mockReset().mockReturnValue({ relay: { readyState: WebSocket.OPEN } })
    startSync()
  })

  afterEach(() => {
    stopSync()
    leaveRoom()
    vi.restoreAllMocks()
  })

  it('does not attach to telephone rooms', () => {
    hostTelephoneRoom(host)
    expect(gameState.get().connection.status).toBe('connected')
    expect(room().actions.ready).toBeUndefined()
    expect(room().actions.unready).toBeUndefined()
    expect(room().actions.rematch).toBeUndefined()
  })

  it('test_starts_match_on_connection_connected', () => {
    connect()
    const state = gameState.get()
    expect(state.round).toBe(1)
    expect(state.phase).toBe('code')
    expect(state.screen).toBe('code')
    expect(room().actions.ready).toBeDefined()
    expect(room().actions.unready).toBeDefined()
    expect(room().actions.rematch).toBeDefined()
  })

  it('test_ready_sends_message_and_sets_local_flag', () => {
    connect()
    expect(ready(localCode)).toBe(true)
    expect(send('ready')).toHaveBeenCalledWith({ round: 1, phase: 'code', data: localCode })
    expect(gameState.get().readyFlags).toEqual({ local: true, opponent: false })
    expect(gameState.get().phase).toBe('code')
  })

  it('rejects an invalid local payload without sending', () => {
    connect()
    expect(ready({ language: 'python', code: 'x' })).toBe(false)
    expect(send('ready')).not.toHaveBeenCalled()
    expect(gameState.get().readyFlags.local).toBe(false)
  })

  it('test_phase_advances_when_both_ready_present', () => {
    connect()
    ready(localCode)
    expect(gameState.get().phase).toBe('code')
    opponentReady(1, 'code', remoteCode)
    const state = gameState.get()
    expect(state.phase).toBe('explain')
    expect(state.screen).toBe('explica')
    expect(state.readyFlags).toEqual({ local: false, opponent: false })
  })

  it('advances when the opponent is ready first', () => {
    connect()
    opponentReady(1, 'code', remoteCode)
    expect(gameState.get().readyFlags).toEqual({ local: false, opponent: true })
    expect(gameState.get().phase).toBe('code')
    ready(localCode)
    expect(gameState.get().phase).toBe('explain')
  })

  it('test_unready_before_opponent_ready_reverts_local_flag', () => {
    connect()
    ready(localCode)
    expect(unready()).toBe(true)
    expect(gameState.get().readyFlags.local).toBe(false)
    expect(send('unready')).toHaveBeenCalledWith({ round: 1, phase: 'code' })
    opponentReady(1, 'code', remoteCode)
    expect(gameState.get().phase).toBe('code')
  })

  it('test_unready_after_both_ready_is_ignored', () => {
    connect()
    ready(localCode)
    opponentReady(1, 'code', remoteCode)
    expect(unready()).toBe(false)
    expect(gameState.get().phase).toBe('explain')
    expect(send('unready')).not.toHaveBeenCalled()
  })

  it('unready is refused once the opponent ready was received', () => {
    connect()
    opponentReady(1, 'code', remoteCode)
    expect(unready()).toBe(false)
  })

  it('applies an incoming unready for the current phase', () => {
    connect()
    opponentReady(1, 'code', remoteCode)
    incoming('unready', { round: 1, phase: 'code' })
    expect(gameState.get().readyFlags.opponent).toBe(false)
    ready(localCode)
    expect(gameState.get().phase).toBe('code')
  })

  it('last ready from the opponent wins for the same phase', () => {
    connect()
    opponentReady(1, 'code', remoteCode)
    const edited = { language: 'go', code: 'package main\n\nfunc main() {\n  println(1)\n}' }
    opponentReady(1, 'code', edited)
    ready(localCode)
    expect(gameState.get().submissions[1].remoteCode).toEqual(edited)
  })

  it('test_stale_incoming_message_is_discarded', () => {
    connect()
    ready(localCode)
    opponentReady(1, 'code', remoteCode)
    const before = gameState.get()
    opponentReady(1, 'code', remoteCode)
    incoming('unready', { round: 1, phase: 'code' })
    expect(gameState.get()).toBe(before)
  })

  it('test_future_incoming_message_is_buffered_then_applied', () => {
    connect()
    opponentReady(1, 'code', remoteCode)
    opponentReady(1, 'explain', { explanation: remoteExplanation })
    expect(gameState.get().phase).toBe('code')
    ready(localCode)
    expect(gameState.get().phase).toBe('explain')
    expect(gameState.get().readyFlags.opponent).toBe(true)
    ready({ explanation: localExplanation })
    expect(gameState.get().phase).toBe('review')
  })

  it('keeps only the newest three buffered messages and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    connect()
    opponentReady(1, 'explain', { explanation: 'descartada primeiro' })
    opponentReady(1, 'review', { verdict: 'half' })
    opponentReady(2, 'code', remoteCode)
    opponentReady(2, 'explain', { explanation: remoteExplanation })
    expect(warn).toHaveBeenCalledTimes(1)
    ready(localCode)
    opponentReady(1, 'code', remoteCode)
    expect(gameState.get().phase).toBe('explain')
    expect(gameState.get().readyFlags.opponent).toBe(false)
  })

  it('test_malformed_incoming_payload_is_ignored', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    connect()
    ready(localCode)
    opponentReady(1, 'code', { language: 'python', code: `${localCode.code}\n${'x'.repeat(1500)}` })
    opponentReady(1, 'code', { language: 'python' })
    incoming('ready', { round: 'um', phase: 'code', data: remoteCode })
    incoming('ready', 'lixo')
    expect(gameState.get().readyFlags).toEqual({ local: true, opponent: false })
    expect(gameState.get().phase).toBe('code')
    expect(warn).toHaveBeenCalled()
  })

  it('ignores ready messages from peers other than the opponent', () => {
    connect()
    ready(localCode)
    incoming('ready', { round: 1, phase: 'code', data: remoteCode }, 'intruso')
    expect(gameState.get().phase).toBe('code')
  })

  it('test_submissions_are_populated_across_phase_transitions', () => {
    connect()
    ready(localCode)
    opponentReady(1, 'code', remoteCode)
    expect(gameState.get().submissions[1]).toEqual({ localCode, remoteCode })
    ready({ explanation: localExplanation })
    opponentReady(1, 'explain', { explanation: remoteExplanation })
    expect(gameState.get().submissions[1]).toMatchObject({ localExplanation, remoteExplanation })
    ready({ verdict: 'correct' })
    opponentReady(1, 'review', { verdict: 'wrong' })
    expect(gameState.get().submissions[1]).toMatchObject({ localVerdict: 'correct', remoteVerdict: 'wrong' })
    expect(gameState.get().round).toBe(2)
    expect(gameState.get().phase).toBe('code')
    expect(gameState.get().screen).toBe('code')
  })

  it('attributes each verdict to the author of the judged explanation', () => {
    connect()
    playRound(1, 'correct', 'half')
    const { tallies } = gameState.get()
    expect(tallies.remote).toEqual({ correct: 1, half: 0, wrong: 0 })
    expect(tallies.local).toEqual({ correct: 0, half: 1, wrong: 0 })
  })

  it('test_last_round_review_transitions_to_summary_screen', () => {
    connect(3)
    playRound(1, 'correct', 'half')
    playRound(2, 'wrong', 'correct')
    expect(gameState.get().screen).toBe('code')
    playRound(3, 'half', 'half')
    const state = gameState.get()
    expect(state.screen).toBe('final')
    expect(state.phase).toBe('summary')
    const sum = (t: { correct: number; half: number; wrong: number }) => t.correct + t.half + t.wrong
    expect(sum(state.tallies.local)).toBe(3)
    expect(sum(state.tallies.remote)).toBe(3)
  })

  it('runs exactly the number of rounds of each mode', () => {
    for (const mode of [5, 7] as const) {
      stopSync()
      leaveRoom()
      gameState.reset()
      startSync()
      connect(mode)
      for (let round = 1; round < mode; round++) playRound(round, 'correct', 'correct')
      expect(gameState.get().screen).toBe('code')
      expect(gameState.get().round).toBe(mode)
      playRound(mode, 'correct', 'correct')
      expect(gameState.get().screen).toBe('final')
    }
  })

  it('test_rematch_resets_state_when_both_confirm', () => {
    connect(3)
    for (let round = 1; round <= 3; round++) playRound(round, 'correct', 'wrong')
    expect(rematch()).toBe(true)
    expect(send('rematch')).toHaveBeenCalledWith({})
    expect(gameState.get().rematchFlags).toEqual({ local: true, opponent: false })
    expect(gameState.get().screen).toBe('final')
    incoming('rematch', {})
    const state = gameState.get()
    expect(state.screen).toBe('code')
    expect(state.round).toBe(1)
    expect(state.phase).toBe('code')
    expect(state.submissions).toEqual({})
    expect(state.tallies.local).toEqual({ correct: 0, half: 0, wrong: 0 })
    expect(state.tallies.remote).toEqual({ correct: 0, half: 0, wrong: 0 })
    expect(state.rematchFlags).toEqual({ local: false, opponent: false })
    expect(state.room?.mode).toBe(3)
    expect(state.remotePlayer).toEqual(guest)
  })

  it('remembers an opponent rematch that arrives before the local summary', () => {
    connect(3)
    playRound(1, 'correct', 'correct')
    playRound(2, 'correct', 'correct')
    ready(localCode)
    opponentReady(3, 'code', remoteCode)
    ready({ explanation: localExplanation })
    opponentReady(3, 'explain', { explanation: remoteExplanation })
    opponentReady(3, 'review', { verdict: 'half' })
    incoming('rematch', {})
    ready({ verdict: 'correct' })
    expect(gameState.get().rematchFlags).toEqual({ local: false, opponent: true })
    rematch()
    expect(gameState.get().screen).toBe('code')
  })

  it('rematch is only available on the summary', () => {
    connect()
    expect(rematch()).toBe(false)
    expect(send('rematch')).not.toHaveBeenCalled()
  })

  it('stops handling messages after leaving the room', () => {
    connect()
    const oldRoom = room()
    leaveRoom()
    oldRoom.actions.ready.onMessage?.({ round: 1, phase: 'code', data: remoteCode }, { peerId: OPPONENT })
    expect(gameState.get().readyFlags.opponent).toBe(false)
    expect(ready(localCode)).toBe(false)
  })

  it('test_uses_room_mode_for_total_rounds_and_opponent_label', () => {
    connect(5)
    const { room: session, remotePlayer } = gameState.get()
    expect(getTotalRounds()).toBe(5)
    expect(roundsForMode(session!.mode)).toBe(5)
    expect(remotePlayer?.nickname).toBe('Maria')
  })

  it('test_ready_and_rematch_reuse_the_active_room', () => {
    joinRoomByCode(guest, 'AB3XYZ')
    incoming('welcome', { ...host, mode: 3 }, 'host-peer')
    expect(trystero.rooms).toHaveLength(1)
    const active = getActiveRoom() as unknown as FakeRoom
    expect(active).toBe(room())
    ready(localCode)
    expect(active.actions.ready.send).toHaveBeenCalled()
  })

  it('test_round_context_shape_matches_code_screen_contract', () => {
    connect()
    const { round, phase, readyFlags } = gameState.get()
    expect({ round, phase, readyFlags }).toEqual({
      round: 1,
      phase: 'code',
      readyFlags: { local: false, opponent: false },
    })
    expect(typeof ready).toBe('function')
    expect(typeof unready).toBe('function')
  })

  it('test_opponent_snippet_available_for_explanation_screen', () => {
    connect()
    ready(localCode)
    opponentReady(1, 'code', remoteCode)
    const { submissions, round } = gameState.get()
    expect(submissions[round].remoteCode).toEqual(remoteCode)
  })

  it('test_received_explanation_and_own_snippet_available_for_review_screen', () => {
    connect()
    ready(localCode)
    opponentReady(1, 'code', remoteCode)
    ready({ explanation: localExplanation })
    opponentReady(1, 'explain', { explanation: remoteExplanation })
    const { submissions, round, phase } = gameState.get()
    expect(phase).toBe('review')
    expect(submissions[round].remoteExplanation).toBe(remoteExplanation)
    expect(submissions[round].localCode).toEqual(localCode)
  })

  it('test_tallies_and_rematch_flag_available_for_summary_screen', () => {
    connect(3)
    playRound(1, 'correct', 'half')
    playRound(2, 'wrong', 'correct')
    playRound(3, 'half', 'wrong')
    rematch()
    const { tallies, rematchFlags } = gameState.get()
    expect(tallies.local).toEqual({ correct: 1, half: 1, wrong: 1 })
    expect(tallies.remote).toEqual({ correct: 1, half: 1, wrong: 1 })
    expect(rematchFlags.local).toBe(true)
  })
})
