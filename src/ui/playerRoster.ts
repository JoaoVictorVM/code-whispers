import { play } from '../audio/sfx'
import type { LobbyPlayer } from '../types/game'
import { avatarSrc } from './avatarPicker'
import { canAnimate, gsap } from './motion'
import { seatTone } from './seatTone'

export interface PlayerRosterOptions {
  players: readonly LobbyPlayer[]
  selfId: string
}

export interface PlayerRoster {
  element: HTMLElement
  update(readyIds: readonly string[]): void
  destroy(): void
}

function createTypingDots(): HTMLElement {
  const dots = document.createElement('span')
  dots.dataset.role = 'typing'
  dots.setAttribute('aria-hidden', 'true')
  dots.className = 'absolute -right-1 -bottom-1 flex gap-0.5 rounded-full border-2 border-ink bg-paper px-1 py-0.5'
  for (const delay of ['0ms', '150ms', '300ms']) {
    const dot = document.createElement('span')
    dot.className = 'size-1 animate-bounce rounded-full bg-ink'
    dot.style.animationDelay = delay
    dots.append(dot)
  }
  return dots
}

function createCheck(): HTMLElement {
  const check = document.createElement('span')
  check.dataset.role = 'ready-check'
  check.setAttribute('aria-hidden', 'true')
  check.className = 'absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full border-2 border-ink bg-mint text-xs font-black text-ink'
  check.textContent = '✓'
  return check
}

export function createPlayerRoster({ players, selfId }: PlayerRosterOptions): PlayerRoster {
  const animated = canAnimate()
  let ready = new Set<string>()

  const list = document.createElement('ul')
  list.dataset.component = 'player-roster'
  list.className = 'flex flex-wrap items-start gap-3'

  const items = players.map((player, seat) => {
    const item = document.createElement('li')
    item.dataset.role = 'roster-player'
    item.dataset.playerId = player.id
    item.className = 'flex w-14 flex-col items-center gap-1'

    const badge = document.createElement('span')
    badge.className = 'relative'
    const avatar = document.createElement('img')
    avatar.src = avatarSrc('./avatars', player.avatarId)
    avatar.alt = ''
    avatar.width = 40
    avatar.height = 40
    avatar.className = `size-10 rounded-full border-[3px] border-ink ${seatTone(seat)} ${player.id === selfId ? 'ring-3 ring-mint' : ''}`
    badge.append(avatar)

    const name = document.createElement('span')
    name.className = 'w-full truncate text-center text-xs font-extrabold'
    name.textContent = player.id === selfId ? 'Você' : player.nickname

    const status = document.createElement('span')
    status.className = 'sr-only'

    item.append(badge, name, status)
    list.append(item)
    return { player, item, badge, status }
  })

  function update(readyIds: readonly string[]): void {
    const next = new Set(readyIds)
    let newlyReady = false
    for (const { player, item, badge, status } of items) {
      const isReady = next.has(player.id)
      item.dataset.ready = String(isReady)
      status.textContent = isReady ? `${player.nickname} está pronto` : `${player.nickname} está escrevendo`
      badge.querySelector('[data-role="ready-check"], [data-role="typing"]')?.remove()
      const marker = isReady ? createCheck() : createTypingDots()
      badge.append(marker)
      if (isReady && !ready.has(player.id)) {
        newlyReady = true
        if (animated) gsap.fromTo(marker, { scale: 0 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1.2, 0.4)' })
      }
    }
    if (newlyReady) play('pop')
    ready = next
  }

  update([])

  return {
    element: list,
    update,
    destroy() {
      list.remove()
    },
  }
}
