export interface AvatarPickerOptions {
  avatarIds: number[]
  selectedId: number | null
  onSelect: (avatarId: number) => void
  basePath?: string
}

const tileBase =
  'flex aspect-square items-center justify-center overflow-hidden rounded-full bg-surface transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function avatarSrc(basePath: string, id: number): string {
  return `${basePath}/avatar-${String(id).padStart(2, '0')}.png`
}

export function createAvatarPicker(options: AvatarPickerOptions): HTMLElement {
  const { avatarIds, selectedId, onSelect, basePath = './avatars' } = options

  const grid = document.createElement('div')
  grid.className = 'grid grid-cols-4 gap-3 sm:grid-cols-8'
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
      ? `${tileBase} selected ring-2 ring-accent ring-offset-2 ring-offset-bg`
      : `${tileBase} hover:ring-2 hover:ring-muted`

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
