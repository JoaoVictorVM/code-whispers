import { describe, expect, it } from 'vitest'
import type { PlayerProfile } from '../types/game'
import {
  appendStep,
  chainForSeat,
  createChains,
  seatForChain,
  stepInput,
  stepKind,
  type StepContent,
} from './telephoneProtocol'

const PLAYER_COUNTS = [3, 4, 5, 6, 7, 8]

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
})
