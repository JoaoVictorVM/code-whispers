import { createEditor, type CodeEditor } from '../editor/codeEditor'
import { DEFAULT_LANGUAGE, LANGUAGES } from '../editor/languages'
import { retractStep, submitStep } from '../network/telephone'
import type { StepContent } from '../network/telephoneProtocol'
import {
  EXPLANATION_MAX_CHARS,
  EXPLANATION_MIN_CHARS,
  SNIPPET_MAX_CHARS,
  SNIPPET_MAX_LINES,
  SNIPPET_MIN_LINES,
  charCount,
  countSnippetLines,
  trimSnippet,
  validateExplanation,
  validateSnippet,
  type ValidationResult,
} from '../network/syncProtocol'
import { gameState } from '../state/gameState'
import type { CodeSubmission, GameState, LanguageId, TelephoneState } from '../types/game'
import { showPhaseSplash } from '../ui/phaseSplash'
import { createReadyButton } from '../ui/readyButton'
import { createStamp, slamStamp } from '../ui/stamp'
import { STEP_LABELS, createStepHud, type StepHud } from '../ui/stepHud'
import type { ScreenModule } from './screen'

interface StepBody {
  element: HTMLElement
  validate(): ValidationResult<StepContent>
  answer(): StepContent
  setLocked(locked: boolean): void
  destroy(): void
}

const titleTagClass =
  'self-start rounded-lg border-[3px] border-ink px-3 py-0.5 font-display text-lg text-ink shadow-[0_3px_0_var(--color-ink)]'

let container: HTMLElement | null = null
let teardown: (() => void) | null = null

export function waitingText(missing: number): string {
  if (missing <= 0) return 'Passando para a próxima etapa…'
  return missing === 1 ? 'Esperando 1 jogador…' : `Esperando ${missing} jogadores…`
}

function languageLabel(id: LanguageId): string {
  return LANGUAGES.find((language) => language.id === id)?.label ?? id
}

function titleTag(text: string, tone: string, tilt: string, role = 'step-title'): HTMLElement {
  const title = document.createElement('h2')
  title.dataset.role = role
  title.className = `${titleTagClass} ${tone} ${tilt}`
  title.textContent = text
  return title
}

function counterClass(invalid: boolean): string {
  return `self-start rounded-lg border-[3px] border-ink px-2.5 py-0.5 font-mono text-sm font-bold tabular-nums text-ink ${invalid ? 'bg-cherry' : 'bg-paper'}`
}

function createTextPanel(label: string, placeholder: string): StepBody {
  const panel = document.createElement('div')
  panel.className = 'flex min-w-0 flex-col gap-2'
  const title = document.createElement('label')
  title.htmlFor = 'step-text'
  title.dataset.role = 'step-title'
  title.className = `${titleTagClass} rotate-1 bg-sky`
  title.textContent = label
  const notebook = document.createElement('div')
  notebook.className = 'relative flex flex-1 flex-col'
  const textarea = document.createElement('textarea')
  textarea.id = 'step-text'
  textarea.dataset.role = 'step-text'
  textarea.placeholder = placeholder
  textarea.className =
    'notebook-paper min-h-56 w-full flex-1 resize-y rounded-2xl border-[3px] border-ink p-4 pl-12 text-lg font-semibold text-ink shadow-[6px_6px_0_var(--color-ink)] placeholder:text-ink/40 transition-opacity focus:outline-none focus-visible:ring-4 focus-visible:ring-sky'
  notebook.append(textarea)
  const counter = document.createElement('span')
  counter.dataset.role = 'char-counter'
  const stamp = createStamp('PRONTO!', 'mint')
  panel.append(title, notebook, counter)

  function refreshCounter(): void {
    const chars = charCount(textarea.value.trim())
    const invalid = chars < EXPLANATION_MIN_CHARS || chars > EXPLANATION_MAX_CHARS
    counter.textContent = `Caracteres ${chars}/${EXPLANATION_MAX_CHARS}`
    counter.className = counterClass(invalid)
    counter.dataset.invalid = String(invalid)
  }
  refreshCounter()
  textarea.addEventListener('input', refreshCounter)

  return {
    element: panel,
    validate: () => validateExplanation(textarea.value),
    answer: () => textarea.value,
    setLocked(locked) {
      if (locked && !textarea.readOnly) {
        notebook.append(stamp)
        slamStamp(stamp, notebook)
      } else if (!locked) {
        stamp.remove()
      }
      textarea.readOnly = locked
      textarea.classList.toggle('opacity-60', locked)
      textarea.setAttribute('aria-invalid', String(!validateExplanation(textarea.value).valid))
    },
    destroy() {
      panel.remove()
    },
  }
}

