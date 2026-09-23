import { describe, expect, it } from 'vitest'
import {
  ROOM_CODE_ALPHABET,
  generateRoomCode,
  normalizeRoomCode,
  sanitizeRoomCodeInput,
} from './roomCode'

describe('roomCode', () => {
  it('uses the 32 symbol alphabet without ambiguous characters', () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(32)
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(32)
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[0O1I]/)
  })

  it('test_generateRoomCode_returns_six_chars_from_alphabet', () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateRoomCode()
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    }
  })

  it('test_normalizeRoomCode_accepts_lowercase_and_trims', () => {
    expect(normalizeRoomCode('  ab3xyz ')).toBe('AB3XYZ')
  })

  it('test_normalizeRoomCode_rejects_invalid_length_or_chars', () => {
    expect(normalizeRoomCode('AB3XY')).toBeNull()
    expect(normalizeRoomCode('AB3XYZW')).toBeNull()
    expect(normalizeRoomCode('AB0XYZ')).toBeNull()
    expect(normalizeRoomCode('ABOXYZ')).toBeNull()
    expect(normalizeRoomCode('AB1XYZ')).toBeNull()
    expect(normalizeRoomCode('ABIXYZ')).toBeNull()
    expect(normalizeRoomCode('AB XYZ')).toBeNull()
  })

  it('sanitizes typed input by uppercasing and dropping invalid characters', () => {
    expect(sanitizeRoomCodeInput(' ab-0c1d ef9z')).toBe('ABCDEF')
  })
})
