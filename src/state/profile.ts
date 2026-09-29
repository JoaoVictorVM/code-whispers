import type { PlayerProfile } from '../types/game'

export const PROFILE_STORAGE_KEY = 'cw.profile'
export const NICKNAME_MIN_LENGTH = 2
export const NICKNAME_MAX_LENGTH = 16
export const AVATAR_IDS = [1, 2, 3, 4, 5, 6, 7, 8]
export const NICKNAME_RULE_MESSAGE = `Escolha um apelido de ${NICKNAME_MIN_LENGTH} a ${NICKNAME_MAX_LENGTH} caracteres`

export interface NicknameValidation {
  valid: boolean
  trimmed: string
  reason?: string
}

export function nicknameLength(value: string): number {
  return [...value].length
}

export function validateNickname(raw: string): NicknameValidation {
  const trimmed = raw.trim()
  const length = nicknameLength(trimmed)
  if (length < NICKNAME_MIN_LENGTH || length > NICKNAME_MAX_LENGTH) {
    return { valid: false, trimmed, reason: NICKNAME_RULE_MESSAGE }
  }
  return { valid: true, trimmed }
}

function isValidAvatarId(value: unknown): value is number {
  return typeof value === 'number' && AVATAR_IDS.includes(value)
}

export function parseProfile(data: unknown): PlayerProfile | null {
  if (typeof data !== 'object' || data === null) return null
  const { nickname, avatarId } = data as Record<string, unknown>
  if (typeof nickname !== 'string' || !isValidAvatarId(avatarId)) return null
  const validation = validateNickname(nickname)
  if (!validation.valid) return null
  return { nickname: validation.trimmed, avatarId }
}

export function loadStoredProfile(): PlayerProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
    if (!raw) return null
    return parseProfile(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveProfile(profile: PlayerProfile): void {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
  } catch {
    return
  }
}
