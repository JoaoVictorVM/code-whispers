import { isLanguageId } from '../editor/languages'
import type {
  CodeSubmission,
  MatchMode,
  Tallies,
  Verdict,
} from '../types/game'

export type PlayPhase = 'code' | 'explain' | 'review'

export const PLAY_PHASES: readonly PlayPhase[] = ['code', 'explain', 'review']
export const VERDICTS: readonly Verdict[] = ['wrong', 'half', 'correct']

export const SNIPPET_MIN_LINES = 3
export const SNIPPET_MAX_LINES = 40
export const SNIPPET_MAX_CHARS = 1500
export const EXPLANATION_MIN_CHARS = 10
export const EXPLANATION_MAX_CHARS = 500
export const PENDING_BUFFER_LIMIT = 3

export type ExplanationPayload = {
  explanation: string
}

export type VerdictPayload = {
  verdict: Verdict
}

export interface ReadyPayloadByPhase {
  code: CodeSubmission
  explain: ExplanationPayload
  review: VerdictPayload
}

export type ReadyPayload = ReadyPayloadByPhase[PlayPhase]

export interface StepPosition {
  round: number
  phase: PlayPhase
}

export interface PendingMessage {
  kind: 'ready' | 'unready'
  step: number
  data?: ReadyPayload
}

export type ValidationResult<T> = { valid: true; value: T } | { valid: false; reason: string }

export function isPlayPhase(value: unknown): value is PlayPhase {
  return typeof value === 'string' && (PLAY_PHASES as readonly string[]).includes(value)
}

export function stepIndex(round: number, phase: PlayPhase): number {
  return (round - 1) * PLAY_PHASES.length + PLAY_PHASES.indexOf(phase)
}

export function roundsForMode(mode: MatchMode): number {
  return mode
}

export function nextPhase(round: number, phase: PlayPhase, totalRounds: number): StepPosition | 'summary' {
  const index = PLAY_PHASES.indexOf(phase)
  if (index < PLAY_PHASES.length - 1) return { round, phase: PLAY_PHASES[index + 1] }
  if (round >= totalRounds) return 'summary'
  return { round: round + 1, phase: 'code' }
}

function charCount(value: string): number {
  return [...value].length
}

function snippetLines(code: string): string[] {
  const lines = code.split('\n')
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  return lines
}

export function validateSnippet(code: string): ValidationResult<string> {
  const lines = snippetLines(code)
  const filledLines = lines.filter((line) => line.trim() !== '').length
  if (filledLines < SNIPPET_MIN_LINES) return { valid: false, reason: 'Mínimo de 3 linhas' }
  if (lines.length > SNIPPET_MAX_LINES) return { valid: false, reason: 'Máximo de 40 linhas' }
  if (charCount(code) > SNIPPET_MAX_CHARS) return { valid: false, reason: 'Máximo de 1500 caracteres' }
  return { valid: true, value: code }
}

export function validateExplanation(explanation: string): ValidationResult<string> {
  const trimmed = explanation.trim()
  const length = charCount(trimmed)
  if (length < EXPLANATION_MIN_CHARS) return { valid: false, reason: 'Mínimo de 10 caracteres' }
  if (length > EXPLANATION_MAX_CHARS) return { valid: false, reason: 'Máximo de 500 caracteres' }
  return { valid: true, value: trimmed }
}

function asRecord(data: unknown): Record<string, unknown> | null {
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null
}

export function validateReadyPayload<P extends PlayPhase>(
  phase: P,
  data: unknown,
): ValidationResult<ReadyPayloadByPhase[P]> {
  const record = asRecord(data)
  if (!record) return { valid: false, reason: 'payload ausente' }

  if (phase === 'code') {
    const { language, code } = record
    if (typeof language !== 'string' || !isLanguageId(language)) return { valid: false, reason: 'linguagem inválida' }
    if (typeof code !== 'string') return { valid: false, reason: 'código ausente' }
    const snippet = validateSnippet(code)
    if (!snippet.valid) return snippet
    return { valid: true, value: { language, code } as ReadyPayloadByPhase[P] }
  }

  if (phase === 'explain') {
    const { explanation } = record
    if (typeof explanation !== 'string') return { valid: false, reason: 'explicação ausente' }
    const result = validateExplanation(explanation)
    if (!result.valid) return result
    return { valid: true, value: { explanation: result.value } as ReadyPayloadByPhase[P] }
  }

  const { verdict } = record
  const match = VERDICTS.find((candidate) => candidate === verdict)
  if (!match) return { valid: false, reason: 'veredito inválido' }
  return { valid: true, value: { verdict: match } as ReadyPayloadByPhase[P] }
}

export function pushPending(
  buffer: readonly PendingMessage[],
  message: PendingMessage,
  limit = PENDING_BUFFER_LIMIT,
): { buffer: PendingMessage[]; dropped: PendingMessage[] } {
  const next = [...buffer, message]
  const overflow = Math.max(0, next.length - limit)
  return { buffer: next.slice(overflow), dropped: next.slice(0, overflow) }
}

export function takeApplicable(
  buffer: readonly PendingMessage[],
  step: number,
): { applicable: PendingMessage[]; rest: PendingMessage[] } {
  return {
    applicable: buffer.filter((message) => message.step === step),
    rest: buffer.filter((message) => message.step > step),
  }
}

export function applyVerdicts(tallies: Tallies, localVerdict: Verdict, remoteVerdict: Verdict): Tallies {
  return {
    local: { ...tallies.local, [remoteVerdict]: tallies.local[remoteVerdict] + 1 },
    remote: { ...tallies.remote, [localVerdict]: tallies.remote[localVerdict] + 1 },
  }
}
