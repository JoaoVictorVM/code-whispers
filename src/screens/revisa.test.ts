import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import type { RoundSubmissions } from '../types/game'

const sync = vi.hoisted(() => ({ ready: vi.fn() }))

vi.mock('../network/sync', () => sync)

const { gameState } = await import('../state/gameState')
const { default: revisa } = await import('./revisa')
const { applyVerdicts } = await import('../network/syncProtocol')

const ownSnippet = { language: 'go', code: 'package main\nfunc main() {\n  println(42)\n}' } as const
const explanation = 'Imprime 42.\n\n  Depois termina o programa.'

let root: HTMLElement

function query<T extends HTMLElement>(role: string): T {
  return root.querySelector<T>(`[data-role="${role}"]`)!
}

function verdictButton(verdict: string): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>(`[data-verdict="${verdict}"]`)!
}

function setRound(submissions: RoundSubmissions): void {
  gameState.patch({ submissions: { 1: submissions } })
}

describe('review screen', () => {
  beforeEach(() => {
    gameState.reset()
    gameState.patch({
      screen: 'revisa',
      phase: 'review',
      round: 1,
      room: { code: 'AB3XYZ', role: 'host', kind: 'duel', mode: 3 },
      remotePlayer: { nickname: 'Ana', avatarId: 2 },
      connection: { status: 'connected', error: null },
    })
    setRound({ localCode: ownSnippet, remoteExplanation: explanation })
    sync.ready.mockReset().mockImplementation(() => {
      gameState.patch({ readyFlags: { ...gameState.get().readyFlags, local: true } })
      return true
    })
    document.body.innerHTML = '<div id="app"></div>'
    root = document.querySelector<HTMLElement>('#app')!
  })

  afterEach(() => {
    revisa.unmount()
  })

  it('renders the header and titles', () => {
    revisa.mount(root)
    expect(root.querySelector('h1')?.textContent).toBe('Rodada 1 de 3 · Avaliar')
    expect(root.textContent).toContain('Seu código')
    expect(query('explanation-title').textContent).toBe('Ana explicou:')
    expect(root.querySelector('[data-role="ready-toggle"]')).toBeNull()
  })

  it('test_renders_own_snippet_readonly', () => {
    revisa.mount(root)
    const view = EditorView.findFromDOM(root.querySelector<HTMLElement>('.cm-editor')!)!
    expect(view.state.doc.toString()).toBe(ownSnippet.code)
    expect(root.querySelector<HTMLSelectElement>('[data-role="language-select"]')!.value).toBe('go')
    view.dispatch({ changes: { from: 0, insert: 'x' } })
    expect(view.state.doc.toString()).toBe(ownSnippet.code)
  })

  it('test_renders_explanation_verbatim_with_line_breaks', () => {
    revisa.mount(root)
    const quote = query('explanation')
    expect(quote.tagName).toBe('BLOCKQUOTE')
    expect(quote.textContent).toBe(explanation)
    expect(quote.className).toContain('whitespace-pre-wrap')
  })

  it('test_explanation_html_is_not_interpreted', () => {
    setRound({ localCode: ownSnippet, remoteExplanation: '<b>x</b><img src=x onerror="alert(1)">' })
    revisa.mount(root)
    const quote = query('explanation')
    expect(quote.textContent).toBe('<b>x</b><img src=x onerror="alert(1)">')
    expect(quote.querySelector('b')).toBeNull()
    expect(quote.querySelector('img')).toBeNull()
  })

  it('test_click_verdict_submits_and_locks', () => {
    revisa.mount(root)
    verdictButton('correct').click()
    expect(sync.ready).toHaveBeenCalledWith({ verdict: 'correct' })
    expect(verdictButton('correct').classList.contains('selected')).toBe(true)
    expect(verdictButton('wrong').disabled).toBe(true)
    expect(verdictButton('half').disabled).toBe(true)
  })

  it('test_verdict_cannot_be_changed_after_click', () => {
    revisa.mount(root)
    verdictButton('wrong').click()
    verdictButton('correct').click()
    verdictButton('wrong').click()
    expect(sync.ready).toHaveBeenCalledTimes(1)
    expect(sync.ready).toHaveBeenCalledWith({ verdict: 'wrong' })
    expect(verdictButton('wrong').classList.contains('selected')).toBe(true)
  })

  it('keeps the buttons open when the verdict could not be sent', () => {
    sync.ready.mockReturnValueOnce(false)
    revisa.mount(root)
    verdictButton('half').click()
    expect(verdictButton('correct').disabled).toBe(false)
    verdictButton('half').click()
    expect(sync.ready).toHaveBeenCalledTimes(2)
  })

  it('test_shows_waiting_after_local_verdict', () => {
    revisa.mount(root)
    expect(query('review-status').hidden).toBe(true)
    verdictButton('half').click()
    expect(query('review-status').textContent).toBe('Aguardando a avaliação de Ana…')
    expect(query('review-status').hidden).toBe(false)
  })

  it('test_shows_opponent_already_judged_badge', () => {
    gameState.patch({ readyFlags: { local: false, opponent: true } })
    revisa.mount(root)
    const badge = query('opponent-judged-badge')
    expect(badge.hidden).toBe(false)
    expect(badge.textContent).toBe('Ana já avaliou')
    expect(badge.compareDocumentPosition(query('verdict-slot')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the badge when the opponent judges while the screen is open', () => {
    revisa.mount(root)
    expect(query('opponent-judged-badge').hidden).toBe(true)
    gameState.patch({ readyFlags: { local: false, opponent: true } })
    expect(query('opponent-judged-badge').textContent).toBe('Ana já avaliou')
  })

  it('removes the editor and stops listening on unmount', () => {
    revisa.mount(root)
    revisa.unmount()
    expect(root.querySelector('.cm-editor')).toBeNull()
    expect(() => gameState.patch({ readyFlags: { local: false, opponent: true } })).not.toThrow()
  })

  it('test_own_snippet_and_explanation_match_the_synced_submissions', () => {
    revisa.mount(root)
    const { submissions, round } = gameState.get()
    const view = EditorView.findFromDOM(root.querySelector<HTMLElement>('.cm-editor')!)!
    expect(view.state.doc.toString()).toBe(submissions[round].localCode?.code)
    expect(query('explanation').textContent).toBe(submissions[round].remoteExplanation)
  })

  it('test_verdict_payload_feeds_the_tally', () => {
    revisa.mount(root)
    verdictButton('half').click()
    const [payload] = sync.ready.mock.calls[0]
    expect(payload).toStrictEqual({ verdict: 'half' })
    const tallies = applyVerdicts(gameState.get().tallies, payload.verdict, 'correct')
    expect(tallies.remote.half).toBe(1)
  })
})