function createCodePanel(label: string, onInput: () => void): StepBody {
  let language: LanguageId = DEFAULT_LANGUAGE
  let code = ''
  let editor: CodeEditor | null = null
  let locked = false

  const panel = document.createElement('div')
  panel.className = 'flex min-w-0 flex-col gap-2'
  const title = titleTag(label, 'bg-sunflower', '-rotate-1')
  const editorSlot = document.createElement('div')
  editorSlot.dataset.role = 'editor-slot'
  editorSlot.className = 'relative transition-opacity'
  const stamp = createStamp('PRONTO!', 'mint')
  const counters = document.createElement('div')
  counters.className = 'flex flex-wrap gap-2'
  const lineCounter = document.createElement('span')
  lineCounter.dataset.role = 'line-counter'
  const charCounter = document.createElement('span')
  charCounter.dataset.role = 'char-counter'
  counters.append(lineCounter, charCounter)
  panel.append(title, editorSlot, counters)

  function refreshCounters(): void {
    const trimmed = trimSnippet(code)
    const lines = countSnippetLines(code)
    const chars = charCount(trimmed)
    const filled = trimmed.split('\n').filter((line) => line.trim() !== '').length
    const linesInvalid = filled < SNIPPET_MIN_LINES || lines > SNIPPET_MAX_LINES
    const charsInvalid = chars > SNIPPET_MAX_CHARS
    lineCounter.textContent = `Linhas ${lines}/${SNIPPET_MAX_LINES}`
    lineCounter.className = counterClass(linesInvalid)
    lineCounter.dataset.invalid = String(linesInvalid)
    charCounter.textContent = `Caracteres ${chars}/${SNIPPET_MAX_CHARS}`
    charCounter.className = counterClass(charsInvalid)
    charCounter.dataset.invalid = String(charsInvalid)
  }

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
        refreshCounters()
        onInput()
      },
    })
    editorSlot.querySelector('[data-component="code-editor"]')?.classList.toggle('opacity-60', readOnly)
  }

  buildEditor(false)
  refreshCounters()

  return {
    element: panel,
    validate: () => validateSnippet(trimSnippet(code)),
    answer: (): CodeSubmission => ({ language, code: trimSnippet(code) }),
    setLocked(next) {
      if (next === locked) return
      locked = next
      buildEditor(next)
      if (next) {
        editorSlot.append(stamp)
        slamStamp(stamp, editorSlot)
      } else {
        stamp.remove()
      }
    },
    destroy() {
      editor?.destroy()
      editor = null
      panel.remove()
    },
  }
}

function createReceivedText(text: string): HTMLElement {
  const card = document.createElement('div')
  card.className = 'ink-card flex min-w-0 flex-col gap-3 self-start rounded-tl-sm p-5'
  const title = document.createElement('h2')
  title.className = 'font-display text-lg'
  title.textContent = 'O que pediram'
  const quote = document.createElement('blockquote')
  quote.dataset.role = 'received-text'
  quote.className = 'whitespace-pre-wrap break-words border-l-[5px] border-bubblegum pl-4 text-lg font-semibold text-ink'
  quote.textContent = text
  card.append(title, quote)
  return card
}

function createReceivedCode(snippet: CodeSubmission): { element: HTMLElement; destroy(): void } {
  const column = document.createElement('div')
  column.className = 'flex min-w-0 flex-col gap-2'
  const row = document.createElement('div')
  row.className = 'flex items-baseline justify-between gap-3'
  const language = document.createElement('span')
  language.dataset.role = 'language-label'
  language.className = 'text-sm font-extrabold uppercase tracking-wider text-lilac'
  language.textContent = `Linguagem: ${languageLabel(snippet.language)}`
  row.append(titleTag('Código recebido', 'bg-bubblegum', '-rotate-2', 'received-title'), language)
  const editorSlot = document.createElement('div')
  editorSlot.dataset.role = 'received-code'
  column.append(row, editorSlot)
  const editor = createEditor({ parent: editorSlot, readOnly: true, initialLanguage: snippet.language, initialCode: snippet.code })
  return {
    element: column,
    destroy() {
      editor.destroy()
      column.remove()
    },
  }
}

function instruction(text: string): HTMLElement {
  const bubble = document.createElement('p')
  bubble.dataset.role = 'instruction'
  bubble.className =
    'self-start rounded-2xl rounded-bl-sm border-[3px] border-ink bg-paper px-4 py-2 font-bold text-ink shadow-[0_3px_0_var(--color-ink)]'
  bubble.textContent = text
  return bubble
}

