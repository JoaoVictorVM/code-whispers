import './style.css'
import { startGameSounds } from './audio/gameSounds'
import { gameState } from './state/gameState'
import { leaveRoom } from './network/room'
import './network/sync'
import { createDisconnectModal } from './ui/disconnectModal'
import { showPhaseSplash } from './ui/phaseSplash'
import { createSoundToggle } from './ui/soundToggle'
import type { GameState, ScreenId } from './types/game'
import { createPlaceholderScreen, type ScreenModule } from './screens/screen'
import inicio from './screens/inicio'
import code from './screens/code'
import explica from './screens/explica'
import revisa from './screens/revisa'
import final from './screens/final'
import sala from './screens/sala'

const PHASE_SPLASH_LABELS: Partial<Record<ScreenId, string>> = {
  code: 'Escrever',
  explica: 'Explicar',
  revisa: 'Avaliar',
}

const screens: Record<ScreenId, ScreenModule> = {
  inicio,
  code,
  explica,
  revisa,
  final,
  sala,
  etapa: createPlaceholderScreen('etapa', 'A partida vai começar…'),
}

function disconnectCopy(state: GameState): { opponentNickname: string; message?: string } {
  const { room, lobby } = state
  if (room?.kind !== 'telephone' || !lobby) {
    return { opponentNickname: state.remotePlayer?.nickname ?? 'O outro jogador' }
  }
  const opponentNickname = lobby.departedNickname ?? 'O host'
  if (lobby.stage === 'playing') return { opponentNickname }
  return { opponentNickname, message: `${opponentNickname} encerrou a sala.` }
}

function returnToStart(): void {
  leaveRoom()
  gameState.patch({ screen: 'inicio' })
}

export function bootstrap(root: HTMLElement): () => void {
  let current: ScreenId = gameState.get().screen
  let disconnectModal: HTMLElement | null = null
  const soundToggle = createSoundToggle()
  document.body.append(soundToggle.element)
  const stopSounds = startGameSounds()
  screens[current].mount(root)

  function syncDisconnectModal(state: GameState): void {
    const shouldShow = state.connection.status === 'disconnected' && state.screen !== 'inicio'
    if (shouldShow && !disconnectModal) {
      disconnectModal = createDisconnectModal({ ...disconnectCopy(state), onConfirm: returnToStart })
      root.append(disconnectModal)
    } else if (!shouldShow && disconnectModal) {
      disconnectModal.remove()
      disconnectModal = null
    }
  }

  const unsubscribe = gameState.onChange((state) => {
    if (state.screen !== current) {
      screens[current].unmount()
      current = state.screen
      screens[current].mount(root)
      const splashLabel = PHASE_SPLASH_LABELS[current]
      if (splashLabel) {
        const latest = gameState.get()
        showPhaseSplash({ round: latest.round, totalRounds: latest.room?.mode ?? latest.mode, phaseLabel: splashLabel })
      }
    }
    syncDisconnectModal(gameState.get())
  })

  return () => {
    unsubscribe()
    stopSounds()
    soundToggle.destroy()
    disconnectModal?.remove()
    disconnectModal = null
    screens[current].unmount()
  }
}

if (!import.meta.env.TEST) {
  const root = document.querySelector<HTMLElement>('#app')
  if (root) bootstrap(root)
}
