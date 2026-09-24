import { describe, expect, it } from 'vitest'
import {
  applyVerdicts,
  countSnippetLines,
  nextPhase,
  pushPending,
  roundsForMode,
  stepIndex,
  takeApplicable,
  trimSnippet,
  validateExplanation,
  validateReadyPayload,
  validateSnippet,
  type PendingMessage,
} from './syncProtocol'

const threeLines = 'a = 1\nb = 2\nc = a + b'

function emptyTallies() {
  return {
    local: { correct: 0, half: 0, wrong: 0 },
    remote: { correct: 0, half: 0, wrong: 0 },
  }
}

describe('sync protocol', () => {
  it('test_stepIndex_orders_phases_within_and_across_rounds', () => {
    expect(stepIndex(1, 'code')).toBe(0)
    expect(stepIndex(1, 'code')).toBeLessThan(stepIndex(1, 'explain'))
    expect(stepIndex(1, 'explain')).toBeLessThan(stepIndex(1, 'review'))
    expect(stepIndex(1, 'review')).toBeLessThan(stepIndex(2, 'code'))
    expect(stepIndex(2, 'code')).toBe(3)
  })

  it('test_roundsForMode_maps_modes_correctly', () => {
    expect(roundsForMode(3)).toBe(3)
    expect(roundsForMode(5)).toBe(5)
    expect(roundsForMode(7)).toBe(7)
  })

  it('test_nextPhase_cycles_within_round', () => {
    expect(nextPhase(1, 'code', 3)).toEqual({ round: 1, phase: 'explain' })
    expect(nextPhase(1, 'explain', 3)).toEqual({ round: 1, phase: 'review' })
    expect(nextPhase(1, 'review', 3)).toEqual({ round: 2, phase: 'code' })
  })

  it('test_nextPhase_returns_summary_after_last_round', () => {
    expect(nextPhase(3, 'review', 3)).toBe('summary')
    expect(nextPhase(5, 'review', 7)).toEqual({ round: 6, phase: 'code' })
  })

  it('produces code, explain, review exactly N times per mode before summary', () => {
    for (const mode of [3, 5, 7] as const) {
      const phases: string[] = []
      let position: ReturnType<typeof nextPhase> = { round: 1, phase: 'code' }
      while (position !== 'summary') {
        phases.push(position.phase)
        position = nextPhase(position.round, position.phase, roundsForMode(mode))
      }
      expect(phases).toEqual(Array.from({ length: mode }, () => ['code', 'explain', 'review']).flat())
    }
  })

  it('test_validateReadyPayload_accepts_valid_code_payload', () => {
    const result = validateReadyPayload('code', { language: 'python', code: threeLines })
    expect(result).toEqual({ valid: true, value: { language: 'python', code: threeLines } })
  })

  it('test_validateReadyPayload_rejects_oversized_code_payload', () => {
    const oversized = `${threeLines}\n${'x'.repeat(1500)}`
    expect(validateReadyPayload('code', { language: 'python', code: oversized }).valid).toBe(false)
  })

  it('rejects code payloads with too few or too many lines, unknown language or missing fields', () => {
    expect(validateReadyPayload('code', { language: 'python', code: 'a\n\n  \nb' }).valid).toBe(false)
    expect(validateReadyPayload('code', { language: 'python', code: Array(41).fill('x').join('\n') }).valid).toBe(false)
    expect(validateReadyPayload('code', { language: 'rust', code: threeLines }).valid).toBe(false)
    expect(validateReadyPayload('code', { language: 'python' }).valid).toBe(false)
    expect(validateReadyPayload('code', null).valid).toBe(false)
  })

  it('trims trailing empty lines before counting snippet lines', () => {
    const forty = Array(40).fill('x').join('\n')
    expect(validateSnippet(`${forty}\n\n\n`).valid).toBe(true)
    expect(validateSnippet(`${forty}\nx`)).toEqual({ valid: false, reason: 'Máximo de 40 linhas' })
    expect(validateSnippet('x\ny')).toEqual({ valid: false, reason: 'Mínimo de 3 linhas' })
  })

  it('test_validateReadyPayload_rejects_explanation_out_of_bounds', () => {
    expect(validateReadyPayload('explain', { explanation: 'curto' }).valid).toBe(false)
    expect(validateReadyPayload('explain', { explanation: 'x'.repeat(600) }).valid).toBe(false)
    expect(validateReadyPayload('explain', { explanation: '  Soma dois números.  ' })).toEqual({
      valid: true,
      value: { explanation: 'Soma dois números.' },
    })
    expect(validateExplanation('         a         ').valid).toBe(false)
  })

  it('test_validateReadyPayload_rejects_unknown_verdict', () => {
    expect(validateReadyPayload('review', { verdict: 'sort-of' }).valid).toBe(false)
    expect(validateReadyPayload('review', {}).valid).toBe(false)
    expect(validateReadyPayload('review', { verdict: 'half' })).toEqual({ valid: true, value: { verdict: 'half' } })
  })

  it('test_pushPending_caps_at_three_and_keeps_newest', () => {
    let buffer: PendingMessage[] = []
    const dropped: PendingMessage[] = []
    for (const step of [4, 5, 6, 7]) {
      const result = pushPending(buffer, { kind: 'ready', step })
      buffer = result.buffer
      dropped.push(...result.dropped)
    }
    expect(buffer.map((message) => message.step)).toEqual([5, 6, 7])
    expect(dropped.map((message) => message.step)).toEqual([4])
  })

  it('test_takeApplicable_returns_and_removes_matching_entry', () => {
    const buffer: PendingMessage[] = [
      { kind: 'ready', step: 2 },
      { kind: 'ready', step: 3 },
      { kind: 'unready', step: 3 },
      { kind: 'ready', step: 5 },
    ]
    const { applicable, rest } = takeApplicable(buffer, 3)
    expect(applicable).toEqual([
      { kind: 'ready', step: 3 },
      { kind: 'unready', step: 3 },
    ])
    expect(rest).toEqual([{ kind: 'ready', step: 5 }])
  })

  it('test_applyVerdicts_increments_correct_player', () => {
    const tallies = applyVerdicts(emptyTallies(), 'correct', 'half')
    expect(tallies.remote).toEqual({ correct: 1, half: 0, wrong: 0 })
    expect(tallies.local).toEqual({ correct: 0, half: 1, wrong: 0 })
  })

  it('trims trailing blank lines and counts the remaining lines', () => {
    expect(trimSnippet('a

b

  
')).toBe('a

b')
    expect(countSnippetLines('a

b

  
')).toBe(3)
    expect(countSnippetLines('')).toBe(0)
  })
})
