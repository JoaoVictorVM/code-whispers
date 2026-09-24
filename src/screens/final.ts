import { leaveRoom } from '../network/room'
import { rematch } from '../network/sync'
import { gameState } from '../state/gameState'
import type { GameState, MatchMode, PlayerProfile, VerdictTally } from '../types/game'
import { avatarSrc } from '../ui/avatarPicker'
import type { ScreenModule } from './screen'

export const MODE_NAMES: Record<MatchMode, string> = {
  3: 'Rápida',
  5: 'Média',
  7: 'Maior',
}

const TALLY_ROWS: readonly { key: keyof VerdictTally; label: string }[] = [
  { key: 'correct', label: 'Correto' },
  { key: 'half', label: 'Meio Certo' },
  { key: 'wrong', label: 'Errou' },
]

let container: HTMLElement | null = null
let teardown: (() => void) | null = null

function opponentName(state: GameState): string {
  return state.remotePlayer?.nickname ?? 'o oponente'
}

function createPlayerCard(side: 'local' | 'remote', profile: PlayerProfile | null, tally: VerdictTally): HTMLElement {
  const card = document.createElement('article')
  card.dataset.role = `${side}-card`
  card.className = 'flex flex-col items-center gap-4 rounded-xl bg-surface p-6'

  const avatar = document.createElement('img')
  avatar.src = avatarSrc('./avatars', profile?.avatarId ?? 1)
  avatar.alt = ''
  avatar.width = 96
  avatar.height = 96
  avatar.className = 'size-24 rounded-full bg-bg'

  const nickname = document.createElement('h2')
  nickname.dataset.role = 'nickname'
  nickname.className = 'text-xl font-semibold'
  nickname.textContent = profile?.nickname ?? ''

  const list = document.createElement('dl')
  list.className = 'grid w-full max-w-48 grid-cols-[1fr_auto] gap-x-4 gap-y-1'
  for (const row of TALLY_ROWS) {
    const term = document.createElement('dt')
    term.className = 'text-muted'
    term.textContent = row.label
    const value = document.createElement('dd')
    value.dataset.tally = row.key
    value.className = 'text-right font-semibold tabular-nums'
    value.textContent = String(tally[row.key])
    list.append(term, value)
  }

  card.append(avatar, nickname, list)
  return card
}

function mount(root: HTMLElement): void {
  const initial = gameState.get()
  const mode = initial.room?.mode ?? initial.mode

  container = document.createElement('section')
  container.dataset.screen = 'final'
  container.className = 'container flex flex-col items-center gap-8 py-10'

  const header = document.createElement('h1')
  header.className = 'text-center text-3xl font-bold tracking-tight'
  header.textContent = `Fim de jogo — ${MODE_NAMES[mode]}, ${mode} rodadas`

  const cards = document.createElement('div')
  cards.className = 'grid w-full max-w-2xl gap-4 sm:grid-cols-2'
  cards.append(
    createPlayerCard('local', initial.localPlayer, initial.tallies.local),
    createPlayerCard('remote', initial.remotePlayer, initial.tallies.remote),
  )

  const actions = document.createElement('div')
  actions.className = 'flex flex-col items-center gap-3'

  const badge = document.createElement('span')
  badge.dataset.role = 'rematch-badge'
  badge.className = 'rounded-full bg-success/20 px-3 py-1 text-sm text-success'

  const rematchButton = document.createElement('button')
  rematchButton.type = 'button'
  rematchButton.dataset.role = 'rematch'
  rematchButton.className =
    'rounded-lg bg-accent px-8 py-3 font-semibold text-white transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-accent'
  rematchButton.addEventListener('click', () => {
    rematch()
  })

  const exitButton = document.createElement('button')
  exitButton.type = 'button'
  exitButton.dataset.role = 'exit'
  exitButton.className = 'text-sm text-muted underline hover:text-text'
  exitButton.textContent = 'Sair'
  exitButton.addEventListener('click', () => {
    leaveRoom()
    gameState.patch({ screen: 'inicio' })
  })

  actions.append(badge, rematchButton, exitButton)
  container.append(header, cards, actions)

  function render(): void {
    const state = gameState.get()
    const opponent = opponentName(state)
    const { local, opponent: opponentWants } = state.rematchFlags

    rematchButton.disabled = local
    rematchButton.textContent = local ? `Aguardando ${opponent}…` : 'Jogar de novo'

    badge.hidden = !opponentWants || local
    badge.textContent = `${opponent} quer jogar de novo`
  }

  render()
  const unsubscribe = gameState.onChange(render)
  root.append(container)

  teardown = unsubscribe
}

function unmount(): void {
  teardown?.()
  teardown = null
  container?.remove()
  container = null
}

const final: ScreenModule = { mount, unmount }

export default final
