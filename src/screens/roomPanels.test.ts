import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeAction {
  send: ReturnType<typeof vi.fn>
  onMessage: ((data: unknown, context: { peerId: string }) => void) | null
}

interface FakeRoom {
  actions: Record<string, FakeAction>
  makeAction: (name: string) => FakeAction
  leave: ReturnType<typeof vi.fn>
  onPeerJoin: ((peerId: string) => void) | null
  onPeerLeave: ((peerId: string) => void) | null
}

const trystero = vi.hoisted(() => ({
  rooms: [] as FakeRoom[],
  relayOpen: true,
  joinRoom: vi.fn(),
  getRelaySockets: vi.fn(),
}))

vi.mock('trystero/nostr', () => ({
  joinRoom: trystero.joinRoom,
  getRelaySockets: trystero.getRelaySockets,
}))

const { default: inicio } = await import('./inicio')
const { gameState } = await import('../state/gameState')
const { leaveRoom, JOIN_TIMEOUT_MS, SIGNALING_TIMEOUT_MS, NOSTR_RELAY_URLS } = await import(
  '../network/room'
)
const { COPIED_FEEDBACK_MS } = await import('./roomPanels')

let root: HTMLElement

function query<T extends HTMLElement>(role: string): T {
  return root.querySelector<T>(`[data-role="${role}"]`)!
}

