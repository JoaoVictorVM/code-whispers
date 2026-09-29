import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PROFILE_STORAGE_KEY,
  loadStoredProfile,
  parseProfile,
  saveProfile,
  validateNickname,
} from './profile'

describe('validateNickname', () => {
  it('test_validateNickname_rejects_too_short', () => {
    const result = validateNickname('A')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('2')
  })

  it('test_validateNickname_rejects_too_long', () => {
    const result = validateNickname('a'.repeat(17))
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('16')
  })

  it('test_validateNickname_rejects_whitespace_only', () => {
    expect(validateNickname('   ').valid).toBe(false)
  })

  it('test_validateNickname_trims_and_accepts', () => {
    expect(validateNickname('  Ana  ')).toEqual({ valid: true, trimmed: 'Ana' })
  })

  it('accepts the boundaries and unicode characters', () => {
    expect(validateNickname('Jo').valid).toBe(true)
    expect(validateNickname('a'.repeat(16)).valid).toBe(true)
    expect(validateNickname('João Ção!').valid).toBe(true)
  })
})

describe('profile storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('test_saveProfile_then_loadStoredProfile_roundtrip', () => {
    saveProfile({ nickname: 'Ana', avatarId: 4 })
    expect(loadStoredProfile()).toEqual({ nickname: 'Ana', avatarId: 4 })
  })

  it('test_loadStoredProfile_returns_null_when_empty', () => {
    expect(loadStoredProfile()).toBeNull()
  })

  it('returns null for malformed or out of range stored data', () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, '{not json')
    expect(loadStoredProfile()).toBeNull()
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ nickname: 'Ana', avatarId: 9 }))
    expect(loadStoredProfile()).toBeNull()
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ nickname: 'A', avatarId: 2 }))
    expect(loadStoredProfile()).toBeNull()
  })

  it('test_localStorage_failure_does_not_throw', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => saveProfile({ nickname: 'Ana', avatarId: 1 })).not.toThrow()
    expect(() => loadStoredProfile()).not.toThrow()
    expect(loadStoredProfile()).toBeNull()
  })
})

describe('parseProfile', () => {
  it('accepts a valid profile and trims the nickname', () => {
    expect(parseProfile({ nickname: '  Gui  ', avatarId: 3 })).toEqual({ nickname: 'Gui', avatarId: 3 })
  })

  it('rejects malformed profiles', () => {
    expect(parseProfile(null)).toBeNull()
    expect(parseProfile('Gui')).toBeNull()
    expect(parseProfile({ nickname: 'G', avatarId: 3 })).toBeNull()
    expect(parseProfile({ nickname: 'Gui', avatarId: 42 })).toBeNull()
    expect(parseProfile({ nickname: 'Gui', avatarId: '3' })).toBeNull()
  })
})
