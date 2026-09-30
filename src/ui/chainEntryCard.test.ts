import { describe, expect, it } from 'vitest'
import { EditorView } from '@codemirror/view'
import { createChainEntryCard } from './chainEntryCard'

const author = { nickname: 'Gui', avatarId: 3 }
const snippet = { language: 'python' as const, code: 'x = a + b\nprint(x)\nreturn x' }

describe('chain entry card', () => {
  it('renders code in a read-only editor with the author', () => {
    const card = createChainEntryCard({ author, kind: 'code', content: snippet }, 0)
    document.body.append(card.element)
    const view = EditorView.findFromDOM(card.element.querySelector<HTMLElement>('.cm-editor')!)!
    expect(view.state.readOnly).toBe(true)
    expect(view.state.doc.toString()).toBe(snippet.code)
    expect(card.element.querySelector('[data-role="entry-author"]')?.textContent).toBe('Gui')
    expect(card.element.querySelector('[data-role="entry-kind"]')?.textContent).toBe('Código')
    expect(card.element.querySelector('img')?.getAttribute('src')).toContain('3')
    card.destroy()
  })

  it('renders text in a balloon with the step name', () => {
    const card = createChainEntryCard({ author, kind: 'explain', content: 'Soma dois números.' }, 1)
    expect(card.element.querySelector('[data-role="entry-text"]')?.textContent).toBe('Soma dois números.')
    expect(card.element.querySelector('[data-role="entry-kind"]')?.textContent).toBe('Explicação')
    expect(card.element.querySelector('.cm-editor')).toBeNull()
  })

  it('names descriptions', () => {
    const card = createChainEntryCard({ author, kind: 'describe', content: 'Uma função que soma.' }, 0)
    expect(card.element.querySelector('[data-role="entry-kind"]')?.textContent).toBe('Descrição')
  })

  it('removes the card and its editor on destroy', () => {
    const card = createChainEntryCard({ author, kind: 'code', content: snippet }, 0)
    document.body.append(card.element)
    card.destroy()
    expect(card.element.isConnected).toBe(false)
    expect(document.querySelector('.cm-editor')).toBeNull()
  })
})
