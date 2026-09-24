import { createEditor, type CodeEditor } from '../editor/codeEditor'
import { LANGUAGES } from '../editor/languages'
import { ready, unready } from '../network/sync'
import {
  EXPLANATION_MAX_CHARS,
  EXPLANATION_MIN_CHARS,
  charCount,
  validateExplanation,
} from '../network/syncProtocol'
import { gameState } from '../state/gameState'
import type { GameState, LanguageId } from '../types/game'
import { createReadyButton } from '../ui/readyButton'
import { createRoundHeader } from '../ui/roundHeader'
import type { ScreenModule } from './screen'

export const PHASE_LABEL = 'Explicar'

let container: HTMLElement | null = null
let teardown: (() => void) | null = null

function opponentName(state: GameState): string {
  return state.remotePlayer?.nickname ?? 'o oponente'
}

function languageLabel(id: LanguageId): string {
  return LANGUAGES.find((language) => language.id === id)?.label ?? id
}

function mount(root: HTMLElement): void {
  const initial = gameState.get()
  const snippet = initial.submissions[initial.round]?.remoteCode ?? { language: 'javascript' as const, code: '' }

  container = document.createElement('section')
  container.dataset.screen = 'explica'
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
  const codeTitleRow = document.createElement('div')
  codeTitleRow.className = 'flex items-baseline justify-between gap-3'
  const codeTitle = document.createElement('h2')
  codeTitle.dataset.role = 'code-title'
  codeTitle.className = 'text-lg font-semibold'
  codeTitle.textContent = `Código de ${opponentName(initial)}`
  const languageInfo = document.createElement('span')
  languageInfo.dataset.role = 'language-label'
  languageInfo.className = 'text-sm text-muted'
  languageInfo.textContent = `Linguagem: ${languageLabel(snippet.language)}`
  codeTitleRow.append(codeTitle, languageInfo)
  const editorSlot = document.createElement('div')
  editorSlot.dataset.role = 'editor-slot'
  codeColumn.append(codeTitleRow, editorSlot)

  const explanationColumn = document.createElement('div')
  explanationColumn.className = 'flex min-w-0 flex-col gap-2'
  const explanationLabel = document.createElement('label')
  explanationLabel.htmlFor = 'explanation'
  explanationLabel.className = 'text-lg font-semibold'
  explanationLabel.textContent = 'Sua explicação'
  const textarea = document.createElement('textarea')
  textarea.id = 'explanation'
  textarea.dataset.role = 'explanation-input'
  textarea.placeholder = 'Explique o que esse código faz…'
  textarea.className =
    'min-h-64 w-full flex-1 resize-y rounded-lg border border-surface bg-surface p-4 text-text placeholder:text-muted transition-opacity focus:border-accent focus:outline-none'
  const counter = document.createElement('span')
  counter.dataset.role = 'char-counter'
  explanationColumn.append(explanationLabel, textarea, counter)

  columns.append(codeColumn, explanationColumn)

  const footer = document.createElement('div')
  footer.className = 'flex justify-end'
  const readySlot = document.createElement('div')
  readySlot.dataset.role = 'ready-slot'
  footer.append(readySlot)

  container.append(header, columns, footer)

  const editor: CodeEditor = createEditor({
    parent: editorSlot,
    readOnly: true,
    initialLanguage: snippet.language,
    initialCode: snippet.code,
  })

  function render(): void {
    const state = gameState.get()
    const trimmed = textarea.value.trim()
    const chars = charCount(trimmed)
    const validation = validateExplanation(textarea.value)
    const outOfRange = chars < EXPLANATION_MIN_CHARS || chars > EXPLANATION_MAX_CHARS

    counter.textContent = `Caracteres ${chars}/${EXPLANATION_MAX_CHARS}`
    counter.className = `text-sm tabular-nums ${outOfRange ? 'text-danger' : 'text-muted'}`
    counter.dataset.invalid = String(outOfRange)

    const localReady = state.readyFlags.local
    textarea.readOnly = localReady
    textarea.classList.toggle('opacity-60', localReady)
    textarea.setAttribute('aria-invalid', String(!validation.valid))

    readySlot.replaceChildren(
      createReadyButton({
        localReady,
        opponentReady: state.readyFlags.opponent,
        opponentNickname: opponentName(state),
        disabled: !validation.valid,
        disabledReason: validation.valid ? '' : validation.reason,
        onToggle: () => {
          if (gameState.get().readyFlags.local) {
            unready()
            return
          }
          const current = validateExplanation(textarea.value)
          if (current.valid) ready({ explanation: current.value })
        },
      }),
    )
  }

  textarea.addEventListener('input', render)
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

const explica: ScreenModule = { mount, unmount }

export default explica
