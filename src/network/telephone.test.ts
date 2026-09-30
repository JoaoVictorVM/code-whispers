import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayerProfile } from '../types/game'

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
  joinRoom: vi.fn(),
  getRelaySockets: vi.fn(),
}))

vi.mock('trystero/nostr', () => ({
  joinRoom: trystero.joinRoom,
  getRelaySockets: trystero.getRelaySockets,
  selfId: 'self-peer',
}))

const { gameState } = await import('../state/gameState')
const { hostTelephoneRoom, joinRoomByCode, leaveRoom, startTelephoneMatch } = await import('./room')
const { startTelephone, stopTelephone, submitStep, retractStep, advanceReveal } = await import('./telephone')

const host: PlayerProfile = { nickname: 'João', avatarId: 1 }
const guests: PlayerProfile[] = [
  { nickname: 'Gui', avatarId: 3 },
  { nickname: 'Breno', avatarId: 5 },
  { nickname: 'Lia', avatarId: 2 },
]
const snippet = { language: 'python' as const, code: 'x = a + b\nprint(x)\nreturn x' }
const otherSnippet = { language: 'javascript' as const, code: 'function soma(a, b) {\n  return a + b\n}' }
const text = 'Soma dois números e mostra na tela.'

function room(): FakeRoom {
  return trystero.rooms[trystero.rooms.length - 1]
}

function action(name: string): FakeAction {
  return room().actions[name]
}

function receive(name: string, data: unknown, peerId: string): void {
  action(name).onMessage?.(data, { peerId })
}

async function hostMatch(guestCount: number): Promise<void> {
  hostTelephoneRoom(host)
  guests.slice(0, guestCount).forEach((guest, index) => receive('hello', guest, `peer-${index + 1}`))
  startTelephoneMatch()
  await Promise.resolve()
}

function answerFor(kind: string, seat: number): unknown {
  return kind === 'code' ? (seat % 2 === 0 ? snippet : otherSnippet) : { text: `${text} Assento ${seat}.` }
}

function answerAll(seats: number): void {
  const { telephone } = gameState.get()
  const kind = telephone!.stepKind
  submitStep(kind === 'code' ? snippet : `${text} Assento 0.`)
  for (let seat = 1; seat < seats; seat += 1) {
    receive('tel_submit', { step: telephone!.step, answer: answerFor(kind, seat) }, `peer-${seat}`)
  }
}

function resetFakeRoom(): void {
  gameState.reset()
  trystero.rooms.length = 0
  trystero.joinRoom.mockReset().mockImplementation(() => {
    const fake: FakeRoom = {
      actions: {},
      makeAction(name) {
        const created: FakeAction = { send: vi.fn().mockResolvedValue(undefined), onMessage: null }
        fake.actions[name] = created
        return created
      },
      leave: vi.fn().mockResolvedValue(undefined),
      onPeerJoin: null,
      onPeerLeave: null,
    }
    trystero.rooms.push(fake)
    return fake
  })
  trystero.getRelaySockets.mockReset().mockReturnValue({ relay: { readyState: WebSocket.OPEN } })
  startTelephone()
}

function cleanUp(): void {
  stopTelephone()
  leaveRoom()
  vi.restoreAllMocks()
}

