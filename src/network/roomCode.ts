export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 6

export function generateRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH))
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('')
}

export function sanitizeRoomCodeInput(raw: string): string {
  return Array.from(raw.toUpperCase())
    .filter((char) => ROOM_CODE_ALPHABET.includes(char))
    .slice(0, ROOM_CODE_LENGTH)
    .join('')
}

export function normalizeRoomCode(raw: string): string | null {
  const code = raw.trim().toUpperCase()
  if (code.length !== ROOM_CODE_LENGTH) return null
  for (const char of code) {
    if (!ROOM_CODE_ALPHABET.includes(char)) return null
  }
  return code
}
