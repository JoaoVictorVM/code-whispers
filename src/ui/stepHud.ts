import { gameState } from '../state/gameState'
import type { GameState, StepKind } from '../types/game'
import { createPlayerRoster, type PlayerRoster } from './playerRoster'

export const STEP_LABELS: Record<StepKind, string> = {
  describe: 'Descreva',
  code: 'Programe',
  explain: 'Explique',
}

export function stepHeaderText(step: number, totalSteps: number, kind: StepKind): string {
  return `Etapa ${step + 1} de ${totalSteps} · ${STEP_LABELS[kind]}`
}

export interface StepHud {
  element: HTMLElement
  destroy(): void
}

export function createStepHud(): StepHud {
  const initial = gameState.get()
  const header = document.createElement('header')
  header.dataset.component = 'step-hud'
  header.className = 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:pr-16'

  const heading = document.createElement('h1')
  heading.dataset.role = 'step-header'
  heading.className = 'display-title text-2xl sm:text-3xl'

  const roster: PlayerRoster = createPlayerRoster({
    players: initial.lobby?.players ?? [],
    selfId: initial.lobby?.selfId ?? '',
  })

  header.append(heading, roster.element)

  function sync(state: GameState): void {
    const { telephone } = state
    if (!telephone) return
    heading.textContent = stepHeaderText(telephone.step, telephone.totalSteps, telephone.stepKind)
    roster.update(telephone.readyIds)
  }

  sync(initial)
  const unsubscribe = gameState.onChange(sync)

  return {
    element: header,
    destroy() {
      unsubscribe()
      roster.destroy()
      header.remove()
    },
  }
}
