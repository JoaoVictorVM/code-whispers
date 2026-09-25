import { play } from '../audio/sfx'
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
import { canAnimate, gsap } from '../ui/motion'
import { createWhisperLine, type WhisperLine } from '../ui/whisperLine'
import { createRoomPanels, type RoomPanels } from './roomPanels'
import type { ScreenModule } from './screen'

const DEFAULT_AVATAR_ID = 1
const TITLE = 'Code Whispers'

let container: HTMLElement | null = null
let roomPanels: RoomPanels | null = null
let whisperLine: WhisperLine | null = null

function truncateNickname(value: string): string {
  return [...value].slice(0, NICKNAME_MAX_LENGTH).join('')
}

function createTitle(): { title: HTMLHeadingElement; letters: HTMLSpanElement[] } {
  const title = document.createElement('h1')
  title.className = 'display-title text-center text-5xl sm:text-7xl'
  const letters: HTMLSpanElement[] = []
  TITLE.split(' ').forEach((word, index) => {
    if (index > 0) title.appendChild(document.createTextNode(' '))
    const wordElement = document.createElement('span')
    wordElement.className = 'inline-block whitespace-nowrap'
    for (const char of word) {
      const letter = document.createElement('span')
      letter.className = 'inline-block'
      letter.textContent = char
      letters.push(letter)
      wordElement.append(letter)
    }
    title.append(wordElement)
  })
  return { title, letters }
}

function mount(root: HTMLElement): void {
  const stored = loadStoredProfile()
  let avatarId = stored?.avatarId ?? DEFAULT_AVATAR_ID
  let nickname = stored?.nickname ?? ''
  const animated = canAnimate()

  container = document.createElement('section')
  container.dataset.screen = 'inicio'
  container.className = 'container flex flex-col items-center gap-5 py-8 sm:gap-6'

  const { title, letters } = createTitle()

  const tagline = document.createElement('p')
  tagline.className = 'text-center text-lg font-semibold text-lilac'
  tagline.textContent = 'O telefone sem fio do código. Um escreve, o outro explica.'

  whisperLine = createWhisperLine({ local: { nickname, avatarId }, remote: null })

  const profile = document.createElement('div')
  profile.dataset.role = 'profile-card'
  profile.className = 'ink-card flex w-full max-w-3xl flex-col gap-5 p-5 sm:p-6'

  const profileHeading = document.createElement('h2')
  profileHeading.className = 'font-display text-xl'
  profileHeading.textContent = 'Seu jogador'

  const avatarSlot = document.createElement('div')

  const field = document.createElement('div')
  field.className = 'flex flex-col gap-2'

  const labelRow = document.createElement('div')
  labelRow.className = 'flex items-baseline justify-between'

  const label = document.createElement('label')
  label.htmlFor = 'nickname'
  label.className = 'text-sm font-extrabold uppercase tracking-wider'
  label.textContent = 'Apelido'

  const counter = document.createElement('span')
  counter.dataset.role = 'nickname-counter'
  counter.className = 'font-mono text-sm font-bold tabular-nums text-ink/60'

  const input = document.createElement('input')
  input.id = 'nickname'
  input.type = 'text'
  input.autocomplete = 'off'
  input.maxLength = NICKNAME_MAX_LENGTH
  input.placeholder = 'Como quer ser chamado?'
  input.value = nickname
  input.className = 'field-ink w-full px-4 py-3 text-lg font-bold'

  const hint = document.createElement('p')
  hint.id = 'nickname-hint'
  hint.dataset.role = 'nickname-hint'
  hint.className = 'text-sm font-bold text-cherry'
  input.setAttribute('aria-describedby', hint.id)

  labelRow.append(label, counter)
  field.append(labelRow, input, hint)
  profile.append(profileHeading, avatarSlot, field)

  const header = document.createElement('div')
  header.className = 'flex flex-col items-center gap-3 pt-4'
  header.append(title, tagline)
  container.append(header, whisperLine.element, profile)

  function syncProfile(): void {
    const validation = validateNickname(nickname)
    counter.textContent = `${nicknameLength(nickname)}/${NICKNAME_MAX_LENGTH}`
    hint.textContent = validation.valid ? '' : (validation.reason ?? '')
    hint.hidden = validation.valid
    input.setAttribute('aria-invalid', String(!validation.valid))
    whisperLine?.setLocal({ nickname, avatarId })

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
        play('select')
        renderAvatars()
        syncProfile()
        const chosen = avatarSlot.querySelector(`[data-avatar-id="${id}"]`)
        if (animated && chosen) {
          gsap.fromTo(chosen, { rotation: -18, scale: 0.8 }, { rotation: 0, scale: 1.1, duration: 0.6, ease: 'elastic.out(1.2, 0.4)' })
        }
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
  roomPanels = createRoomPanels()
  container.append(roomPanels.element)
  root.append(container)

  if (animated) {
    gsap
      .timeline()
      .from(letters, {
        y: -90,
        rotation: () => gsap.utils.random(-35, 35),
        opacity: 0,
        duration: 0.7,
        ease: 'back.out(2.2)',
        stagger: 0.045,
      })
      .from(tagline, { y: 16, opacity: 0, duration: 0.4 }, '-=0.35')
      .from([profile, roomPanels.element], { y: 36, opacity: 0, duration: 0.55, ease: 'back.out(1.4)', stagger: 0.1 }, '-=0.2')

    for (const letter of letters) {
      letter.addEventListener('mouseenter', () => {
        gsap.fromTo(letter, { y: 0 }, { y: -14, rotation: gsap.utils.random(-12, 12), duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out' })
      })
    }
  }
}

function unmount(): void {
  roomPanels?.destroy()
  roomPanels = null
  whisperLine?.destroy()
  whisperLine = null
  container?.remove()
  container = null
}

const inicio: ScreenModule = { mount, unmount }

export default inicio
