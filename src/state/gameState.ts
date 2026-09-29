import type { GameState } from '../types/game'

type Listener = (state: GameState) => void

export type MatchState = Pick<
  GameState,
  'round' | 'phase' | 'readyFlags' | 'submissions' | 'tallies' | 'rematchFlags'
>

export function createMatchState(): MatchState {
  return {
    round: 1,
    phase: 'code',
    readyFlags: { local: false, opponent: false },
    submissions: {},
    tallies: {
      local: { correct: 0, half: 0, wrong: 0 },
      remote: { correct: 0, half: 0, wrong: 0 },
    },
    rematchFlags: { local: false, opponent: false },
  }
}

function createInitialState(): GameState {
  return {
    screen: 'inicio',
    localPlayer: null,
    remotePlayer: null,
    room: null,
    lobby: null,
    telephone: null,
    connection: { status: 'idle', error: null },
    mode: 3,
    ...createMatchState(),
  }
}

let state: GameState = createInitialState()
const listeners = new Set<Listener>()

function get(): GameState {
  return state
}

function patch(partial: Partial<GameState>): void {
  state = { ...state, ...partial }
  for (const listener of listeners) {
    listener(state)
  }
}

function onChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function reset(): void {
  state = createInitialState()
  listeners.clear()
}

export const gameState = { get, patch, onChange, reset }
