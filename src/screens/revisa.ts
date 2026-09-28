import { createEditor, type CodeEditor } from '../editor/codeEditor'
import { ready } from '../network/sync'
import { gameState } from '../state/gameState'
import type { GameState, Verdict } from '../types/game'
import { avatarSrc } from '../ui/avatarPicker'
import { createGameHud } from '../ui/gameHud'
import { createStamp, slamStamp, type StampTone } from '../ui/stamp'
import { createVerdictButtons } from '../ui/verdictButtons'
import type { ScreenModule } from './screen'

export const PHASE_LABEL = 'Avaliar'

const VERDICT_STAMPS: Record<Verdict, { text: string; tone: StampTone }> = {
  wrong: { text: 'ERROU', tone: 'cherry' },
  half: { text: 'MEIO CERTO', tone: 'sunflower' },
  correct: { text: 'CORRETO', tone: 'mint' },
}

let container: HTMLElement | null = null
let teardown: (() => void) | null = null

function opponentName(state: GameState): string {
  return state.remotePlayer?.nickname ?? 'o oponente'
}

function mount(root: HTMLElement): void {
  const initial = gameState.get()
  const round = initial.submissions[initial.round] ?? {}
  const ownSnippet = round.localCode ?? { language: 'javascript' as const, code: '' }
  let selected: Verdict | null = null

  container = document.createElement('section')
  container.dataset.screen = 'revisa'
  container.className = 'container flex flex-col gap-5 py-6'

  const hud = createGameHud({ phase: 'review', phaseLabel: PHASE_LABEL })

  const columns = document.createElement('div')
  columns.className = 'grid gap-6 lg:grid-cols-2'

  const codeColumn = document.createElement('div')
  codeColumn.className = 'flex min-w-0 flex-col gap-2'
  const codeTitle = document.createElement('h2')
  codeTitle.className =
    'self-start -rotate-2 rounded-lg border-[3px] border-ink bg-sky px-3 py-0.5 font-display text-lg text-ink shadow-[0_3px_0_var(--color-ink)]'
  codeTitle.textContent = 'Seu código'
  const editorSlot = document.createElement('div')
  editorSlot.dataset.role = 'editor-slot'
  codeColumn.append(codeTitle, editorSlot)

  const reviewColumn = document.createElement('div')
  reviewColumn.className = 'flex min-w-0 flex-col gap-4'

  const card = document.createElement('div')
  card.className = 'ink-card relative flex flex-col gap-3 rounded-tl-sm p-5'
  const cardTitle = document.createElement('h2')
  cardTitle.dataset.role = 'explanation-title'
  cardTitle.className = 'font-display text-lg'
  cardTitle.textContent = `${opponentName(initial)} explicou:`
  const quote = document.createElement('blockquote')
  quote.dataset.role = 'explanation'
  quote.className = 'whitespace-pre-wrap break-words border-l-[5px] border-bubblegum pl-4 text-lg font-semibold text-ink'
  quote.textContent = round.remoteExplanation ?? ''
  card.append(cardTitle, quote)
  const speaker = document.createElement('div')
  speaker.className = 'flex items-start gap-3'
  const speakerAvatar = document.createElement('img')
  speakerAvatar.src = avatarSrc('./avatars', initial.remotePlayer?.avatarId ?? 1)
  speakerAvatar.alt = ''
  speakerAvatar.width = 56
  speakerAvatar.height = 56
  speakerAvatar.className = 'size-14 shrink-0 rounded-full border-[3px] border-ink bg-bubblegum shadow-[0_3px_0_var(--color-ink)]'
  card.classList.add('flex-1')
  speaker.append(speakerAvatar, card)

  const status = document.createElement('p')
  status.dataset.role = 'review-status'
  status.className = 'animate-pulse text-center font-bold text-lilac'
  status.setAttribute('aria-live', 'polite')

  const opponentBadge = document.createElement('span')
  opponentBadge.dataset.role = 'opponent-judged-badge'
  opponentBadge.className =
    'self-center -rotate-2 rounded-full border-[3px] border-ink bg-bubblegum px-4 py-1 text-sm font-extrabold text-ink shadow-[0_3px_0_var(--color-ink)]'

  const verdictSlot = document.createElement('div')
  verdictSlot.dataset.role = 'verdict-slot'

  reviewColumn.append(speaker, opponentBadge, verdictSlot, status)
  columns.append(codeColumn, reviewColumn)
  container.append(hud.element, columns)

  const editor: CodeEditor = createEditor({
    parent: editorSlot,
    readOnly: true,
    initialLanguage: ownSnippet.language,
    initialCode: ownSnippet.code,
  })

  function choose(verdict: Verdict): void {
    if (selected !== null) return
    if (!ready({ verdict })) return
    selected = verdict
    const { text, tone } = VERDICT_STAMPS[verdict]
    const stamp = createStamp(text, tone, 'corner')
    card.append(stamp)
    slamStamp(stamp, card)
    render()
  }

  function render(): void {
    const state = gameState.get()
    const opponent = opponentName(state)
    const opponentJudged = state.readyFlags.opponent

    opponentBadge.hidden = !opponentJudged
    opponentBadge.textContent = opponentJudged ? `${opponent} já avaliou` : ''

    status.textContent = selected !== null && !opponentJudged ? `Aguardando a avaliação de ${opponent}…` : ''
    status.hidden = status.textContent === ''

    verdictSlot.replaceChildren(createVerdictButtons({ selected, onSelect: choose }))
  }

  render()
  const unsubscribe = gameState.onChange(render)
  root.append(container)

  teardown = () => {
    unsubscribe()
    hud.destroy()
    editor.destroy()
  }
}

function unmount(): void {
  teardown?.()
  teardown = null
  container?.remove()
  container = null
}

const revisa: ScreenModule = { mount, unmount }

export default revisa
