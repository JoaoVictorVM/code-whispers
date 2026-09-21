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

export interface CodeSubmission {
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

export interface GameState {
  screen: ScreenId
  localPlayer: PlayerProfile | null
  remotePlayer: PlayerProfile | null
  mode: MatchMode
  round: number
  phase: GamePhase
  readyFlags: ReadyFlags
  submissions: Record<number, RoundSubmissions>
  tallies: Tallies
}
