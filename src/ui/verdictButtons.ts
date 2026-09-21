import type { Verdict } from '../types/game'

export interface VerdictButtonsOptions {
  selected: Verdict | null
  onSelect: (verdict: Verdict) => void
}

interface VerdictOption {
  value: Verdict
  label: string
  colorClass: string
}

const options: VerdictOption[] = [
  { value: 'wrong', label: 'Errou', colorClass: 'bg-danger' },
  { value: 'half', label: 'Meio Certo', colorClass: 'bg-warning' },
  { value: 'correct', label: 'Correto', colorClass: 'bg-success' },
]

const buttonBase =
  'rounded-lg px-5 py-3 font-semibold text-white transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function createVerdictButtons({ selected, onSelect }: VerdictButtonsOptions): HTMLElement {
  const group = document.createElement('div')
  group.className = 'flex flex-wrap gap-3'
  group.dataset.component = 'verdict-buttons'
  group.setAttribute('role', 'group')

  for (const option of options) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.verdict = option.value
    button.textContent = option.label

    const isSelected = selected === option.value
    const isDisabled = selected !== null && !isSelected
    button.disabled = isDisabled
    button.setAttribute('aria-pressed', String(isSelected))
    button.className = [
      buttonBase,
      option.colorClass,
      isSelected ? 'selected ring-2 ring-white ring-offset-2 ring-offset-bg' : '',
      isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:opacity-90',
    ]
      .filter(Boolean)
      .join(' ')

    button.addEventListener('click', () => onSelect(option.value))
    group.append(button)
  }

  return group
}
