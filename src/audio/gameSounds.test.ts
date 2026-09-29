import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sfx = vi.hoisted(() => ({ play: vi.fn() }))
vi.mock('./sfx', () => sfx)

const { gameState } = await import('../state/gameState')
const { startGameSounds } = await import('./gameSounds')

describe('game sounds', () => {
  let stop: () => void

  beforeEach(() => {
    gameState.reset()
    sfx.play.mockReset()
    stop = startGameSounds()
  })

  afterEach(() => stop())

  it('celebrates the connection and the summary', () => {
    gameState.patch({ connection: { status: 'connected', error: null }, screen: 'code' })
    expect(sfx.play).toHaveBeenLastCalledWith('fanfare')
    gameState.patch({ screen: 'final' })
    expect(sfx.play).toHaveBeenLastCalledWith('fanfare')
  })

  it('celebrates the start of the telephone reveal', () => {
    gameState.patch({ connection: { status: 'connected', error: null }, screen: 'etapa' })
    sfx.play.mockReset()
    gameState.patch({ screen: 'revelacao' })
    expect(sfx.play).toHaveBeenCalledWith('fanfare')
  })

  it('whooshes between phases and buzzes on disconnect', () => {
    gameState.patch({ connection: { status: 'connected', error: null }, screen: 'code' })
    gameState.patch({ screen: 'explica' })
    expect(sfx.play).toHaveBeenLastCalledWith('whoosh')
    gameState.patch({ connection: { status: 'disconnected', error: null } })
    expect(sfx.play).toHaveBeenLastCalledWith('error')
  })

  it('stays quiet after being stopped', () => {
    stop()
    gameState.patch({ connection: { status: 'connected', error: null } })
    expect(sfx.play).not.toHaveBeenCalled()
  })
})
