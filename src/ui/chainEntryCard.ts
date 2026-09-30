import { createEditor, type CodeEditor } from '../editor/codeEditor'
import type { ChainEntry, StepKind } from '../types/game'
import { avatarSrc } from './avatarPicker'
import { canAnimate, gsap } from './motion'
import { seatTone } from './seatTone'

export const ENTRY_LABELS: Record<StepKind, string> = {
  describe: 'Descrição',
  code: 'Código',
  explain: 'Explicação',
}

export interface ChainEntryCard {
  element: HTMLElement
  destroy(): void
}

export function createChainEntryCard(entry: ChainEntry, position: number, animate = false): ChainEntryCard {
  let editor: CodeEditor | null = null

  const item = document.createElement('li')
  item.dataset.role = 'chain-entry'
  item.dataset.kind = entry.kind
  item.className = `flex items-start gap-3 ${position % 2 === 0 ? '' : 'sm:flex-row-reverse'}`

  const author = document.createElement('div')
  author.className = 'flex w-16 shrink-0 flex-col items-center gap-1 text-center'
  const avatar = document.createElement('img')
  avatar.src = avatarSrc('./avatars', entry.author.avatarId)
  avatar.alt = ''
  avatar.width = 48
  avatar.height = 48
  avatar.className = `size-12 rounded-full border-[3px] border-ink shadow-[0_3px_0_var(--color-ink)] ${seatTone(position)}`
  const name = document.createElement('span')
  name.dataset.role = 'entry-author'
  name.className = 'w-full truncate text-xs font-extrabold'
  name.textContent = entry.author.nickname
  author.append(avatar, name)

  const card = document.createElement('div')
  card.className = 'ink-card flex min-w-0 flex-1 flex-col gap-3 p-4'
  const header = document.createElement('div')
  header.className = 'flex flex-wrap items-center justify-between gap-2'
  const label = document.createElement('span')
  label.dataset.role = 'entry-kind'
  label.className = 'rounded-full border-2 border-ink bg-sunflower px-3 py-0.5 text-xs font-extrabold uppercase tracking-wider text-ink'
  label.textContent = ENTRY_LABELS[entry.kind]
  header.append(label)
  card.append(header)

  if (typeof entry.content === 'string') {
    const quote = document.createElement('blockquote')
    quote.dataset.role = 'entry-text'
    quote.className = 'whitespace-pre-wrap break-words border-l-[5px] border-bubblegum pl-4 text-lg font-semibold text-ink'
    quote.textContent = entry.content
    card.append(quote)
  } else {
    const slot = document.createElement('div')
    slot.dataset.role = 'entry-code'
    card.append(slot)
    editor = createEditor({ parent: slot, readOnly: true, fitContent: true, initialLanguage: entry.content.language, initialCode: entry.content.code })
  }

  item.append(author, card)

  if (animate && canAnimate()) {
    gsap.from(item, { y: 40, opacity: 0, scale: 0.92, duration: 0.55, ease: 'back.out(1.7)' })
  }

  return {
    element: item,
    destroy() {
      editor?.destroy()
      editor = null
      item.remove()
    },
  }
}
