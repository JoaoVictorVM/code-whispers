import { leaveRoom } from '../network/room'
import { rematch } from '../network/sync'
import { gameState } from '../state/gameState'
import type { GameState, MatchMode, PlayerProfile, VerdictTally } from '../types/game'
import { avatarSrc } from '../ui/avatarPicker'
import { celebrate } from '../ui/confetti'
import { canAnimate, gsap } from '../ui/motion'
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

const TALLY_TONES: Record<keyof VerdictTally, string> = {
  correct: 'bg-mint',
  half: 'bg-sunflower',
  wrong: 'bg-cherry',
}

let container: HTMLElement | null = null
let teardown: (() => void) | null = null

function opponentName(state: GameState): string {
  return state.remotePlayer?.nickname ?? 'o oponente'
}

function createPlayerCard(side: 'local' | 'remote', profile: PlayerProfile | null, tally: VerdictTally): HTMLElement {
  const card = document.createElement('article')
  card.dataset.role = `${side}-card`
  card.className = `ink-card flex flex-col items-center gap-4 p-6 ${side === 'local' ? '-rotate-2' : 'rotate-2'}`

  const avatar = document.createElement('img')
  avatar.src = avatarSrc('./avatars', profile?.avatarId ?? 1)
  avatar.alt = ''
  avatar.width = 96
  avatar.height = 96
  avatar.className = `size-24 rounded-full border-[3px] border-ink shadow-[0_4px_0_var(--color-ink)] ${side === 'local' ? 'bg-sky' : 'bg-bubblegum'}`

  const nickname = document.createElement('h2')
  nickname.dataset.role = 'nickname'
  nickname.className = 'font-display text-2xl'
  nickname.textContent = profile?.nickname ?? ''

  const list = document.createElement('dl')
  list.className = 'grid w-full max-w-56 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2'
  for (const row of TALLY_ROWS) {
    const term = document.createElement('dt')
    term.className = 'font-extrabold uppercase tracking-wider text-ink/70'
    term.textContent = row.label
    const value = document.createElement('dd')
    value.dataset.tally = row.key
    value.className = `min-w-10 rounded-lg border-[3px] border-ink px-2 text-center font-display text-xl tabular-nums ${TALLY_TONES[row.key]}`
    value.textContent = String(tally[row.key])
    list.append(term, value)
  }

  card.append(avatar, nickname, list)
  return card
}

function intro(header: HTMLElement, cards: HTMLElement[], actions: HTMLElement): void {
  const values = cards.flatMap((card) => Array.from(card.querySelectorAll<HTMLElement>('[data-tally]')))
  const targets = values.map((value) => Number(value.textContent))
  for (const value of values) value.textContent = '0'
  gsap
    .timeline({ onComplete: () => celebrate() })
    .from(header, { y: -40, scale: 0.8, opacity: 0, duration: 0.5, ease: 'back.out(2)' })
    .from(cards, { rotationY: 90, opacity: 0, duration: 0.55, ease: 'back.out(1.6)', stagger: 0.18 }, '-=0.1')
    .to(
      values.map((_, index) => ({ n: 0, index })),
      {
        n: (index: number) => targets[index],
        duration: 0.8,
        ease: 'power2.out',
        snap: { n: 1 },
        onUpdate() {
          for (const target of this.targets() as { n: number; index: number }[]) {
            values[target.index].textContent = String(Math.round(target.n))
          }
        },
        onComplete: () => values.forEach((value, index) => (value.textContent = String(targets[index]))),
      },
      '-=0.1',
    )
    .from(actions, { y: 30, opacity: 0, duration: 0.4 }, '-=0.3')
}

function mount(root: HTMLElement): void {
  const initial = gameState.get()
  const mode = initial.room?.mode ?? initial.mode

  container = document.createElement('section')
  container.dataset.screen = 'final'
  container.className = 'container flex flex-col items-center gap-8 py-10'

  const header = document.createElement('h1')
  header.className = 'display-title text-center text-4xl sm:text-5xl'
  header.textContent = `Fim de jogo — ${MODE_NAMES[mode]}, ${mode} rodadas`

  const cards = document.createElement('div')
  cards.className = 'grid w-full max-w-2xl gap-6 sm:grid-cols-2'
  cards.append(
    createPlayerCard('local', initial.localPlayer, initial.tallies.local),
    createPlayerCard('remote', initial.remotePlayer, initial.tallies.remote),
  )

  const actions = document.createElement('div')
  actions.className = 'flex flex-col items-center gap-3'

  const badge = document.createElement('span')
  badge.dataset.role = 'rematch-badge'
  badge.className =
    'rounded-full border-[3px] border-ink bg-bubblegum px-4 py-1 text-sm font-extrabold text-ink shadow-[0_3px_0_var(--color-ink)]'

  const rematchButton = document.createElement('button')
  rematchButton.type = 'button'
  rematchButton.dataset.role = 'rematch'
  rematchButton.className = 'btn-chunky bg-tangerine px-10 py-4 text-2xl text-ink'
  rematchButton.addEventListener('click', () => {
    rematch()
  })

  const exitButton = document.createElement('button')
  exitButton.type = 'button'
  exitButton.dataset.role = 'exit'
  exitButton.className = 'text-sm font-bold text-lilac underline decoration-2 underline-offset-4 hover:text-paper'
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
  if (canAnimate()) intro(header, Array.from(cards.children) as HTMLElement[], actions)

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
