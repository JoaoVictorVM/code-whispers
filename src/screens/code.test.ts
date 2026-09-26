import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'

const sync = vi.hoisted(() => ({ ready: vi.fn(), unready: vi.fn() }))

vi.mock('../network/sync', () => sync)

const { gameState } = await import('../state/gameState')
const { default: codeScreen } = await import('./code')

let root: HTMLElement

function view(): EditorView {
  return EditorView.findFromDOM(root.querySelector<HTMLElement>('.cm-editor')!)!
}

function typeCode(text: string): void {
  const current = view()
  current.dispatch({ changes: { from: 0, to: current.state.doc.length, insert: text } })
}

function query<T extends HTMLElement>(role: string): T {
  return root.querySelector<T>(`[data-role="${role}"]`)!
}

function readyButton(): HTMLButtonElement {
  return query<HTMLButtonElement>('ready-toggle')
}

function lines(count: number, width = 10): string {
  return Array.from({ length: count }, (_, index) => `${index}`.padEnd(width, 'x')).join('\n')
}

describe('code writing screen', () => {
  beforeEach(() => {
    gameState.reset()
    gameState.patch({
      screen: 'code',
      room: { code: 'AB3XYZ', role: 'host', mode: 3 },
      remotePlayer: { nickname: 'Ana', avatarId: 2 },
      connection: { status: 'connected', error: null },
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
    codeScreen.unmount()
  })

  it('test_renders_round_and_phase_header', () => {
    gameState.patch({ round: 2, room: { code: 'AB3XYZ', role: 'host', mode: 5 } })
    codeScreen.mount(root)
    expect(root.querySelector('h1')?.textContent).toBe('Rodada 2 de 5 · Escrever')
    expect(query('instruction').textContent).toBe('Escreva ou cole um trecho de código para Ana explicar.')
  })

  it('shows the right total in every mode', () => {
    for (const mode of [3, 5, 7] as const) {
      gameState.patch({ room: { code: 'AB3XYZ', role: 'guest', mode } })
      codeScreen.mount(root)
      expect(root.querySelector('h1')?.textContent).toBe(`Rodada 1 de ${mode} · Escrever`)
      codeScreen.unmount()
    }
  })

  it('test_counters_update_on_typing', () => {
    codeScreen.mount(root)
    expect(query('line-counter').textContent).toBe('Linhas 0/40')
    expect(query('char-counter').textContent).toBe('Caracteres 0/1500')
    typeCode(`${'a'.repeat(16)}\n${lines(4, 15)}`)
    expect(query('line-counter').textContent).toBe('Linhas 5/40')
    expect(query('char-counter').textContent).toBe('Caracteres 80/1500')
  })

  it('test_below_minimum_lines_disables_ready', () => {
    codeScreen.mount(root)
    typeCode(lines(2))
    expect(readyButton().disabled).toBe(true)
    expect(query('disabled-reason').textContent).toBe('Mínimo de 3 linhas')
    expect(query('line-counter').dataset.invalid).toBe('true')
    typeCode(lines(3))
    expect(readyButton().disabled).toBe(false)
    expect(query('line-counter').dataset.invalid).toBe('false')
  })

  it('does not count blank lines toward the minimum', () => {
    codeScreen.mount(root)
    typeCode('a\n\n   \nb')
    expect(query('line-counter').textContent).toBe('Linhas 4/40')
    expect(readyButton().disabled).toBe(true)
    expect(query('disabled-reason').textContent).toBe('Mínimo de 3 linhas')
  })

  it('test_above_maximum_lines_disables_ready', () => {
    codeScreen.mount(root)
    typeCode(lines(41, 2))
    expect(readyButton().disabled).toBe(true)
    expect(query('disabled-reason').textContent).toBe('Máximo de 40 linhas')
    expect(query('line-counter').dataset.invalid).toBe('true')
  })

  it('test_above_maximum_chars_disables_ready', () => {
    codeScreen.mount(root)
    const snippet = `${Array.from({ length: 39 }, () => 'x'.repeat(37)).join('\n')}\n${'y'.repeat(19)}`
    typeCode(snippet)
    expect(query('line-counter').textContent).toBe('Linhas 40/40')
    expect(query('char-counter').textContent).toBe('Caracteres 1501/1500')
    expect(readyButton().disabled).toBe(true)
    expect(query('disabled-reason').textContent).toBe('Máximo de 1500 caracteres')
    expect(query('char-counter').dataset.invalid).toBe('true')
    expect(query('line-counter').dataset.invalid).toBe('false')
  })

  it('test_valid_snippet_enables_ready', () => {
    codeScreen.mount(root)
    typeCode(lines(5, 39))
    expect(query('char-counter').textContent).toBe('Caracteres 199/1500')
    expect(readyButton().disabled).toBe(false)
    expect(root.querySelector('[data-role="disabled-reason"]')).toBeNull()
  })

  it('ignores trailing blank lines in the counters and in the payload', () => {
    codeScreen.mount(root)
    typeCode(`${lines(3)}\n\n  \n`)
    expect(query('line-counter').textContent).toBe('Linhas 3/40')
    readyButton().click()
    expect(sync.ready).toHaveBeenCalledWith({ language: 'javascript', code: lines(3) })
  })

  it('test_click_ready_locks_editor_and_calls_sync', () => {
    codeScreen.mount(root)
    typeCode(lines(3))
    readyButton().click()
    expect(sync.ready).toHaveBeenCalledWith({ language: 'javascript', code: lines(3) })
    expect(view().contentDOM.getAttribute('contenteditable')).toBe('false')
    expect(query('editor-slot').classList.contains('opacity-60')).toBe(true)
    expect(readyButton().textContent).toBe('Cancelar')
    expect(query('waiting-label').textContent).toBe('Aguardando Ana…')
  })

  it('test_cancel_restores_editable_content', () => {
    codeScreen.mount(root)
    const select = root.querySelector<HTMLSelectElement>('[data-role="language-select"]')!
    select.value = 'python'
    select.dispatchEvent(new Event('change'))
    typeCode(lines(4))
    readyButton().click()
    readyButton().click()
    expect(sync.unready).toHaveBeenCalledTimes(1)
    expect(view().contentDOM.getAttribute('contenteditable')).toBe('true')
    expect(view().state.doc.toString()).toBe(lines(4))
    expect(root.querySelector<HTMLSelectElement>('[data-role="language-select"]')!.value).toBe('python')
    expect(query('editor-slot').classList.contains('opacity-60')).toBe(false)
    expect(readyButton().textContent).toBe('Pronto')
  })

  it('test_new_round_mount_clears_editor', () => {
    codeScreen.mount(root)
    const select = root.querySelector<HTMLSelectElement>('[data-role="language-select"]')!
    select.value = 'go'
    select.dispatchEvent(new Event('change'))
    typeCode(lines(5))
    codeScreen.unmount()
    gameState.patch({ round: 2 })
    codeScreen.mount(root)
    expect(view().state.doc.toString()).toBe('')
    expect(root.querySelector<HTMLSelectElement>('[data-role="language-select"]')!.value).toBe('javascript')
    expect(root.querySelector('h1')?.textContent).toBe('Rodada 2 de 3 · Escrever')
  })

  it('removes the editor and stops listening on unmount', () => {
    codeScreen.mount(root)
    codeScreen.unmount()
    expect(root.querySelector('.cm-editor')).toBeNull()
    expect(() => gameState.patch({ readyFlags: { local: false, opponent: true } })).not.toThrow()
  })

  it('test_ready_button_reflects_opponent_ready_from_round_context', () => {
    codeScreen.mount(root)
    gameState.patch({ readyFlags: { local: false, opponent: true } })
    expect(query('opponent-ready-badge').textContent).toBe('Ana está pronto')
    expect(readyButton().textContent).toBe('Pronto')
  })

  it('test_ready_payload_has_the_shape_delivered_to_the_opponent', () => {
    codeScreen.mount(root)
    const snippet = 'def soma(a, b):\n    return a + b\nprint(soma(1, 2))'
    const select = root.querySelector<HTMLSelectElement>('[data-role="language-select"]')!
    select.value = 'python'
    select.dispatchEvent(new Event('change'))
    typeCode(snippet)
    readyButton().click()
    const [payload] = sync.ready.mock.calls[0]
    expect(payload).toStrictEqual({ language: 'python', code: snippet })
  })
})
