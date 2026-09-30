import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import type { TelephoneState } from '../types/game'

const engine = vi.hoisted(() => ({ submitStep: vi.fn(), retractStep: vi.fn() }))

vi.mock('../network/telephone', () => engine)

const { gameState } = await import('../state/gameState')
const { default: etapa, waitingText } = await import('./etapa')

const snippet = { language: 'python' as const, code: 'def soma(a, b):\n    return a + b\nprint(soma(1, 2))' }
const description = 'Uma função que soma dois números e mostra o resultado.'

let root: HTMLElement

function query<T extends HTMLElement>(role: string): T {
  return root.querySelector<T>(`[data-role="${role}"]`)!
}

function step(overrides: Partial<TelephoneState>): TelephoneState {
  return {
    step: 0,
    totalSteps: 4,
    stepKind: 'describe',
    received: null,
    readyIds: [],
    localReady: false,
    chains: null,
    revealCursor: { chain: 0, entry: 0 },
    ...overrides,
  }
}

function typeText(value: string): void {
  const textarea = query<HTMLTextAreaElement>('step-text')
  textarea.value = value
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

function readyButton(): HTMLButtonElement {
  return query<HTMLButtonElement>('ready-toggle')
}

function editorView(slot: string): EditorView {
  return EditorView.findFromDOM(query(slot).querySelector<HTMLElement>('.cm-editor')!)!
}

describe('telephone step screen', () => {
  beforeEach(() => {
    gameState.reset()
    gameState.patch({
      screen: 'etapa',
      room: { code: 'AB3XYZ', role: 'guest', kind: 'telephone', mode: 3 },
      lobby: {
        selfId: 'self-peer',
        hostId: 'host-peer',
        players: [
          { id: 'host-peer', nickname: 'João', avatarId: 1, isHost: true },
          { id: 'self-peer', nickname: 'Gui', avatarId: 3, isHost: false },
          { id: 'peer-b', nickname: 'Breno', avatarId: 5, isHost: false },
          { id: 'peer-c', nickname: 'Lia', avatarId: 2, isHost: false },
        ],
        stage: 'playing',
        departedNickname: null,
      },
      connection: { status: 'connected', error: null },
    })
    engine.submitStep.mockReset().mockImplementation(() => {
      const telephone = gameState.get().telephone!
      gameState.patch({ telephone: { ...telephone, localReady: true, readyIds: [...telephone.readyIds, 'self-peer'] } })
      return true
    })
    engine.retractStep.mockReset().mockImplementation(() => {
      const telephone = gameState.get().telephone!
      gameState.patch({ telephone: { ...telephone, localReady: false, readyIds: telephone.readyIds.filter((id) => id !== 'self-peer') } })
      return true
    })
    document.body.innerHTML = '<div id="app"></div>'
    root = document.querySelector<HTMLElement>('#app')!
  })

  afterEach(() => {
    etapa.unmount()
  })

  it('waits for the first step before showing anything to answer', () => {
    etapa.mount(root)
    expect(query('preparing').textContent).toBe('Preparando a primeira etapa…')
    expect(query('ready-toggle')).toBeNull()
    gameState.patch({ telephone: step({}) })
    expect(query('preparing')).toBeNull()
    expect(query('step-header').textContent).toBe('Etapa 1 de 4 · Descreva')
  })

  it('asks for a description on a describe step', () => {
    gameState.patch({ telephone: step({}) })
    etapa.mount(root)
    expect(query('step-title').textContent).toBe('Descreva um código para alguém escrever')
    expect(query('char-counter').textContent).toBe('Caracteres 0/500')
    expect(root.querySelector('.cm-editor')).toBeNull()
  })

  it('shows the received description next to the editor on a later code step', () => {
    gameState.patch({ telephone: step({ step: 1, stepKind: 'code', received: description }) })
    etapa.mount(root)
    expect(query('received-text').textContent).toBe(description)
    expect(query('step-title').textContent).toBe('Escreva um código que faça isso')
    expect(editorView('editor-slot').state.readOnly).toBe(false)
    expect(query('line-counter').textContent).toBe('Linhas 0/40')
  })

  it('has no received text on the first code step', () => {
    gameState.patch({ telephone: step({ totalSteps: 3, stepKind: 'code' }) })
    etapa.mount(root)
    expect(query('received-text')).toBeNull()
    expect(query('step-title').textContent).toBe('Escreva um código')
  })

  it('shows the received code read-only on an explain step', () => {
    gameState.patch({ telephone: step({ step: 2, stepKind: 'explain', received: snippet }) })
    etapa.mount(root)
    expect(editorView('received-code').state.readOnly).toBe(true)
    expect(editorView('received-code').state.doc.toString()).toBe(snippet.code)
    expect(query('received-title').textContent).toBe('Código recebido')
    expect(query('language-label').textContent).toBe('Linguagem: Python')
    expect(query('step-title').textContent).toBe('Explique o que esse código faz')
  })

  it('never shows who wrote the received content', () => {
    gameState.patch({ telephone: step({ step: 2, stepKind: 'explain', received: snippet }) })
    etapa.mount(root)
    const body = query('step-body').textContent ?? ''
    expect(body).not.toContain('João')
    expect(body).not.toContain('Breno')
    expect(body).not.toContain('Lia')
  })

  it('enables the ready button only for a valid answer and submits it', () => {
    gameState.patch({ telephone: step({}) })
    etapa.mount(root)
    expect(readyButton().disabled).toBe(true)
    expect(query('disabled-reason').textContent).toBe('Mínimo de 10 caracteres')
    typeText(description)
    expect(readyButton().disabled).toBe(false)
    readyButton().click()
    expect(engine.submitStep).toHaveBeenCalledWith(description)
    expect(query<HTMLTextAreaElement>('step-text').readOnly).toBe(true)
  })

  it('counts the players still writing while waiting', () => {
    gameState.patch({ telephone: step({ readyIds: ['peer-b'] }) })
    etapa.mount(root)
    typeText(description)
    readyButton().click()
    expect(query('waiting-label').textContent).toBe('Esperando 2 jogadores…')
    expect(root.querySelectorAll('[data-role="ready-check"]')).toHaveLength(2)
  })

  it('lets the player cancel and edit again', () => {
    gameState.patch({ telephone: step({}) })
    etapa.mount(root)
    typeText(description)
    readyButton().click()
    readyButton().click()
    expect(engine.retractStep).toHaveBeenCalledTimes(1)
    expect(query<HTMLTextAreaElement>('step-text').readOnly).toBe(false)
    expect(query<HTMLTextAreaElement>('step-text').value).toBe(description)
  })

  it('rebuilds the body when the next step arrives', () => {
    gameState.patch({ telephone: step({}) })
    etapa.mount(root)
    typeText(description)
    gameState.patch({ telephone: step({ step: 1, stepKind: 'code', received: description }) })
    expect(query('step-body').dataset.kind).toBe('code')
    expect(query('step-text')).toBeNull()
    expect(query('step-header').textContent).toBe('Etapa 2 de 4 · Programe')
  })

  it('words the waiting text for one or many players', () => {
    expect(waitingText(1)).toBe('Esperando 1 jogador…')
    expect(waitingText(3)).toBe('Esperando 3 jogadores…')
    expect(waitingText(0)).toBe('Passando para a próxima etapa…')
  })
})