describe('telephone match engine as host', () => {
  beforeEach(resetFakeRoom)
  afterEach(cleanUp)

  it('dispatches the first step to every guest when the match starts', async () => {
    await hostMatch(2)
    const expected = { step: 0, total: 3, kind: 'code', received: null }
    expect(action('tel_step').send).toHaveBeenCalledWith(expected, { target: 'peer-1' })
    expect(action('tel_step').send).toHaveBeenCalledWith(expected, { target: 'peer-2' })
    expect(action('tel_step').send).toHaveBeenCalledTimes(2)
    expect(gameState.get().telephone).toEqual({
      step: 0,
      totalSteps: 3,
      stepKind: 'code',
      received: null,
      readyIds: [],
      localReady: false,
      chains: null,
      revealCursor: { chain: 0, entry: 0 },
    })
  })

  it('starts even groups with a description', async () => {
    await hostMatch(3)
    expect(gameState.get().telephone?.stepKind).toBe('describe')
    expect(action('tel_step').send).toHaveBeenCalledWith({ step: 0, total: 4, kind: 'describe', received: null }, { target: 'peer-3' })
  })

  it('advances only when every seat has answered', async () => {
    await hostMatch(2)
    expect(submitStep(snippet)).toBe(true)
    receive('tel_submit', { step: 0, answer: otherSnippet }, 'peer-1')
    expect(gameState.get().telephone?.step).toBe(0)
    expect(action('tel_step').send).toHaveBeenCalledTimes(2)
    receive('tel_submit', { step: 0, answer: snippet }, 'peer-2')
    expect(gameState.get().telephone?.step).toBe(1)
    expect(gameState.get().telephone?.stepKind).toBe('explain')
  })

  it('hands each guest only the content it must answer, without the author', async () => {
    await hostMatch(2)
    submitStep(snippet)
    receive('tel_submit', { step: 0, answer: otherSnippet }, 'peer-1')
    receive('tel_submit', { step: 0, answer: snippet }, 'peer-2')
    expect(action('tel_step').send).toHaveBeenCalledWith({ step: 1, total: 3, kind: 'explain', received: snippet }, { target: 'peer-1' })
    expect(action('tel_step').send).toHaveBeenCalledWith({ step: 1, total: 3, kind: 'explain', received: otherSnippet }, { target: 'peer-2' })
    expect(gameState.get().telephone?.received).toEqual(snippet)
    const payloads = JSON.stringify(action('tel_step').send.mock.calls)
    expect(payloads).not.toContain('Gui')
    expect(payloads).not.toContain('Breno')
  })

  it('broadcasts who is ready after every change', async () => {
    await hostMatch(2)
    receive('tel_submit', { step: 0, answer: otherSnippet }, 'peer-1')
    expect(action('tel_progress').send).toHaveBeenLastCalledWith({ step: 0, readyIds: ['peer-1'] })
    submitStep(snippet)
    expect(action('tel_progress').send).toHaveBeenLastCalledWith({ step: 0, readyIds: ['self-peer', 'peer-1'] })
    expect(gameState.get().telephone).toMatchObject({ readyIds: ['self-peer', 'peer-1'], localReady: true })
  })

  it('reopens a seat when its answer is retracted', async () => {
    await hostMatch(2)
    submitStep(snippet)
    receive('tel_submit', { step: 0, answer: otherSnippet }, 'peer-1')
    receive('tel_retract', { step: 0 }, 'peer-1')
    expect(action('tel_progress').send).toHaveBeenLastCalledWith({ step: 0, readyIds: ['self-peer'] })
    expect(retractStep()).toBe(true)
    expect(gameState.get().telephone).toMatchObject({ readyIds: [], localReady: false })
    receive('tel_submit', { step: 0, answer: snippet }, 'peer-2')
    expect(gameState.get().telephone?.step).toBe(0)
  })

  it('ignores late, invalid and unknown answers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await hostMatch(2)
    receive('tel_submit', { step: 1, answer: snippet }, 'peer-1')
    receive('tel_submit', { step: 0, answer: { language: 'python', code: 'x = 1' } }, 'peer-1')
    receive('tel_submit', { step: 0, answer: snippet }, 'stranger')
    receive('tel_submit', { step: 0, answer: snippet }, 'self-peer')
    expect(action('tel_progress').send).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('rejects invalid local answers and double submits', async () => {
    await hostMatch(2)
    expect(submitStep({ language: 'python', code: 'x = 1' })).toBe(false)
    expect(submitStep('curto')).toBe(false)
    expect(submitStep(snippet)).toBe(true)
    expect(submitStep(snippet)).toBe(false)
  })

  it('keeps the chains hidden until the match ends', async () => {
    await hostMatch(2)
    answerAll(3)
    answerAll(3)
    expect(gameState.get().telephone?.step).toBe(2)
    expect(gameState.get().telephone?.chains).toBeNull()
    expect(action('tel_finish').send).not.toHaveBeenCalled()
  })

  it('moves everyone to the reveal with the finished chains', async () => {
    await hostMatch(2)
    answerAll(3)
    answerAll(3)
    answerAll(3)
    const { screen, lobby, telephone } = gameState.get()
    expect(screen).toBe('revelacao')
    expect(lobby?.stage).toBe('reveal')
    const chains = telephone?.chains
    expect(chains).toHaveLength(3)
    expect(chains?.[0].owner).toEqual(host)
    expect(chains?.[0].entries.map((entry) => entry.author.nickname)).toEqual(['João', 'Gui', 'Breno'])
    expect(chains?.[0].entries.map((entry) => entry.kind)).toEqual(['code', 'explain', 'code'])
    expect(action('tel_finish').send).toHaveBeenCalledWith({ chains })
    expect(telephone?.revealCursor).toEqual({ chain: 0, entry: 0 })
  })

  it('advances the reveal and broadcasts the absolute position', async () => {
    await hostMatch(2)
    answerAll(3)
    answerAll(3)
    answerAll(3)
    expect(advanceReveal()).toBe(true)
    expect(advanceReveal()).toBe(true)
    expect(action('tel_cursor').send.mock.calls).toEqual([[{ chain: 0, entry: 1 }], [{ chain: 0, entry: 2 }]])
    expect(advanceReveal()).toBe(true)
    expect(gameState.get().telephone?.revealCursor).toEqual({ chain: 1, entry: 0 })
  })

  it('stops advancing once the reveal is finished', async () => {
    await hostMatch(2)
    answerAll(3)
    answerAll(3)
    answerAll(3)
    gameState.patch({ telephone: { ...gameState.get().telephone!, revealCursor: { chain: 2, entry: 2 } } })
    expect(advanceReveal()).toBe(false)
    expect(action('tel_cursor').send).not.toHaveBeenCalled()
  })

  it('does not advance a reveal before the match ends', async () => {
    await hostMatch(2)
    expect(advanceReveal()).toBe(false)
  })

  it('stops the match when the room ends', async () => {
    await hostMatch(2)
    submitStep(snippet)
    leaveRoom()
    expect(gameState.get().telephone).toBeNull()
    expect(submitStep(snippet)).toBe(false)
  })
})

const seats = [
  { id: 'host-peer', ...host, isHost: true },
  { id: 'self-peer', ...guests[0], isHost: false },
  { id: 'peer-b', ...guests[1], isHost: false },
]

function joinMatch(): void {
  joinRoomByCode(guests[0], 'AB3XYZ')
  receive('welcome', { kind: 'telephone', ...host, players: seats }, 'host-peer')
  receive('tel_start', { players: seats }, 'host-peer')
}

function finishedChains(): unknown[] {
  const kinds = ['code', 'explain', 'code']
  return seats.map((owner, chain) => ({
    owner: { nickname: owner.nickname, avatarId: owner.avatarId },
    entries: kinds.map((kind, step) => {
      const author = seats[(chain + step) % 3]
      return {
        author: { nickname: author.nickname, avatarId: author.avatarId },
        kind,
        content: kind === 'code' ? snippet : text,
      }
    }),
  }))
}

describe('telephone match engine as guest', () => {
  beforeEach(resetFakeRoom)
  afterEach(cleanUp)

  it('applies steps sent by the host only', () => {
    joinMatch()
    receive('tel_step', { step: 0, total: 3, kind: 'code', received: null }, 'peer-b')
    expect(gameState.get().telephone).toBeNull()
    receive('tel_step', { step: 0, total: 3, kind: 'code', received: null }, 'host-peer')
    expect(gameState.get().telephone).toEqual({
      step: 0,
      totalSteps: 3,
      stepKind: 'code',
      received: null,
      readyIds: [],
      localReady: false,
      chains: null,
      revealCursor: { chain: 0, entry: 0 },
    })
  })

  it('ignores malformed, mismatched and repeated steps', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    joinMatch()
    receive('tel_step', { step: 0, total: 4, kind: 'describe', received: null }, 'host-peer')
    receive('tel_step', { step: 1, total: 3, kind: 'explain', received: text }, 'host-peer')
    expect(gameState.get().telephone).toBeNull()
    receive('tel_step', { step: 1, total: 3, kind: 'explain', received: snippet }, 'host-peer')
    receive('tel_step', { step: 0, total: 3, kind: 'code', received: null }, 'host-peer')
    expect(gameState.get().telephone).toMatchObject({ step: 1, received: snippet })
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('sends answers to the host and marks itself ready', () => {
    joinMatch()
    receive('tel_step', { step: 1, total: 3, kind: 'explain', received: snippet }, 'host-peer')
    expect(submitStep(`  ${text}  `)).toBe(true)
    expect(action('tel_submit').send).toHaveBeenCalledWith({ step: 1, answer: { text } }, { target: 'host-peer' })
    expect(gameState.get().telephone).toMatchObject({ localReady: true, readyIds: ['self-peer'] })
    expect(submitStep(text)).toBe(false)
  })

  it('sends code answers as they are', () => {
    joinMatch()
    receive('tel_step', { step: 0, total: 3, kind: 'code', received: null }, 'host-peer')
    submitStep(snippet)
    expect(action('tel_submit').send).toHaveBeenCalledWith({ step: 0, answer: snippet }, { target: 'host-peer' })
  })

  it('retracts an answer while the step is open', () => {
    joinMatch()
    receive('tel_step', { step: 0, total: 3, kind: 'code', received: null }, 'host-peer')
    expect(retractStep()).toBe(false)
    submitStep(snippet)
    expect(retractStep()).toBe(true)
    expect(action('tel_retract').send).toHaveBeenCalledWith({ step: 0 }, { target: 'host-peer' })
    expect(gameState.get().telephone).toMatchObject({ localReady: false, readyIds: [] })
  })

  it('follows progress from the host and keeps its own ready mark', () => {
    joinMatch()
    receive('tel_step', { step: 0, total: 3, kind: 'code', received: null }, 'host-peer')
    receive('tel_progress', { step: 0, readyIds: ['peer-b'] }, 'host-peer')
    expect(gameState.get().telephone?.readyIds).toEqual(['peer-b'])
    submitStep(snippet)
    receive('tel_progress', { step: 0, readyIds: ['peer-b'] }, 'host-peer')
    expect(gameState.get().telephone?.readyIds).toEqual(['peer-b', 'self-peer'])
    receive('tel_progress', { step: 0, readyIds: [] }, 'peer-b')
    expect(gameState.get().telephone?.readyIds).toEqual(['peer-b', 'self-peer'])
  })

  it('clears its ready mark when the next step arrives', () => {
    joinMatch()
    receive('tel_step', { step: 0, total: 3, kind: 'code', received: null }, 'host-peer')
    submitStep(snippet)
    receive('tel_step', { step: 1, total: 3, kind: 'explain', received: snippet }, 'host-peer')
    expect(gameState.get().telephone).toMatchObject({ step: 1, localReady: false, readyIds: [] })
  })

  it('moves to the reveal with the chains sent by the host', () => {
    joinMatch()
    receive('tel_step', { step: 2, total: 3, kind: 'code', received: text }, 'host-peer')
    receive('tel_finish', { chains: finishedChains() }, 'host-peer')
    const { screen, lobby, telephone } = gameState.get()
    expect(screen).toBe('revelacao')
    expect(lobby?.stage).toBe('reveal')
    expect(telephone?.chains).toEqual(finishedChains())
    expect(telephone?.revealCursor).toEqual({ chain: 0, entry: 0 })
  })

  it('ignores broken chains', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    joinMatch()
    receive('tel_step', { step: 2, total: 3, kind: 'code', received: text }, 'host-peer')
    receive('tel_finish', { chains: finishedChains().slice(0, 2) }, 'host-peer')
    expect(gameState.get().screen).toBe('etapa')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('follows the reveal position sent by the host only', () => {
    joinMatch()
    receive('tel_step', { step: 2, total: 3, kind: 'code', received: text }, 'host-peer')
    receive('tel_cursor', { chain: 1, entry: 0 }, 'host-peer')
    expect(gameState.get().telephone?.revealCursor).toEqual({ chain: 0, entry: 0 })
    receive('tel_finish', { chains: finishedChains() }, 'host-peer')
    receive('tel_cursor', { chain: 1, entry: 0 }, 'peer-b')
    expect(gameState.get().telephone?.revealCursor).toEqual({ chain: 0, entry: 0 })
    receive('tel_cursor', { chain: 1, entry: 0 }, 'host-peer')
    receive('tel_cursor', { chain: 1, entry: 0 }, 'host-peer')
    expect(gameState.get().telephone?.revealCursor).toEqual({ chain: 1, entry: 0 })
    receive('tel_cursor', { chain: 5, entry: 0 }, 'host-peer')
    expect(gameState.get().telephone?.revealCursor).toEqual({ chain: 1, entry: 0 })
  })

  it('never lets a guest advance the reveal', () => {
    joinMatch()
    receive('tel_step', { step: 2, total: 3, kind: 'code', received: text }, 'host-peer')
    receive('tel_finish', { chains: finishedChains() }, 'host-peer')
    expect(advanceReveal()).toBe(false)
  })
})
