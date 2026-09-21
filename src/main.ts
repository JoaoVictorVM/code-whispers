import './style.css'
import { gameState } from './state/gameState'
import type { ScreenId } from './types/game'
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

export function bootstrap(root: HTMLElement): () => void {
  let current: ScreenId = gameState.get().screen
  screens[current].mount(root)

  const unsubscribe = gameState.onChange((state) => {
    if (state.screen === current) return
    screens[current].unmount()
    current = state.screen
    screens[current].mount(root)
  })

  return () => {
    unsubscribe()
    screens[current].unmount()
  }
}

if (!import.meta.env.TEST) {
  const root = document.querySelector<HTMLElement>('#app')
  if (root) bootstrap(root)
}
