import type { Verdict } from '../types/game'

export interface VerdictButtonsOptions {
  selected: Verdict | null
  onSelect: (verdict: Verdict) => void
}

interface VerdictOption {
  value: Verdict
  label: string
  icon: string
  colorClass: string
}

const options: VerdictOption[] = [
  { value: 'wrong', label: 'Errou', icon: '✗', colorClass: 'bg-cherry' },
  { value: 'half', label: 'Meio Certo', icon: '≈', colorClass: 'bg-sunflower' },
  { value: 'correct', label: 'Correto', icon: '✓', colorClass: 'bg-mint' },
]

const buttonBase =
  'btn-chunky flex-col gap-0.5 px-3 py-4 text-lg text-ink before:font-display before:text-3xl before:leading-none before:content-[attr(data-icon)]'

export function createVerdictButtons({ selected, onSelect }: VerdictButtonsOptions): HTMLElement {
  const group = document.createElement('div')
  group.className = 'grid grid-cols-3 gap-3'
  group.dataset.component = 'verdict-buttons'
  group.setAttribute('role', 'group')

  for (const option of options) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.verdict = option.value
    button.dataset.icon = option.icon
    button.textContent = option.label

    const isSelected = selected === option.value
    const isDisabled = selected !== null && !isSelected
    button.disabled = isDisabled
    button.setAttribute('aria-pressed', String(isSelected))
    button.className = [
      buttonBase,
      option.colorClass,
      isSelected ? 'selected ring-4 ring-paper ring-offset-2 ring-offset-grape' : '',
      isDisabled ? 'opacity-45' : '',
    ]
      .filter(Boolean)
      .join(' ')

    button.addEventListener('click', () => onSelect(option.value))
    group.append(button)
  }

  return group
}
