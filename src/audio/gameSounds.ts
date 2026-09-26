import { gameState } from '../state/gameState'
import type { GameState } from '../types/game'
import { play } from './sfx'

const PLAY_SCREENS = new Set(['code', 'explica', 'revisa'])

export function startGameSounds(): () => void {
  let previous: GameState = gameState.get()

  return gameState.onChange((state) => {
    const before = previous
    previous = state

    if (before.connection.status !== 'connected' && state.connection.status === 'connected') {
      play('fanfare')
      return
    }
    if (before.connection.status !== 'disconnected' && state.connection.status === 'disconnected') {
      play('error')
      return
    }
    if (before.screen !== state.screen && state.screen === 'final') {
      play('fanfare')
      return
    }
    if (before.screen !== state.screen && PLAY_SCREENS.has(state.screen) && PLAY_SCREENS.has(before.screen)) {
      play('whoosh')
    }
  })
}
