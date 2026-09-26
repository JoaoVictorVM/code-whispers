import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

const board = {
  background: '#1e1236',
  text: '#fff6e5',
  gutter: '#7d6aa8',
  line: 'rgb(255 246 229 / 0.05)',
  selection: 'rgb(86 194 255 / 0.3)',
  cursor: '#ffc53d',
  keyword: '#ff5fa2',
  string: '#3ddc97',
  number: '#ffc53d',
  comment: '#9d8cc4',
  function: '#56c2ff',
  type: '#ff8a3d',
  punctuation: '#c9b8ec',
  ink: '#1b1030',
}

export const EDITOR_HEIGHT = 'clamp(300px, calc(100dvh - 370px), 640px)'

const boardView = EditorView.theme(
  {
    '&': {
      color: board.text,
      backgroundColor: board.background,
      height: EDITOR_HEIGHT,
      fontSize: '13px',
      border: `3px solid ${board.ink}`,
      borderRadius: '14px',
      boxShadow: `6px 6px 0 ${board.ink}`,
      overflow: 'hidden',
    },
    '&.cm-focused': { outline: `3px solid ${board.function}`, outlineOffset: '2px' },
    '.cm-scroller': { overflow: 'auto', lineHeight: '16px', fontFamily: 'var(--font-mono)' },
    '.cm-content': { caretColor: board.cursor, padding: '10px 0' },
    '.cm-cursor, .cm-dropCursor': { borderLeft: `2px solid ${board.cursor}` },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: board.selection },
    '.cm-gutters': { backgroundColor: board.background, color: board.gutter, border: 'none' },
    '.cm-activeLine': { backgroundColor: board.line },
    '.cm-activeLineGutter': { backgroundColor: board.line, color: board.cursor },
    '&.cm-focused .cm-matchingBracket': { backgroundColor: 'rgb(61 220 151 / 0.25)', outline: `1px solid ${board.string}` },
  },
  { dark: true },
)

const boardHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword, tags.modifier], color: board.keyword, fontWeight: '700' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp, tags.character], color: board.string },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: board.number },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: board.comment, fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName], color: board.function },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.meta, tags.processingInstruction], color: board.type },
  { tag: [tags.definition(tags.variableName), tags.variableName], color: board.text },
  { tag: [tags.propertyName, tags.attributeName], color: '#ffd7b0' },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: board.punctuation },
  { tag: tags.invalid, color: '#ff4d6d' },
])

export const boardTheme: Extension = [boardView, syntaxHighlighting(boardHighlight)]
