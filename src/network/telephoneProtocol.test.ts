import { describe, expect, it } from 'vitest'
import type { PlayerProfile } from '../types/game'
import {
  answerPayload,
  appendStep,
  chainForSeat,
  createChains,
  firstCursor,
  isRevealFinished,
  nextCursor,
  parseChains,
  parseCursor,
  parseProgress,
  parseStepMessage,
  revealButtonLabel,
  seatForChain,
  stepInput,
  stepKind,
  validateAnswer,
  type StepContent,
} from './telephoneProtocol'

const PLAYER_COUNTS = [3, 4, 5, 6, 7, 8]
const snippet = { language: 'python' as const, code: 'x = 1\ny = 2\nprint(x + y)' }
const text = 'Soma dois números e mostra na tela.'

function players(count: number): PlayerProfile[] {
  return Array.from({ length: count }, (_, index) => ({ nickname: `Jogador ${index}`, avatarId: (index % 8) + 1 }))
}

function answer(seat: number, step: number): StepContent {
  return `resposta do assento ${seat} na etapa ${step}`
}

function answersFor(count: number, step: number): Map<number, StepContent> {
  return new Map(Array.from({ length: count }, (_, seat) => [seat, answer(seat, step)]))
}

describe('telephone protocol', () => {
  it('always ends on a code step', () => {
    for (const count of PLAYER_COUNTS) expect(stepKind(count - 1, count)).toBe('code')
  })

  it('starts odd groups with code and even groups with a description', () => {
    expect(PLAYER_COUNTS.map((count) => stepKind(0, count))).toEqual(['code', 'describe', 'code', 'describe', 'code', 'describe'])
  })

  it('alternates between code and words after the first step', () => {
    for (const count of PLAYER_COUNTS) {
      for (let step = 1; step < count; step += 1) {
        const previousIsCode = stepKind(step - 1, count) === 'code'
        expect(stepKind(step, count) === 'code').toBe(!previousIsCode)
      }
    }
  })

  it('keeps each player on their own chain at the first step', () => {
    for (const count of PLAYER_COUNTS) {
      for (let seat = 0; seat < count; seat += 1) expect(chainForSeat(seat, 0, count)).toBe(seat)
    }
  })

  it('passes every chain through every seat exactly once', () => {
    for (const count of PLAYER_COUNTS) {
      for (let chain = 0; chain < count; chain += 1) {
        const seats = Array.from({ length: count }, (_, step) => seatForChain(chain, step, count))
        expect(new Set(seats).size).toBe(count)
        seats.forEach((seat, step) => expect(chainForSeat(seat, step, count)).toBe(chain))
      }
    }
  })

  it('matches the example with three players', () => {
    expect([0, 1, 2].map((step) => seatForChain(0, step, 3))).toEqual([0, 1, 2])
    expect([0, 1, 2].map((step) => stepKind(step, 3))).toEqual(['code', 'explain', 'code'])
  })

  it('creates one empty chain per player', () => {
    const chains = createChains(players(3))
    expect(chains.map((chain) => chain.owner.nickname)).toEqual(['Jogador 0', 'Jogador 1', 'Jogador 2'])
    expect(chains.every((chain) => chain.entries.length === 0)).toBe(true)
  })

  it('gives no input at the first step', () => {
    expect(stepInput(createChains(players(4)), 2, 0)).toBeNull()
  })

  it('records the author and kind of each answer', () => {
    const group = players(3)
    const chains = appendStep(createChains(group), answersFor(3, 0), 0, group)
    expect(chains[1].entries).toEqual([{ author: group[1], kind: 'code', content: answer(1, 0) }])
    const next = appendStep(chains, answersFor(3, 1), 1, group)
    expect(next[0].entries[1]).toEqual({ author: group[1], kind: 'explain', content: answer(1, 1) })
  })

  it('hands each seat the last entry of the chain it holds', () => {
    const group = players(4)
    let chains = createChains(group)
    for (let step = 0; step < 2; step += 1) chains = appendStep(chains, answersFor(4, step), step, group)
    for (let seat = 0; seat < 4; seat += 1) {
      const held = chainForSeat(seat, 2, 4)
      expect(stepInput(chains, seat, 2)).toBe(answer(seatForChain(held, 1, 4), 1))
    }
  })

  it('builds complete chains of alternating kinds', () => {
    for (const count of PLAYER_COUNTS) {
      const group = players(count)
      let chains = createChains(group)
      for (let step = 0; step < count; step += 1) chains = appendStep(chains, answersFor(count, step), step, group)
      for (const chain of chains) {
        expect(chain.entries).toHaveLength(count)
        expect(chain.entries.map((entry) => entry.kind)).toEqual(chain.entries.map((_, step) => stepKind(step, count)))
        expect(new Set(chain.entries.map((entry) => entry.author.nickname)).size).toBe(count)
      }
    }
  })

  it('validates answers with the duel limits', () => {
    expect(validateAnswer('code', snippet)).toEqual({ valid: true, value: snippet })
    expect(validateAnswer('code', { language: 'python', code: 'x = 1' })).toEqual({ valid: false, reason: 'Mínimo de 3 linhas' })
    expect(validateAnswer('explain', { text: `  ${text}  ` })).toEqual({ valid: true, value: text })
    expect(validateAnswer('describe', { text: 'curto' })).toEqual({ valid: false, reason: 'Mínimo de 10 caracteres' })
    expect(validateAnswer('explain', { text: 'x'.repeat(501) })).toEqual({ valid: false, reason: 'Máximo de 500 caracteres' })
    expect(validateAnswer('describe', snippet).valid).toBe(false)
  })

  it('wraps text answers for the network', () => {
    expect(answerPayload(text)).toEqual({ text })
    expect(answerPayload(snippet)).toBe(snippet)
  })

  it('parses step messages whose input matches the previous step', () => {
    expect(parseStepMessage({ step: 0, total: 4, kind: 'describe', received: null })).toEqual({ step: 0, total: 4, kind: 'describe', received: null })
    expect(parseStepMessage({ step: 1, total: 3, kind: 'explain', received: snippet })).toEqual({ step: 1, total: 3, kind: 'explain', received: snippet })
    expect(parseStepMessage({ step: 2, total: 3, kind: 'code', received: text })).toEqual({ step: 2, total: 3, kind: 'code', received: text })
  })

  it('rejects step messages with a mismatched kind or input', () => {
    expect(parseStepMessage({ step: 1, total: 3, kind: 'explain', received: text })).toBeNull()
    expect(parseStepMessage({ step: 2, total: 3, kind: 'code', received: snippet })).toBeNull()
    expect(parseStepMessage({ step: 1, total: 3, kind: 'code', received: snippet })).toBeNull()
    expect(parseStepMessage({ step: 0, total: 3, kind: 'code', received: snippet })).toBeNull()
    expect(parseStepMessage({ step: 3, total: 3, kind: 'code', received: text })).toBeNull()
    expect(parseStepMessage({ step: 0, total: 2, kind: 'describe', received: null })).toBeNull()
    expect(parseStepMessage('step')).toBeNull()
  })

  it('parses progress lists and drops duplicates', () => {
    expect(parseProgress({ step: 1, readyIds: ['a', 'b', 'a'] }, 3)).toEqual({ step: 1, readyIds: ['a', 'b'] })
    expect(parseProgress({ step: 3, readyIds: [] }, 3)).toBeNull()
    expect(parseProgress({ step: 0, readyIds: ['a', 2] }, 3)).toBeNull()
    expect(parseProgress({ step: 0, readyIds: ['a', 'b', 'c', 'd'] }, 3)).toBeNull()
  })

  it('parses complete chains and rejects broken ones', () => {
    const group = players(3)
    const contents = (step: number) => new Map([0, 1, 2].map((seat) => [seat, stepKind(step, 3) === 'code' ? snippet : text] as const))
    let chains = createChains(group)
    for (let step = 0; step < 3; step += 1) chains = appendStep(chains, contents(step), step, group)
    expect(parseChains(JSON.parse(JSON.stringify(chains)), 3)).toEqual(chains)
    expect(parseChains(chains.slice(0, 2), 3)).toBeNull()
    expect(parseChains(chains.map((chain) => ({ ...chain, entries: chain.entries.slice(0, 2) })), 3)).toBeNull()
    expect(parseChains(chains.map((chain) => ({ ...chain, entries: [chain.entries[1], chain.entries[0], chain.entries[2]] })), 3)).toBeNull()
    expect(parseChains(chains.map((chain) => ({ ...chain, owner: { nickname: 'x', avatarId: 1 } })), 3)).toBeNull()
  })

  it('walks the reveal through every entry of every chain in order', () => {
    const visited = []
    for (let cursor: ReturnType<typeof nextCursor> = firstCursor(); cursor; cursor = nextCursor(cursor, 3)) {
      visited.push(`${cursor.chain}.${cursor.entry}`)
    }
    expect(visited).toEqual(['0.0', '0.1', '0.2', '1.0', '1.1', '1.2', '2.0', '2.1', '2.2'])
  })

  it('finishes the reveal on the last entry of the last chain', () => {
    expect(isRevealFinished({ chain: 2, entry: 2 }, 3)).toBe(true)
    expect(isRevealFinished({ chain: 2, entry: 1 }, 3)).toBe(false)
    expect(isRevealFinished({ chain: 1, entry: 2 }, 3)).toBe(false)
  })

  it('labels the host button by position', () => {
    expect(revealButtonLabel({ chain: 0, entry: 0 }, 3)).toBe('Próximo')
    expect(revealButtonLabel({ chain: 0, entry: 2 }, 3)).toBe('Próxima cadeia')
    expect(revealButtonLabel({ chain: 2, entry: 2 }, 3)).toBe('Voltar para a sala')
  })

  it('parses cursors inside the chains only', () => {
    expect(parseCursor({ chain: 1, entry: 2 }, 3)).toEqual({ chain: 1, entry: 2 })
    expect(parseCursor({ chain: -1, entry: 0 }, 3)).toBeNull()
    expect(parseCursor({ chain: 3, entry: 0 }, 3)).toBeNull()
    expect(parseCursor({ chain: 0, entry: 1.5 }, 3)).toBeNull()
    expect(parseCursor(null, 3)).toBeNull()
  })
})
