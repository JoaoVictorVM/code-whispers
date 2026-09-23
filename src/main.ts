import './style.css'
import { gameState } from './state/gameState'
import { leaveRoom } from './network/room'
import './network/sync'
import { createDisconnectModal } from './ui/disconnectModal'
import type { GameState, ScreenId } from './types/game'
import type { ScreenModule } from './screens/screen'
import inicio from './screens/inicio'
import code from './screens/code'
import explica from './screens/explica'
import revisa from './screens/revisa'
import final from './screens/final'

const screens: Record<ScreenId, ScreenModule> = {
  inicio,
  code,
  explica,
  revisa,
  final,
}

function returnToStart(): void {
  leaveRoom()
  gameState.patch({ screen: 'inicio' })
}

export function bootstrap(root: HTMLElement): () => void {
  let current: ScreenId = gameState.get().screen
  let disconnectModal: HTMLElement | null = null
  screens[current].mount(root)

  function syncDisconnectModal(state: GameState): void {
    const shouldShow = state.connection.status === 'disconnected' && state.screen !== 'inicio'
    if (shouldShow && !disconnectModal) {
      disconnectModal = createDisconnectModal({
        opponentNickname: state.remotePlayer?.nickname ?? 'O outro jogador',
        onConfirm: returnToStart,
      })
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
    }
    syncDisconnectModal(gameState.get())
  })

  return () => {
    unsubscribe()
    disconnectModal?.remove()
    disconnectModal = null
    screens[current].unmount()
  }
}

if (!import.meta.env.TEST) {
  const root = document.querySelector<HTMLElement>('#app')
  if (root) bootstrap(root)
}
