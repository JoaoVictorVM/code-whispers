export interface RoundHeaderOptions {
  round: number
  totalRounds: number
  phaseLabel: string
}

export function roundHeaderText({ round, totalRounds, phaseLabel }: RoundHeaderOptions): string {
  return `Rodada ${round} de ${totalRounds} · ${phaseLabel}`
}

export function createRoundHeader(options: RoundHeaderOptions): HTMLElement {
  const heading = document.createElement('h1')
  heading.dataset.component = 'round-header'
  heading.className = 'display-title text-2xl sm:text-3xl'
  heading.textContent = roundHeaderText(options)
  return heading
}
