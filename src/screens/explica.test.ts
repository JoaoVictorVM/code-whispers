import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'

const sync = vi.hoisted(() => ({ ready: vi.fn(), unready: vi.fn() }))

vi.mock('../network/sync', () => sync)

const { gameState } = await import('../state/gameState')
const { default: explica } = await import('./explica')

const opponentSnippet = { language: 'python', code: 'def soma(a, b):\n    return a + b\nprint(soma(1, 2))' } as const

let root: HTMLElement

function query<T extends HTMLElement>(role: string): T {
  return root.querySelector<T>(`[data-role="${role}"]`)!
}

function textarea(): HTMLTextAreaElement {
  return query<HTMLTextAreaElement>('explanation-input')
}

function typeExplanation(value: string): void {
  textarea().value = value
  textarea().dispatchEvent(new Event('input', { bubbles: true }))
}

function readyButton(): HTMLButtonElement {
  return query<HTMLButtonElement>('ready-toggle')
}

function editorView(): EditorView {
  return EditorView.findFromDOM(root.querySelector<HTMLElement>('.cm-editor')!)!
}

describe('explanation screen', () => {
  beforeEach(() => {
    gameState.reset()
    gameState.patch({
      screen: 'explica',
      phase: 'explain',
      round: 2,
      room: { code: 'AB3XYZ', role: 'guest', mode: 5 },
      remotePlayer: { nickname: 'Ana', avatarId: 2 },
      connection: { status: 'connected', error: null },
      submissions: { 2: { remoteCode: opponentSnippet } },
    })
    sync.ready.mockReset().mockImplementation(() => {
      gameState.patch({ readyFlags: { ...gameState.get().readyFlags, local: true } })
      return true
    })
    sync.unready.mockReset().mockImplementation(() => {
      gameState.patch({ readyFlags: { ...gameState.get().readyFlags, local: false } })
      return true
    })
    document.body.innerHTML = '<div id="app"></div>'
    root = document.querySelector<HTMLElement>('#app')!
  })

  afterEach(() => {
    explica.unmount()
  })

  it('renders the header, the opponent title and the placeholder', () => {
    explica.mount(root)
    expect(root.querySelector('h1')?.textContent).toBe('Rodada 2 de 5 · Explicar')
    expect(query('code-title').textContent).toBe('Código de Ana')
    expect(textarea().placeholder).toBe('Explique o que esse código faz…')
  })

  it('test_renders_opponent_snippet_readonly_with_language_label', () => {
    explica.mount(root)
    const view = editorView()
    expect(view.state.doc.toString()).toBe(opponentSnippet.code)
    expect(query('language-label').textContent).toBe('Linguagem: Python')
    view.dispatch({ changes: { from: 0, insert: 'x' } })
    expect(view.state.doc.toString()).toBe(opponentSnippet.code)
    expect(view.contentDOM.getAttribute('contenteditable')).toBe('false')
  })

  it('test_counter_updates_on_typing', () => {
    explica.mount(root)
    expect(query('char-counter').textContent).toBe('Caracteres 0/500')
    typeExplanation('a'.repeat(50))
    expect(query('char-counter').textContent).toBe('Caracteres 50/500')
    expect(query('char-counter').dataset.invalid).toBe('false')
  })

  it('test_below_minimum_chars_disables_ready', () => {
    explica.mount(root)
    typeExplanation('a'.repeat(9))
    expect(readyButton().disabled).toBe(true)
    expect(query('disabled-reason').textContent).toBe('Mínimo de 10 caracteres')
    expect(query('char-counter').dataset.invalid).toBe('true')
    typeExplanation('a'.repeat(10))
    expect(readyButton().disabled).toBe(false)
    expect(query('char-counter').dataset.invalid).toBe('false')
  })

  it('test_above_maximum_chars_disables_ready', () => {
    explica.mount(root)
    typeExplanation('a'.repeat(501))
    expect(readyButton().disabled).toBe(true)
    expect(query('disabled-reason').textContent).toBe('Máximo de 500 caracteres')
    expect(query('char-counter').dataset.invalid).toBe('true')
    typeExplanation('a'.repeat(500))
    expect(readyButton().disabled).toBe(false)
  })

  it('test_whitespace_trimmed_before_validation', () => {
    explica.mount(root)
    typeExplanation('   curtinho   ')
    expect(query('char-counter').textContent).toBe('Caracteres 8/500')
    expect(readyButton().disabled).toBe(true)
    expect(query('disabled-reason').textContent).toBe('Mínimo de 10 caracteres')
  })

  it('accepts newlines inside the explanation', () => {
    explica.mount(root)
    typeExplanation('Primeira linha.\nSegunda linha.')
    readyButton().click()
    expect(sync.ready).toHaveBeenCalledWith({ explanation: 'Primeira linha.\nSegunda linha.' })
  })

  it('test_click_ready_locks_textarea_and_calls_sync', () => {
    explica.mount(root)
    typeExplanation('   Soma dois números e imprime o resultado.  ')
    readyButton().click()
    expect(sync.ready).toHaveBeenCalledWith({ explanation: 'Soma dois números e imprime o resultado.' })
    expect(textarea().readOnly).toBe(true)
    expect(textarea().classList.contains('opacity-60')).toBe(true)
    expect(readyButton().textContent).toBe('Cancelar')
    expect(query('waiting-label').textContent).toBe('Aguardando Ana…')
  })

  it('test_cancel_restores_editable_textarea', () => {
    explica.mount(root)
    typeExplanation('Soma dois números e imprime.')
    readyButton().click()
    readyButton().click()
    expect(sync.unready).toHaveBeenCalledTimes(1)
    expect(textarea().readOnly).toBe(false)
    expect(textarea().value).toBe('Soma dois números e imprime.')
    expect(readyButton().textContent).toBe('Pronto')
  })

  it('shows the opponent ready badge before the local click', () => {
    explica.mount(root)
    gameState.patch({ readyFlags: { local: false, opponent: true } })
    expect(query('opponent-ready-badge').textContent).toBe('Ana está pronto')
  })

  it('removes the editor and stops listening on unmount', () => {
    explica.mount(root)
    explica.unmount()
    expect(root.querySelector('.cm-editor')).toBeNull()
    expect(() => gameState.patch({ readyFlags: { local: false, opponent: true } })).not.toThrow()
  })

  it('test_opponent_snippet_matches_the_synced_submission', () => {
    explica.mount(root)
    const select = root.querySelector<HTMLSelectElement>('[data-role="language-select"]')!
    expect(select.value).toBe(gameState.get().submissions[2].remoteCode?.language)
    expect(select.disabled).toBe(true)
    expect(editorView().state.doc.toString()).toBe(gameState.get().submissions[2].remoteCode?.code)
  })

  it('test_explanation_payload_has_the_shape_delivered_to_the_author', () => {
    explica.mount(root)
    typeExplanation('  Define soma e imprime 3.  ')
    readyButton().click()
    const [payload] = sync.ready.mock.calls[0]
    expect(payload).toStrictEqual({ explanation: 'Define soma e imprime 3.' })
  })
})