function createStepBody(telephone: TelephoneState, onInput: () => void): StepBody {
  const body = document.createElement('div')
  body.dataset.role = 'step-body'
  body.dataset.kind = telephone.stepKind
  const extras: { destroy(): void }[] = []

  if (telephone.stepKind === 'describe') {
    body.className = 'flex flex-col gap-4'
    const panel = createTextPanel('Descreva um código para alguém escrever', 'Ex.: uma função que recebe uma lista e devolve só os números pares.')
    body.append(instruction('Invente um programa. O próximo jogador vai ter que escrever o código a partir da sua descrição.'), panel.element)
    panel.element.querySelector('textarea')?.addEventListener('input', onInput)
    return { ...panel, element: body, destroy: () => body.remove() }
  }

  if (telephone.stepKind === 'explain') {
    body.className = 'grid gap-6 lg:grid-cols-2'
    const received = createReceivedCode(telephone.received as CodeSubmission)
    const panel = createTextPanel('Explique o que esse código faz', 'Explique com as suas palavras o que esse código faz…')
    panel.element.querySelector('textarea')?.addEventListener('input', onInput)
    extras.push(received)
    body.append(received.element, panel.element)
    return {
      ...panel,
      element: body,
      destroy() {
        extras.forEach((extra) => extra.destroy())
        body.remove()
      },
    }
  }

  const firstStep = telephone.received === null
  const panel = createCodePanel(firstStep ? 'Escreva um código' : 'Escreva um código que faça isso', onInput)
  if (firstStep) {
    body.className = 'flex flex-col gap-4'
    body.append(instruction('Escreva ou cole um trecho de código. O próximo jogador vai tentar explicar o que ele faz.'), panel.element)
  } else {
    body.className = 'grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]'
    body.append(createReceivedText(String(telephone.received)), panel.element)
  }
  return {
    ...panel,
    element: body,
    destroy() {
      panel.destroy()
      body.remove()
    },
  }
}

function mount(root: HTMLElement): void {
  let hud: StepHud | null = null
  let body: StepBody | null = null
  let currentStep = -1

  container = document.createElement('section')
  container.dataset.screen = 'etapa'
  container.className = 'container flex flex-col gap-5 py-6'

  const bodySlot = document.createElement('div')
  const preparing = document.createElement('h1')
  preparing.dataset.role = 'preparing'
  preparing.className = 'animate-pulse py-16 text-center font-display text-2xl text-lilac'
  preparing.textContent = 'Preparando a primeira etapa…'
  bodySlot.append(preparing)

  const footer = document.createElement('div')
  footer.className = 'flex justify-end pb-4'
  const readySlot = document.createElement('div')
  readySlot.dataset.role = 'ready-slot'
  footer.append(readySlot)

  function renderReady(state: GameState): void {
    const { telephone, lobby } = state
    if (!telephone || !body) {
      readySlot.replaceChildren()
      return
    }
    const validation = body.validate()
    const missing = (lobby?.players.length ?? telephone.totalSteps) - telephone.readyIds.length
    body.setLocked(telephone.localReady)
    readySlot.replaceChildren(
      createReadyButton({
        localReady: telephone.localReady,
        opponentReady: false,
        opponentNickname: '',
        disabled: !validation.valid,
        disabledReason: validation.valid ? '' : validation.reason,
        waitingText: waitingText(missing),
        onToggle: () => {
          if (gameState.get().telephone?.localReady) {
            retractStep()
            return
          }
          if (body?.validate().valid) submitStep(body.answer())
        },
      }),
    )
  }

  function render(state: GameState): void {
    const { telephone } = state
    if (!telephone) return
    if (!hud) {
      hud = createStepHud()
      container?.prepend(hud.element)
    }
    if (telephone.step !== currentStep) {
      currentStep = telephone.step
      body?.destroy()
      body = createStepBody(telephone, () => renderReady(gameState.get()))
      bodySlot.replaceChildren(body.element)
      showPhaseSplash({
        round: telephone.step + 1,
        totalRounds: telephone.totalSteps,
        phaseLabel: STEP_LABELS[telephone.stepKind],
        heading: `Etapa ${telephone.step + 1} de ${telephone.totalSteps}`,
      })
    }
    renderReady(state)
  }

  container.append(bodySlot, footer)
  root.append(container)
  render(gameState.get())
  const unsubscribe = gameState.onChange(render)

  teardown = () => {
    unsubscribe()
    hud?.destroy()
    hud = null
    body?.destroy()
    body = null
  }
}

function unmount(): void {
  teardown?.()
  teardown = null
  container?.remove()
  container = null
}

const etapa: ScreenModule = { mount, unmount }

export default etapa
