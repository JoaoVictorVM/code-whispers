import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import inicio from './inicio'
import { gameState } from '../state/gameState'
import { PROFILE_STORAGE_KEY } from '../state/profile'

let root: HTMLElement

function nicknameInput(): HTMLInputElement {
  return root.querySelector<HTMLInputElement>('#nickname')!
}

function typeNickname(value: string): void {
  const input = nicknameInput()
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function clickAvatar(id: number): void {
  root.querySelector<HTMLButtonElement>(`[data-avatar-id="${id}"]`)!.click()
}

function selectedAvatarIds(): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-avatar-id].selected')).map(
    (tile) => tile.dataset.avatarId!,
  )
}

function storedProfile(): unknown {
  const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

describe('inicio profile section', () => {
  beforeEach(() => {
    localStorage.clear()
    gameState.reset()
    document.body.innerHTML = '<div id="app"></div>'
    root = document.querySelector<HTMLElement>('#app')!
  })

  afterEach(() => {
    inicio.unmount()
  })

  it('test_renders_eight_avatars_and_nickname_field', () => {
    inicio.mount(root)
    expect(root.querySelectorAll('[data-avatar-id]')).toHaveLength(8)
    expect(selectedAvatarIds()).toEqual(['1'])
    expect(nicknameInput().value).toBe('')
    expect(root.querySelector('[data-role="nickname-counter"]')?.textContent).toBe('0/16')
    expect(gameState.get().localPlayer).toBeNull()
  })

  it('test_typing_invalid_nickname_does_not_patch_gameState', () => {
    inicio.mount(root)
    typeNickname('A')
    expect(gameState.get().localPlayer).toBeNull()
    expect(root.querySelector('[data-role="nickname-hint"]')?.textContent).toBe(
      'Escolha um apelido de 2 a 16 caracteres',
    )
    expect(nicknameInput().getAttribute('aria-invalid')).toBe('true')
  })

  it('test_typing_valid_nickname_patches_gameState', () => {
    inicio.mount(root)
    typeNickname('  Bruna ')
    expect(gameState.get().localPlayer?.nickname).toBe('Bruna')
    expect(root.querySelector<HTMLElement>('[data-role="nickname-hint"]')!.hidden).toBe(true)
    expect(root.querySelector('[data-role="nickname-counter"]')?.textContent).toBe('8/16')
  })

  it('clears localPlayer when a valid nickname becomes invalid', () => {
    inicio.mount(root)
    typeNickname('Bruna')
    typeNickname('   ')
    expect(gameState.get().localPlayer).toBeNull()
  })

  it('rejects characters beyond the 16th', () => {
    inicio.mount(root)
    typeNickname('a'.repeat(17))
    expect(nicknameInput().value).toBe('a'.repeat(16))
    expect(nicknameInput().maxLength).toBe(16)
  })

  it('test_selecting_avatar_patches_gameState', () => {
    inicio.mount(root)
    typeNickname('Bruna')
    clickAvatar(4)
    expect(gameState.get().localPlayer?.avatarId).toBe(4)
    expect(selectedAvatarIds()).toEqual(['4'])
  })

  it('test_prefill_from_stored_profile', () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ nickname: 'Caio', avatarId: 6 }))
    inicio.mount(root)
    expect(nicknameInput().value).toBe('Caio')
    expect(selectedAvatarIds()).toEqual(['6'])
    expect(gameState.get().localPlayer).toEqual({ nickname: 'Caio', avatarId: 6 })
  })

  it('test_valid_profile_change_triggers_saveProfile', () => {
    inicio.mount(root)
    typeNickname('Dani')
    expect(storedProfile()).toEqual({ nickname: 'Dani', avatarId: 1 })
    clickAvatar(7)
    expect(storedProfile()).toEqual({ nickname: 'Dani', avatarId: 7 })
  })

  it('loads with empty defaults when localStorage is corrupted', () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, 'garbage')
    expect(() => inicio.mount(root)).not.toThrow()
    expect(nicknameInput().value).toBe('')
    expect(selectedAvatarIds()).toEqual(['1'])
  })

  it('test_valid_profile_available_via_gameState_for_room_consumption', () => {
    inicio.mount(root)
    typeNickname('Eva')
    clickAvatar(2)
    expect(gameState.get().localPlayer).toStrictEqual({ nickname: 'Eva', avatarId: 2 })
  })
})
