import { gameState } from '../state/gameState'
import type { GameState } from '../types/game'
import { createPhaseTrack, type TrackPhase } from './phaseTrack'
import { createRoundHeader } from './roundHeader'
import { createWhisperLine } from './whisperLine'

export interface GameHudOptions {
  phase: TrackPhase
  phaseLabel: string
}

export interface GameHud {
  element: HTMLElement
  destroy(): void
}

export function createGameHud({ phase, phaseLabel }: GameHudOptions): GameHud {
  const initial = gameState.get()
  const header = document.createElement('header')
  header.dataset.component = 'game-hud'
  header.className = 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'

  const titleBlock = document.createElement('div')
  titleBlock.className = 'flex flex-col gap-3'
  titleBlock.append(
    createRoundHeader({ round: initial.round, totalRounds: initial.room?.mode ?? initial.mode, phaseLabel }),
    createPhaseTrack(phase),
  )

  const line = createWhisperLine({ local: initial.localPlayer, remote: initial.remotePlayer, compact: true })
  line.element.classList.add('sm:max-w-80', 'shrink-0')

  header.append(titleBlock, line.element)

  let previous = initial.readyFlags

  function sync(state: GameState): void {
    const { local, opponent } = state.readyFlags
    if (local && !previous.local) line.pulse('local')
    if (opponent && !previous.opponent) line.pulse('remote')
    line.setWaiting('remote', local && !opponent)
    previous = state.readyFlags
  }

  sync(initial)
  const unsubscribe = gameState.onChange(sync)

  return {
    element: header,
    destroy() {
      unsubscribe()
      line.destroy()
      header.remove()
    },
  }
}
