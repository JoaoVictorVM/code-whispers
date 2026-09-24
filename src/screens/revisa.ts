import { createEditor, type CodeEditor } from '../editor/codeEditor'
import { ready } from '../network/sync'
import { gameState } from '../state/gameState'
import type { GameState, Verdict } from '../types/game'
import { createRoundHeader } from '../ui/roundHeader'
import { createVerdictButtons } from '../ui/verdictButtons'
import type { ScreenModule } from './screen'

export const PHASE_LABEL = 'Avaliar'

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
  container.className = 'container flex flex-col gap-4 py-8'

  const header = createRoundHeader({
    round: initial.round,
    totalRounds: initial.room?.mode ?? initial.mode,
    phaseLabel: PHASE_LABEL,
  })

  const columns = document.createElement('div')
  columns.className = 'grid gap-6 lg:grid-cols-2'

  const codeColumn = document.createElement('div')
  codeColumn.className = 'flex min-w-0 flex-col gap-2'
  const codeTitle = document.createElement('h2')
  codeTitle.className = 'text-lg font-semibold'
  codeTitle.textContent = 'Seu código'
  const editorSlot = document.createElement('div')
  editorSlot.dataset.role = 'editor-slot'
  codeColumn.append(codeTitle, editorSlot)

  const reviewColumn = document.createElement('div')
  reviewColumn.className = 'flex min-w-0 flex-col gap-4'

  const card = document.createElement('div')
  card.className = 'flex flex-col gap-3 rounded-xl bg-surface p-5'
  const cardTitle = document.createElement('h2')
  cardTitle.dataset.role = 'explanation-title'
  cardTitle.className = 'text-lg font-semibold'
  cardTitle.textContent = `${opponentName(initial)} explicou:`
  const quote = document.createElement('blockquote')
  quote.dataset.role = 'explanation'
  quote.className = 'whitespace-pre-wrap break-words border-l-4 border-accent pl-4 text-text'
  quote.textContent = round.remoteExplanation ?? ''
  card.append(cardTitle, quote)

  const status = document.createElement('p')
  status.dataset.role = 'review-status'
  status.className = 'text-sm text-muted'
  status.setAttribute('aria-live', 'polite')

  const opponentBadge = document.createElement('span')
  opponentBadge.dataset.role = 'opponent-judged-badge'
  opponentBadge.className = 'self-start rounded-full bg-success/20 px-3 py-1 text-sm text-success'

  const verdictSlot = document.createElement('div')
  verdictSlot.dataset.role = 'verdict-slot'

  reviewColumn.append(card, opponentBadge, verdictSlot, status)
  columns.append(codeColumn, reviewColumn)
  container.append(header, columns)

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
