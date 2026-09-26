import { createEditor, type CodeEditor } from '../editor/codeEditor'
import { DEFAULT_LANGUAGE } from '../editor/languages'
import { ready, unready } from '../network/sync'
import {
  SNIPPET_MAX_CHARS,
  SNIPPET_MAX_LINES,
  SNIPPET_MIN_LINES,
  charCount,
  countSnippetLines,
  trimSnippet,
  validateSnippet,
} from '../network/syncProtocol'
import { gameState } from '../state/gameState'
import type { GameState, LanguageId } from '../types/game'
import { createReadyButton } from '../ui/readyButton'
import { createGameHud, type GameHud } from '../ui/gameHud'
import { createStamp, slamStamp } from '../ui/stamp'
import type { ScreenModule } from './screen'

export const PHASE_LABEL = 'Escrever'

let container: HTMLElement | null = null
let teardown: (() => void) | null = null

function opponentName(state: GameState): string {
  return state.remotePlayer?.nickname ?? 'o oponente'
}

function counterClass(invalid: boolean): string {
  return `rounded-lg border-[3px] border-ink px-2.5 py-0.5 ${invalid ? 'bg-cherry text-ink' : 'bg-paper text-ink'}`
}

function mount(root: HTMLElement): void {
  const initial = gameState.get()
  let language: LanguageId = DEFAULT_LANGUAGE
  let code = ''
  let editor: CodeEditor | null = null
  let editorLocked = false
  let hud: GameHud | null = null

  container = document.createElement('section')
  container.dataset.screen = 'code'
  container.className = 'container flex flex-col gap-4 py-6'

  hud = createGameHud({ phase: 'code', phaseLabel: PHASE_LABEL })

  const instruction = document.createElement('p')
  instruction.dataset.role = 'instruction'
  instruction.className = 'self-start rounded-2xl rounded-bl-sm border-[3px] border-ink bg-paper px-4 py-2 font-bold text-ink shadow-[0_3px_0_var(--color-ink)]'
  instruction.textContent = `Escreva ou cole um trecho de código para ${opponentName(initial)} explicar.`

  const editorSlot = document.createElement('div')
  editorSlot.dataset.role = 'editor-slot'
  editorSlot.className = 'relative transition-opacity'
  const stamp = createStamp('PRONTO!', 'mint')

  const counters = document.createElement('div')
  counters.className = 'flex flex-wrap gap-2 font-mono text-sm font-bold tabular-nums'
  const lineCounter = document.createElement('span')
  lineCounter.dataset.role = 'line-counter'
  const charCounter = document.createElement('span')
  charCounter.dataset.role = 'char-counter'
  counters.append(lineCounter, charCounter)

  const footer = document.createElement('div')
  footer.className = 'flex justify-end pb-4'
  const readySlot = document.createElement('div')
  readySlot.dataset.role = 'ready-slot'
  footer.append(readySlot)

  container.append(hud.element, instruction, editorSlot, counters, footer)

  function buildEditor(readOnly: boolean): void {
    editor?.destroy()
    editor = createEditor({
      parent: editorSlot,
      readOnly,
      initialLanguage: language,
      initialCode: code,
      onChange: (snapshot) => {
        language = snapshot.language
        code = snapshot.code
        render()
      },
    })
    const wasLocked = editorLocked
    editorLocked = readOnly
    editorSlot.classList.toggle('opacity-60', readOnly)
    if (readOnly) {
      editorSlot.append(stamp)
      if (!wasLocked) slamStamp(stamp, editorSlot)
    } else {
      stamp.remove()
    }
  }

  function render(): void {
    const state = gameState.get()
    const trimmed = trimSnippet(code)
    const lines = countSnippetLines(code)
    const chars = charCount(trimmed)
    const validation = validateSnippet(trimmed)
    const filledLines = trimmed.split('\n').filter((line) => line.trim() !== '').length
    const linesOutOfRange = filledLines < SNIPPET_MIN_LINES || lines > SNIPPET_MAX_LINES
    const charsOutOfRange = chars > SNIPPET_MAX_CHARS

    lineCounter.textContent = `Linhas ${lines}/${SNIPPET_MAX_LINES}`
    lineCounter.className = counterClass(linesOutOfRange)
    lineCounter.dataset.invalid = String(linesOutOfRange)
    charCounter.textContent = `Caracteres ${chars}/${SNIPPET_MAX_CHARS}`
    charCounter.className = counterClass(charsOutOfRange)
    charCounter.dataset.invalid = String(charsOutOfRange)

    const localReady = state.readyFlags.local
    if (localReady !== editorLocked) buildEditor(localReady)

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
          const current = trimSnippet(code)
          if (validateSnippet(current).valid) ready({ language, code: current })
        },
      }),
    )
  }

  buildEditor(false)
  render()
  const unsubscribe = gameState.onChange(render)
  root.append(container)

  teardown = () => {
    unsubscribe()
    hud?.destroy()
    hud = null
    editor?.destroy()
    editor = null
  }
}

function unmount(): void {
  teardown?.()
  teardown = null
  container?.remove()
  container = null
}

const codeScreen: ScreenModule = { mount, unmount }

export default codeScreen
