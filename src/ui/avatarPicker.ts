export interface AvatarPickerOptions {
  avatarIds: number[]
  selectedId: number | null
  onSelect: (avatarId: number) => void
  basePath?: string
}

const tileBase =
  'avatar-tile flex aspect-square items-center justify-center overflow-hidden rounded-full border-[3px] border-ink bg-paper transition-transform duration-200 ease-[var(--ease-bounce)] focus:outline-none focus-visible:ring-4 focus-visible:ring-sky'

export function avatarSrc(basePath: string, id: number): string {
  return `${basePath}/avatar-${String(id).padStart(2, '0')}.png`
}

export function createAvatarPicker(options: AvatarPickerOptions): HTMLElement {
  const { avatarIds, selectedId, onSelect, basePath = './avatars' } = options

  const grid = document.createElement('div')
  grid.className = 'grid grid-cols-4 gap-3 sm:grid-cols-8 sm:gap-4'
  grid.dataset.component = 'avatar-picker'
  grid.setAttribute('role', 'radiogroup')

  for (const id of avatarIds) {
    const isSelected = id === selectedId

    const tile = document.createElement('button')
    tile.type = 'button'
    tile.dataset.avatarId = String(id)
    tile.setAttribute('role', 'radio')
    tile.setAttribute('aria-checked', String(isSelected))
    tile.setAttribute('aria-label', `Avatar ${id}`)
    tile.className = isSelected
      ? `${tileBase} selected -translate-y-1 scale-110 bg-sunflower shadow-[0_5px_0_var(--color-ink)] ring-4 ring-tangerine`
      : `${tileBase} shadow-[0_3px_0_var(--color-ink)] hover:-translate-y-1 hover:-rotate-6`

    const image = document.createElement('img')
    image.src = avatarSrc(basePath, id)
    image.alt = ''
    image.width = 128
    image.height = 128
    image.className = 'h-full w-full object-cover'
    tile.append(image)

    tile.addEventListener('click', () => onSelect(id))
    grid.append(tile)
  }

  return grid
}
