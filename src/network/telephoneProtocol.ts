import { parseProfile } from '../state/profile'
import type { Chain, ChainEntry, CodeSubmission, PlayerProfile, RevealCursor, StepKind } from '../types/game'
import { TELEPHONE_MAX_PLAYERS, TELEPHONE_MIN_PLAYERS } from './lobbyProtocol'
import { validateExplanation, validateReadyPayload, type ValidationResult } from './syncProtocol'

export type StepContent = CodeSubmission | string

export type AnswerPayload = CodeSubmission | { text: string }

export interface StepMessage {
  step: number
  total: number
  kind: StepKind
  received: StepContent | null
}

export interface ProgressMessage {
  step: number
  readyIds: string[]
}

export function stepKind(step: number, playerCount: number): StepKind {
  if (playerCount % 2 === 1) return step % 2 === 0 ? 'code' : 'explain'
  if (step === 0) return 'describe'
  return step % 2 === 0 ? 'explain' : 'code'
}

export function chainForSeat(seat: number, step: number, playerCount: number): number {
  return (((seat - step) % playerCount) + playerCount) % playerCount
}

export function seatForChain(chain: number, step: number, playerCount: number): number {
  return (chain + step) % playerCount
}

function profileOf(player: PlayerProfile): PlayerProfile {
  return { nickname: player.nickname, avatarId: player.avatarId }
}

export function createChains(players: readonly PlayerProfile[]): Chain[] {
  return players.map((player) => ({ owner: profileOf(player), entries: [] }))
}

export function stepInput(chains: readonly Chain[], seat: number, step: number): StepContent | null {
  if (step === 0) return null
  const chain = chains[chainForSeat(seat, step, chains.length)]
  return chain?.entries[chain.entries.length - 1]?.content ?? null
}

export function appendStep(
  chains: readonly Chain[],
  answersBySeat: ReadonlyMap<number, StepContent>,
  step: number,
  players: readonly PlayerProfile[],
): Chain[] {
  const kind = stepKind(step, chains.length)
  return chains.map((chain, index) => {
    const seat = seatForChain(index, step, chains.length)
    const content = answersBySeat.get(seat)
    if (content === undefined) return chain
    return { ...chain, entries: [...chain.entries, { author: profileOf(players[seat]), kind, content }] }
  })
}

function asRecord(data: unknown): Record<string, unknown> | null {
  return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null
}

function isPlayerCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= TELEPHONE_MIN_PLAYERS && value <= TELEPHONE_MAX_PLAYERS
}

function isStepIndex(value: unknown, total: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < total
}

function validateContent(kind: StepKind, content: unknown): ValidationResult<StepContent> {
  if (kind === 'code') return validateReadyPayload('code', content)
  if (typeof content !== 'string') return { valid: false, reason: 'texto ausente' }
  return validateExplanation(content)
}

export function validateAnswer(kind: StepKind, data: unknown): ValidationResult<StepContent> {
  if (kind === 'code') return validateContent('code', data)
  return validateContent(kind, asRecord(data)?.text)
}

export function answerPayload(content: StepContent): AnswerPayload {
  return typeof content === 'string' ? { text: content } : content
}

export function parseStepMessage(data: unknown): StepMessage | null {
  const record = asRecord(data)
  if (!record) return null
  const { step, total, received } = record
  if (!isPlayerCount(total) || !isStepIndex(step, total)) return null
  const kind = stepKind(step, total)
  if (record.kind !== kind) return null
  if (step === 0) return received === null ? { step, total, kind, received: null } : null
  const content = validateContent(stepKind(step - 1, total), received)
  return content.valid ? { step, total, kind, received: content.value } : null
}

export function parseProgress(data: unknown, total: number): ProgressMessage | null {
  const record = asRecord(data)
  if (!record) return null
  const { step, readyIds } = record
  if (!isStepIndex(step, total) || !Array.isArray(readyIds) || readyIds.length > total) return null
  if (!readyIds.every((id) => typeof id === 'string' && id !== '')) return null
  return { step, readyIds: [...new Set(readyIds as string[])] }
}

function parseEntry(data: unknown, expectedKind: StepKind): ChainEntry | null {
  const record = asRecord(data)
  const author = parseProfile(record?.author)
  if (!record || !author || record.kind !== expectedKind) return null
  const content = validateContent(expectedKind, record.content)
  return content.valid ? { author, kind: expectedKind, content: content.value } : null
}

export function parseChains(data: unknown, playerCount: number): Chain[] | null {
  if (!isPlayerCount(playerCount) || !Array.isArray(data) || data.length !== playerCount) return null
  const chains: Chain[] = []
  for (const item of data) {
    const record = asRecord(item)
    const owner = parseProfile(record?.owner)
    if (!record || !owner || !Array.isArray(record.entries) || record.entries.length !== playerCount) return null
    const entries = record.entries.map((entry: unknown, step: number) => parseEntry(entry, stepKind(step, playerCount)))
    if (entries.some((entry) => entry === null)) return null
    chains.push({ owner, entries: entries as ChainEntry[] })
  }
  return chains
}

export function firstCursor(): RevealCursor {
  return { chain: 0, entry: 0 }
}

export function nextCursor(cursor: RevealCursor, playerCount: number): RevealCursor | null {
  if (cursor.entry < playerCount - 1) return { chain: cursor.chain, entry: cursor.entry + 1 }
  if (cursor.chain < playerCount - 1) return { chain: cursor.chain + 1, entry: 0 }
  return null
}

export function isRevealFinished(cursor: RevealCursor, playerCount: number): boolean {
  return nextCursor(cursor, playerCount) === null
}

export function revealButtonLabel(cursor: RevealCursor, playerCount: number): string {
  if (isRevealFinished(cursor, playerCount)) return 'Voltar para a sala'
  return cursor.entry === playerCount - 1 ? 'Próxima cadeia' : 'Próximo'
}

export function parseCursor(data: unknown, playerCount: number): RevealCursor | null {
  const record = asRecord(data)
  if (!record || !isStepIndex(record.chain, playerCount) || !isStepIndex(record.entry, playerCount)) return null
  return { chain: record.chain, entry: record.entry }
}
