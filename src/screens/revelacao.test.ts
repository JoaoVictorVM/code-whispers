import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Chain, LobbyPlayer, RevealCursor } from '../types/game'

const room = vi.hoisted(() => ({ returnToLobby: vi.fn() }))
const engine = vi.hoisted(() => ({ advanceReveal: vi.fn() }))
const confetti = vi.hoisted(() => ({ celebrate: vi.fn() }))

vi.mock('../network/room', () => room)
vi.mock('../network/telephone', () => engine)
vi.mock('../ui/confetti', () => confetti)

const { gameState } = await import('../state/gameState')
const { default: revelacao } = await import('./revelacao')

const players: LobbyPlayer[] = [
  { id: 'host-peer', nickname: 'João', avatarId: 1, isHost: true },
  { id: 'peer-gui', nickname: 'Gui', avatarId: 3, isHost: false },
  { id: 'peer-breno', nickname: 'Breno', avatarId: 5, isHost: false },
]
const snippet = { language: 'python' as const, code: 'x = a + b\nprint(x)\nreturn x' }

const chains: Chain[] = players.map((owner, chain) => ({
  owner: { nickname: owner.nickname, avatarId: owner.avatarId },
  entries: (['code', 'explain', 'code'] as const).map((kind, step) => {
    const author = players[(chain + step) % 3]
    return {
      author: { nickname: author.nickname, avatarId: author.avatarId },
      kind,
      content: kind === 'code' ? snippet : `Explicação ${chain}.${step} de ${author.nickname}.`,
    }
  }),
}))

let root: HTMLElement

function query<T extends HTMLElement>(role: string): T {
  return root.querySelector<T>(`[data-role="${role}"]`)!
}

function authors(): string[] {
  return Array.from(root.querySelectorAll('[data-role="entry-author"]'), (node) => node.textContent ?? '')
}

function setCursor(revealCursor: RevealCursor): void {
  gameState.patch({ telephone: { ...gameState.get().telephone!, revealCursor } })
}

function enterReveal(selfId: string, revealCursor: RevealCursor = { chain: 0, entry: 0 }): void {
  gameState.patch({
    screen: 'revelacao',
    room: { code: 'AB3XYZ', role: selfId === 'host-peer' ? 'host' : 'guest', kind: 'telephone', mode: 3 },
    lobby: { selfId, hostId: 'host-peer', players, stage: 'reveal', departedNickname: null },
    connection: { status: 'connected', error: null },
    telephone: {
      step: 2,
      totalSteps: 3,
      stepKind: 'code',
      received: null,
      readyIds: [],
      localReady: false,
      chains,
      revealCursor,
    },
  })
}

describe('reveal screen', () => {
  beforeEach(() => {
    gameState.reset()
    room.returnToLobby.mockReset()
    engine.advanceReveal.mockReset()
    confetti.celebrate.mockReset()
    document.body.innerHTML = '<div id="app"></div>'
    root = document.querySelector<HTMLElement>('#app')!
  })

  afterEach(() => {
    revelacao.unmount()
  })

  it('starts with the first entry of the host chain', () => {
    enterReveal('host-peer')
    revelacao.mount(root)
    expect(query('chain-title').textContent).toBe('Cadeia de João')
    expect(query('chain-position').textContent).toBe('1 de 3')
    expect(authors()).toEqual(['João'])
  })

  it('shows entries up to the cursor in order', () => {
    enterReveal('peer-gui')
    revelacao.mount(root)
    setCursor({ chain: 0, entry: 1 })
    expect(authors()).toEqual(['João', 'Gui'])
    expect(query('entry-text').textContent).toBe('Explicação 0.1 de Gui.')
    setCursor({ chain: 1, entry: 0 })
    expect(query('chain-title').textContent).toBe('Cadeia de Gui')
    expect(authors()).toEqual(['Gui'])
  })

  it('gives the host a button labelled by position', () => {
    enterReveal('host-peer', { chain: 0, entry: 2 })
    revelacao.mount(root)
    const button = query<HTMLButtonElement>('reveal-next')
    expect(button.hidden).toBe(false)
    expect(button.textContent).toBe('Próxima cadeia')
    button.click()
    expect(engine.advanceReveal).toHaveBeenCalledTimes(1)
    expect(query('reveal-conductor').hidden).toBe(true)
  })

  it('shows guests who is conducting instead of the button', () => {
    enterReveal('peer-gui')
    revelacao.mount(root)
    expect(query('reveal-next').hidden).toBe(true)
    expect(query('reveal-conductor').textContent).toBe('João está conduzindo a revelação')
  })

  it('celebrates once and unlocks the tabs when the reveal ends', () => {
    enterReveal('peer-gui', { chain: 2, entry: 1 })
    revelacao.mount(root)
    expect(query('tabs-slot').children).toHaveLength(0)
    setCursor({ chain: 2, entry: 2 })
    setCursor({ chain: 2, entry: 2 })
    expect(confetti.celebrate).toHaveBeenCalledTimes(1)
    expect(root.querySelectorAll('[data-role="chain-tab"]')).toHaveLength(3)
    expect(query('reveal-conductor').textContent).toBe('Esperando João voltar para a sala…')
  })

  it('lets each player browse any chain locally after the reveal', () => {
    enterReveal('peer-gui', { chain: 2, entry: 2 })
    revelacao.mount(root)
    root.querySelector<HTMLButtonElement>('[data-chain="0"]')!.click()
    expect(query('chain-title').textContent).toBe('Cadeia de João')
    expect(authors()).toEqual(['João', 'Gui', 'Breno'])
    expect(gameState.get().telephone?.revealCursor).toEqual({ chain: 2, entry: 2 })
  })

  it('sends the host back to the waiting room at the end', () => {
    enterReveal('host-peer', { chain: 2, entry: 2 })
    revelacao.mount(root)
    const button = query<HTMLButtonElement>('reveal-next')
    expect(button.textContent).toBe('Voltar para a sala')
    button.click()
    expect(room.returnToLobby).toHaveBeenCalledTimes(1)
    expect(engine.advanceReveal).not.toHaveBeenCalled()
  })
})
