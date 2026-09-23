export type ScreenId = 'inicio' | 'code' | 'explica' | 'revisa' | 'final'

export type GamePhase = 'code' | 'explain' | 'review' | 'summary'

export type MatchMode = 3 | 5 | 7

export type Verdict = 'wrong' | 'half' | 'correct'

export type LanguageId =
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'java'
  | 'go'

export interface PlayerProfile {
  nickname: string
  avatarId: number
}

export interface ReadyFlags {
  local: boolean
  opponent: boolean
}

export type CodeSubmission = {
  language: LanguageId
  code: string
}

export interface RoundSubmissions {
  localCode?: CodeSubmission
  remoteCode?: CodeSubmission
  localExplanation?: string
  remoteExplanation?: string
  localVerdict?: Verdict
  remoteVerdict?: Verdict
}

export interface VerdictTally {
  correct: number
  half: number
  wrong: number
}

export interface Tallies {
  local: VerdictTally
  remote: VerdictTally
}

export type RoomRole = 'host' | 'guest'

export interface RoomSession {
  code: string
  role: RoomRole
  mode: MatchMode
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected'

export type ConnectionErrorType = 'not-found' | 'room-full' | 'clipboard' | 'signaling'

export interface ConnectionError {
  type: ConnectionErrorType
  message: string
}

export interface ConnectionState {
  status: ConnectionStatus
  error: ConnectionError | null
}

export interface GameState {
  screen: ScreenId
  localPlayer: PlayerProfile | null
  remotePlayer: PlayerProfile | null
  room: RoomSession | null
  connection: ConnectionState
  mode: MatchMode
  round: number
  phase: GamePhase
  readyFlags: ReadyFlags
  submissions: Record<number, RoundSubmissions>
  tallies: Tallies
  rematchFlags: ReadyFlags
}