function typeInto(input: HTMLInputElement, value: string): void {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function lastRoom(): FakeRoom {
  return trystero.rooms[trystero.rooms.length - 1]
}

function mountWithProfile(): void {
  inicio.mount(root)
  typeInto(root.querySelector<HTMLInputElement>('#nickname')!, 'Bruna')
}

function mockClipboard(writeText: ReturnType<typeof vi.fn>): void {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

describe('room panels on the start screen', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    gameState.reset()
    trystero.rooms.length = 0
    trystero.relayOpen = true
    trystero.joinRoom.mockReset().mockImplementation(() => {
      const room: FakeRoom = {
        actions: {},
        makeAction(name) {
          const action: FakeAction = { send: vi.fn().mockResolvedValue(undefined), onMessage: null }
          room.actions[name] = action
          return action
        },
        leave: vi.fn().mockResolvedValue(undefined),
        onPeerJoin: null,
        onPeerLeave: null,
      }
      trystero.rooms.push(room)
      return room
    })
    trystero.getRelaySockets.mockReset().mockImplementation(() => ({
      'wss://relay': { readyState: trystero.relayOpen ? WebSocket.OPEN : WebSocket.CONNECTING },
    }))
    document.body.innerHTML = '<div id="app"></div>'
    root = document.querySelector<HTMLElement>('#app')!
  })

  afterEach(() => {
    inicio.unmount()
    leaveRoom()
    vi.useRealTimers()
  })

  it('test_criar_sala_disabled_until_profile_valid', () => {
    inicio.mount(root)
    const create = query<HTMLButtonElement>('create-room')
    expect(create.disabled).toBe(true)
    expect(create.title).toBe('Escolha um apelido de 2 a 16 caracteres')
    typeInto(root.querySelector<HTMLInputElement>('#nickname')!, 'Bruna')
    expect(create.disabled).toBe(false)
  })

  it('offers the three match modes with Rápida as default', () => {
    inicio.mount(root)
    const select = query<HTMLSelectElement>('mode-select')
    expect(Array.from(select.options, (option) => option.textContent)).toEqual([
      'Rápida (3)',
      'Média (5)',
      'Maior (7)',
    ])
    expect(select.value).toBe('3')
  })

  it('shows Criando sala while waiting for a relay', () => {
    trystero.relayOpen = false
    mountWithProfile()
    query<HTMLButtonElement>('create-room').click()
    const create = query<HTMLButtonElement>('create-room')
    expect(create.textContent).toBe('Criando sala…')
    expect(create.disabled).toBe(true)
  })

  it('test_criar_sala_shows_generated_code_and_copy_button', () => {
    mountWithProfile()
    query<HTMLSelectElement>('mode-select').value = '5'
    query<HTMLButtonElement>('create-room').click()
    expect(query('room-code').textContent).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    expect(query('copy-code').textContent).toBe('Copiar')
    expect(query('room-mode').textContent).toBe('Modo: Média (5)')
    expect(root.textContent).toContain('Aguardando o outro jogador…')
    expect(gameState.get().room?.mode).toBe(5)
  })

  it('test_copy_button_updates_label_on_success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockClipboard(writeText)
    mountWithProfile()
    query<HTMLButtonElement>('create-room').click()
    query<HTMLButtonElement>('copy-code').click()
    await vi.waitFor(() => expect(query('copy-code').textContent).toBe('Copiado!'))
    expect(writeText).toHaveBeenCalledWith(gameState.get().room?.code)
    vi.advanceTimersByTime(COPIED_FEEDBACK_MS)
    expect(query('copy-code').textContent).toBe('Copiar')
  })

  it('test_copy_button_shows_fallback_on_failure', async () => {
    mockClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    mountWithProfile()
    query<HTMLButtonElement>('create-room').click()
    query<HTMLButtonElement>('copy-code').click()
    await vi.waitFor(() =>
      expect(query('copy-error').textContent).toBe(
        'Não foi possível copiar — selecione o código manualmente.',
      ),
    )
    expect(window.getSelection()?.toString()).toBe(gameState.get().room?.code)
  })

  it('cancel leaves the hosted room and restores the create form', () => {
    mountWithProfile()
    query<HTMLButtonElement>('create-room').click()
    const room = lastRoom()
    query<HTMLButtonElement>('cancel-room').click()
    expect(room.leave).toHaveBeenCalled()
    expect(gameState.get().room).toBeNull()
    expect(query<HTMLButtonElement>('create-room').disabled).toBe(false)
  })

  it('test_entrar_disabled_until_six_valid_chars', () => {
    mountWithProfile()
    const input = query<HTMLInputElement>('room-code-input')
    const join = query<HTMLButtonElement>('join-room')
    typeInto(input, 'ab3xy')
    expect(input.value).toBe('AB3XY')
    expect(join.disabled).toBe(true)
    typeInto(input, 'ab3xy0')
    expect(input.value).toBe('AB3XY')
    expect(join.disabled).toBe(true)
    typeInto(input, 'ab3xyz')
    expect(join.disabled).toBe(false)
  })

  it('Entrar stays disabled without a valid profile', () => {
    inicio.mount(root)
    typeInto(query<HTMLInputElement>('room-code-input'), 'AB3XYZ')
    expect(query<HTMLButtonElement>('join-room').disabled).toBe(true)
  })

  it('test_entrar_shows_connecting_state', () => {
    mountWithProfile()
    typeInto(query<HTMLInputElement>('room-code-input'), 'ab3xyz')
    query<HTMLButtonElement>('join-room').click()
    const join = query<HTMLButtonElement>('join-room')
    expect(join.textContent).toBe('Conectando…')
    expect(join.disabled).toBe(true)
    expect(query<HTMLButtonElement>('create-room').disabled).toBe(true)
    expect(trystero.joinRoom).toHaveBeenCalledWith(
      { appId: 'code-whispers', relayConfig: { urls: NOSTR_RELAY_URLS } },
      'AB3XYZ',
    )
  })

  it('test_room_not_found_message_after_timeout', () => {
    mountWithProfile()
    const input = query<HTMLInputElement>('room-code-input')
    typeInto(input, 'AB3XYZ')
    query<HTMLButtonElement>('join-room').click()
    vi.advanceTimersByTime(JOIN_TIMEOUT_MS)
    expect(query('guest-error').textContent).toBe('Sala não encontrada. Confira o código e tente de novo.')
    expect(input.value).toBe('AB3XYZ')
    expect(query<HTMLButtonElement>('join-room').disabled).toBe(false)
    expect(query<HTMLButtonElement>('join-room').textContent).toBe('Entrar')
  })

  it('test_room_full_message', () => {
    mountWithProfile()
    typeInto(query<HTMLInputElement>('room-code-input'), 'AB3XYZ')
    query<HTMLButtonElement>('join-room').click()
    lastRoom().actions.room_full.onMessage?.({}, { peerId: 'host' })
    expect(query('guest-error').textContent).toBe('Sala cheia — essa sala já tem 2 jogadores.')
    expect(query<HTMLInputElement>('room-code-input').value).toBe('AB3XYZ')
  })

  it('test_signaling_unreachable_message_reenables_button', () => {
    trystero.relayOpen = false
    mountWithProfile()
    query<HTMLButtonElement>('create-room').click()
    vi.advanceTimersByTime(SIGNALING_TIMEOUT_MS + 500)
    expect(query('host-error').textContent).toBe(
      'Não foi possível criar a sala. Verifique sua conexão e tente de novo.',
    )
    const create = query<HTMLButtonElement>('create-room')
    expect(create.disabled).toBe(false)
    expect(create.textContent).toBe('Criar sala')
  })

  it('moves to the code screen when the guest is welcomed', () => {
    mountWithProfile()
    typeInto(query<HTMLInputElement>('room-code-input'), 'AB3XYZ')
    query<HTMLButtonElement>('join-room').click()
    lastRoom().actions.welcome.onMessage?.({ nickname: 'Host', avatarId: 3, mode: 3 }, { peerId: 'host' })
    expect(gameState.get().screen).toBe('code')
    expect(gameState.get().remotePlayer).toEqual({ nickname: 'Host', avatarId: 3 })
  })
})
