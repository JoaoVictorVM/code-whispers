import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching, indentUnit } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
import type { LanguageId } from '../types/game'
import { DEFAULT_LANGUAGE, LANGUAGES, isLanguageId, languageExtension } from './languages'

export const VISIBLE_LINES = 40
export const LINE_HEIGHT_PX = 16
const INDENT = '  '

export interface EditorSnapshot {
  language: LanguageId
  code: string
  lineCount: number
  charCount: number
}

export interface CreateEditorOptions {
  parent: HTMLElement
  readOnly?: boolean
  initialLanguage?: LanguageId
  initialCode?: string
  onChange?: (snapshot: EditorSnapshot) => void
}

export interface CodeEditor {
  getLanguage(): LanguageId
  getCode(): string
  getLineCount(): number
  getCharCount(): number
  getSnapshot(): EditorSnapshot
  setLanguage(id: LanguageId): void
  destroy(): void
}

const sizeTheme = EditorView.theme({
  '&': {
    height: `${VISIBLE_LINES * LINE_HEIGHT_PX}px`,
    fontSize: '13px',
    borderRadius: '0.5rem',
  },
  '.cm-scroller': {
    overflow: 'auto',
    lineHeight: `${LINE_HEIGHT_PX}px`,
    fontFamily: 'var(--font-mono)',
  },
})

function insertIndent(view: EditorView): boolean {
  if (view.state.readOnly) return false
  view.dispatch(view.state.replaceSelection(INDENT), { scrollIntoView: true, userEvent: 'input' })
  return true
}

function countChars(code: string): number {
  return [...code].length
}

export function createEditor(options: CreateEditorOptions): CodeEditor {
  const { parent, readOnly = false, initialCode = '', onChange } = options
  let language: LanguageId = options.initialLanguage ?? DEFAULT_LANGUAGE
  let destroyed = false
  const languageCompartment = new Compartment()

  const wrapper = document.createElement('div')
  wrapper.dataset.component = 'code-editor'
  wrapper.className = 'flex flex-col gap-2'

  const toolbar = document.createElement('div')
  toolbar.className = 'flex items-center justify-between gap-3'

  const caption = document.createElement('span')
  caption.dataset.role = 'read-only-caption'
  caption.className = 'text-xs text-muted'
  caption.textContent = readOnly ? 'Somente leitura' : ''

  const selectLabel = document.createElement('label')
  selectLabel.className = 'ml-auto flex items-center gap-2 text-sm text-muted'
  selectLabel.textContent = 'Linguagem'

  const select = document.createElement('select')
  select.dataset.role = 'language-select'
  select.disabled = readOnly
  select.className =
    'rounded-md border border-surface bg-surface px-2 py-1 text-sm text-text focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'
  for (const option of LANGUAGES) {
    const element = document.createElement('option')
    element.value = option.id
    element.textContent = option.label
    select.append(element)
  }
  select.value = language
  selectLabel.append(select)
  toolbar.append(caption, selectLabel)

  const host = document.createElement('div')
  host.dataset.role = 'editor-host'

  wrapper.append(toolbar, host)
  parent.append(wrapper)

  function snapshot(): EditorSnapshot {
    const code = view.state.doc.toString()
    return {
      language,
      code,
      lineCount: view.state.doc.lines,
      charCount: countChars(code),
    }
  }

  function notify(): void {
    if (!destroyed) onChange?.(snapshot())
  }

  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: initialCode,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        bracketMatching(),
        indentUnit.of(INDENT),
        EditorState.tabSize.of(2),
        keymap.of([{ key: 'Tab', run: insertIndent }, ...defaultKeymap, ...historyKeymap]),
        oneDark,
        sizeTheme,
        languageCompartment.of(languageExtension(language)),
        EditorState.readOnly.of(readOnly),
        EditorState.changeFilter.of(() => !readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) notify()
        }),
      ],
    }),
  })

  function setLanguage(id: LanguageId): void {
    if (destroyed || id === language) return
    language = id
    select.value = id
    view.dispatch({ effects: languageCompartment.reconfigure(languageExtension(id)) })
    notify()
  }

  select.addEventListener('change', () => {
    if (isLanguageId(select.value)) setLanguage(select.value)
  })

  return {
    getLanguage: () => language,
    getCode: () => view.state.doc.toString(),
    getLineCount: () => view.state.doc.lines,
    getCharCount: () => countChars(view.state.doc.toString()),
    getSnapshot: snapshot,
    setLanguage,
    destroy() {
      if (destroyed) return
      destroyed = true
      view.destroy()
      wrapper.remove()
    },
  }
}
