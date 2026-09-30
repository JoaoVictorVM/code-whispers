export type ScreenId = 'inicio' | 'code' | 'explica' | 'revisa' | 'final' | 'sala' | 'etapa' | 'revelacao'

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

export type RoomKind = 'duel' | 'telephone'

export interface RoomSession {
  code: string
  role: RoomRole
  kind: RoomKind
  mode: MatchMode
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected'

export type ConnectionErrorType = 'not-found' | 'room-full' | 'clipboard' | 'signaling' | 'in-progress'

export interface ConnectionError {
  type: ConnectionErrorType
  message: string
}

export interface ConnectionState {
  status: ConnectionStatus
  error: ConnectionError | null
}

export interface LobbyPlayer extends PlayerProfile {
  id: string
  isHost: boolean
}

export type LobbyStage = 'lobby' | 'playing' | 'reveal'

export interface LobbyState {
  selfId: string
  hostId: string
  players: LobbyPlayer[]
  stage: LobbyStage
  departedNickname: string | null
}

export type StepKind = 'describe' | 'code' | 'explain'

export interface ChainEntry {
  author: PlayerProfile
  kind: StepKind
  content: CodeSubmission | string
}

export interface Chain {
  owner: PlayerProfile
  entries: ChainEntry[]
}

export interface RevealCursor {
  chain: number
  entry: number
}

export interface TelephoneState {
  step: number
  totalSteps: number
  stepKind: StepKind
  received: CodeSubmission | string | null
  readyIds: string[]
  localReady: boolean
  chains: Chain[] | null
}

export interface GameState {
  screen: ScreenId
  localPlayer: PlayerProfile | null
  remotePlayer: PlayerProfile | null
  room: RoomSession | null
  lobby: LobbyState | null
  telephone: TelephoneState | null
  connection: ConnectionState
  mode: MatchMode
  round: number
  phase: GamePhase
  readyFlags: ReadyFlags
  submissions: Record<number, RoundSubmissions>
  tallies: Tallies
  rematchFlags: ReadyFlags
}
