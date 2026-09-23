import { gameState } from '../state/gameState'
import {
  AVATAR_IDS,
  NICKNAME_MAX_LENGTH,
  loadStoredProfile,
  nicknameLength,
  saveProfile,
  validateNickname,
} from '../state/profile'
import { createAvatarPicker } from '../ui/avatarPicker'
import type { ScreenModule } from './screen'

const DEFAULT_AVATAR_ID = 1

let container: HTMLElement | null = null

function truncateNickname(value: string): string {
  return [...value].slice(0, NICKNAME_MAX_LENGTH).join('')
}

function mount(root: HTMLElement): void {
  const stored = loadStoredProfile()
  let avatarId = stored?.avatarId ?? DEFAULT_AVATAR_ID
  let nickname = stored?.nickname ?? ''

  container = document.createElement('section')
  container.dataset.screen = 'inicio'
  container.className = 'container flex flex-col items-center gap-8 py-10'

  const title = document.createElement('h1')
  title.className = 'text-4xl font-bold tracking-tight'
  title.textContent = 'Code Whispers'

  const profile = document.createElement('div')
  profile.className = 'flex w-full max-w-md flex-col gap-6'

  const avatarSlot = document.createElement('div')

  const field = document.createElement('div')
  field.className = 'flex flex-col gap-2'

  const labelRow = document.createElement('div')
  labelRow.className = 'flex items-baseline justify-between'

  const label = document.createElement('label')
  label.htmlFor = 'nickname'
  label.className = 'text-sm font-medium'
  label.textContent = 'Apelido'

  const counter = document.createElement('span')
  counter.dataset.role = 'nickname-counter'
  counter.className = 'text-sm text-muted tabular-nums'

  const input = document.createElement('input')
  input.id = 'nickname'
  input.type = 'text'
  input.autocomplete = 'off'
  input.maxLength = NICKNAME_MAX_LENGTH
  input.placeholder = 'Como quer ser chamado?'
  input.value = nickname
  input.className =
    'w-full rounded-lg border border-surface bg-surface px-4 py-3 text-text placeholder:text-muted focus:border-accent focus:outline-none'

  const hint = document.createElement('p')
  hint.id = 'nickname-hint'
  hint.dataset.role = 'nickname-hint'
  hint.className = 'text-sm text-warning'
  input.setAttribute('aria-describedby', hint.id)

  labelRow.append(label, counter)
  field.append(labelRow, input, hint)
  profile.append(avatarSlot, field)
  container.append(title, profile)

  function syncProfile(): void {
    const validation = validateNickname(nickname)
    counter.textContent = `${nicknameLength(nickname)}/${NICKNAME_MAX_LENGTH}`
    hint.textContent = validation.valid ? '' : (validation.reason ?? '')
    hint.hidden = validation.valid
    input.setAttribute('aria-invalid', String(!validation.valid))

    if (!validation.valid) {
      if (gameState.get().localPlayer !== null) gameState.patch({ localPlayer: null })
      return
    }

    const localPlayer = { nickname: validation.trimmed, avatarId }
    gameState.patch({ localPlayer })
    saveProfile(localPlayer)
  }

  function renderAvatars(): void {
    const hadFocus = avatarSlot.contains(document.activeElement)
    const picker = createAvatarPicker({
      avatarIds: AVATAR_IDS,
      selectedId: avatarId,
      onSelect: (id) => {
        if (id === avatarId) return
        avatarId = id
        renderAvatars()
        syncProfile()
      },
    })
    avatarSlot.replaceChildren(picker)
    if (hadFocus) {
      picker.querySelector<HTMLButtonElement>(`[data-avatar-id="${avatarId}"]`)?.focus()
    }
  }

  input.addEventListener('input', () => {
    const limited = truncateNickname(input.value)
    if (limited !== input.value) input.value = limited
    nickname = limited
    syncProfile()
  })

  renderAvatars()
  syncProfile()
  root.append(container)
}

function unmount(): void {
  container?.remove()
  container = null
}

const inicio: ScreenModule = { mount, unmount }

export default inicio
