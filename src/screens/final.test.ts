import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sync = vi.hoisted(() => ({ rematch: vi.fn() }))
const room = vi.hoisted(() => ({ leaveRoom: vi.fn() }))

vi.mock('../network/sync', () => sync)
vi.mock('../network/room', () => room)

const { gameState } = await import('../state/gameState')
const { default: final } = await import('./final')

const local = { nickname: 'Bruna', avatarId: 3 }
const remote = { nickname: 'Ana', avatarId: 7 }

let root: HTMLElement

function query<T extends HTMLElement>(role: string): T {
  return root.querySelector<T>(`[data-role="${role}"]`)!
}

function counts(side: 'local' | 'remote'): Record<string, number> {
  const card = query(`${side}-card`)
  return Object.fromEntries(
    Array.from(card.querySelectorAll<HTMLElement>('[data-tally]'), (cell) => [
      cell.dataset.tally!,
      Number(cell.textContent),
    ]),
  )
}

describe('match summary screen', () => {
  beforeEach(() => {
    gameState.reset()
    gameState.patch({
      screen: 'final',
      phase: 'summary',
      round: 5,
      mode: 5,
      room: { code: 'AB3XYZ', role: 'host', kind: 'duel', mode: 5 },
      localPlayer: local,
      remotePlayer: remote,
      connection: { status: 'connected', error: null },
      tallies: {
        local: { correct: 3, half: 1, wrong: 1 },
        remote: { correct: 1, half: 0, wrong: 4 },
      },
    })
    sync.rematch.mockReset().mockImplementation(() => {
      gameState.patch({ rematchFlags: { ...gameState.get().rematchFlags, local: true } })
      return true
    })
    room.leaveRoom.mockReset()
    document.body.innerHTML = '<div id="app"></div>'
    root = document.querySelector<HTMLElement>('#app')!
  })

  afterEach(() => {
    final.unmount()
  })

  it('renders the header with the mode name and round count', () => {
    final.mount(root)
    expect(root.querySelector('h1')?.textContent).toBe('Fim de jogo — Média, 5 rodadas')
  })

  it('names every mode', () => {
    for (const [mode, name] of [
      [3, 'Rápida'],
      [7, 'Maior'],
    ] as const) {
      gameState.patch({ room: { code: 'AB3XYZ', role: 'guest', kind: 'duel', mode } })
      final.mount(root)
      expect(root.querySelector('h1')?.textContent).toBe(`Fim de jogo — ${name}, ${mode} rodadas`)
      final.unmount()
    }
  })

  it('test_renders_two_cards_with_avatars_and_nicknames', () => {
    final.mount(root)
    const [first, second] = Array.from(root.querySelectorAll<HTMLElement>('article'))
    expect(first.dataset.role).toBe('local-card')
    expect(second.dataset.role).toBe('remote-card')
    expect(first.querySelector('[data-role="nickname"]')?.textContent).toBe('Bruna')
    expect(second.querySelector('[data-role="nickname"]')?.textContent).toBe('Ana')
    const firstAvatar = first.querySelector('img')!
    expect(firstAvatar.getAttribute('src')).toBe('./avatars/avatar-03.png')
    expect(firstAvatar.width).toBe(96)
    expect(second.querySelector('img')!.getAttribute('src')).toBe('./avatars/avatar-07.png')
  })

  it('test_card_counts_match_tallies_and_sum_to_rounds', () => {
    final.mount(root)
    expect(counts('local')).toEqual({ correct: 3, half: 1, wrong: 1 })
    expect(counts('remote')).toEqual({ correct: 1, half: 0, wrong: 4 })
    const sum = (values: Record<string, number>) => Object.values(values).reduce((a, b) => a + b, 0)
    expect(sum(counts('local'))).toBe(5)
    expect(sum(counts('remote'))).toBe(5)
    expect(query('local-card').textContent).toContain('Correto')
    expect(query('local-card').textContent).toContain('Meio Certo')
    expect(query('local-card').textContent).toContain('Errou')
  })

  it('test_no_score_or_winner_rendered', () => {
    final.mount(root)
    const text = root.textContent!.toLowerCase()
    for (const word of ['vencedor', 'venceu', 'ganhou', 'perdeu', 'empate', 'pontos', 'placar', '1º', '2º']) {
      expect(text).not.toContain(word)
    }
  })

  it('test_click_jogar_de_novo_calls_rematch_and_disables', () => {
    final.mount(root)
    const button = query<HTMLButtonElement>('rematch')
    expect(button.textContent).toBe('Jogar de novo')
    expect(button.disabled).toBe(false)
    button.click()
    expect(sync.rematch).toHaveBeenCalledTimes(1)
    expect(button.disabled).toBe(true)
    expect(button.textContent).toBe('Aguardando Ana…')
  })

  it('test_shows_opponent_wants_rematch_badge', () => {
    gameState.patch({ rematchFlags: { local: false, opponent: true } })
    final.mount(root)
    expect(query('rematch-badge').hidden).toBe(false)
    expect(query('rematch-badge').textContent).toBe('Ana quer jogar de novo')
  })

  it('shows the badge when the opponent asks while the screen is open', () => {
    final.mount(root)
    expect(query('rematch-badge').hidden).toBe(true)
    gameState.patch({ rematchFlags: { local: false, opponent: true } })
    expect(query('rematch-badge').hidden).toBe(false)
  })

  it('test_click_sair_leaves_room_and_returns_to_inicio', () => {
    final.mount(root)
    expect(query('exit').textContent).toBe('Sair')
    query<HTMLButtonElement>('exit').click()
    expect(room.leaveRoom).toHaveBeenCalledTimes(1)
    expect(gameState.get().screen).toBe('inicio')
    expect(sync.rematch).not.toHaveBeenCalled()
  })

  it('stops listening on unmount', () => {
    final.mount(root)
    final.unmount()
    expect(root.querySelector('[data-screen="final"]')).toBeNull()
    expect(() => gameState.patch({ rematchFlags: { local: false, opponent: true } })).not.toThrow()
  })

  it('test_cards_use_the_room_profiles', () => {
    final.mount(root)
    const { localPlayer, remotePlayer } = gameState.get()
    expect(query('local-card').querySelector('[data-role="nickname"]')?.textContent).toBe(localPlayer?.nickname)
    expect(query('remote-card').querySelector('[data-role="nickname"]')?.textContent).toBe(remotePlayer?.nickname)
  })

  it('test_counts_and_rematch_state_come_straight_from_the_synced_state', () => {
    final.mount(root)
    const { tallies } = gameState.get()
    expect(counts('local')).toEqual(tallies.local)
    expect(counts('remote')).toEqual(tallies.remote)
    gameState.patch({ rematchFlags: { local: true, opponent: false } })
    expect(query<HTMLButtonElement>('rematch').disabled).toBe(true)
  })
})
