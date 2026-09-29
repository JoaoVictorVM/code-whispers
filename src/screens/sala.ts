import { play } from '../audio/sfx'
import { TELEPHONE_MAX_PLAYERS, canStart, missingPlayers } from '../network/lobbyProtocol'
import { leaveRoom, startTelephoneMatch } from '../network/room'
import { gameState } from '../state/gameState'
import type { GameState, LobbyPlayer } from '../types/game'
import { avatarSrc } from '../ui/avatarPicker'
import { canAnimate, gsap } from '../ui/motion'
import { createRoomCodeDisplay, type RoomCodeDisplay } from '../ui/roomCodeDisplay'
import type { ScreenModule } from './screen'

const SEAT_TONES = ['bg-sunflower', 'bg-sky', 'bg-bubblegum', 'bg-mint', 'bg-tangerine', 'bg-lilac', 'bg-sky', 'bg-bubblegum']
const SEAT_TILTS = ['-rotate-2', 'rotate-1', '-rotate-1', 'rotate-2']

let container: HTMLElement | null = null
let teardown: (() => void) | null = null

export function missingPlayersHint(missing: number): string {
  return missing === 1 ? 'Falta 1 jogador' : `Faltam ${missing} jogadores`
}

function badge(text: string, tone: string): HTMLElement {
  const element = document.createElement('span')
  element.className = `rounded-full border-2 border-ink px-2 py-px text-[0.65rem] font-extrabold uppercase tracking-wider text-ink ${tone}`
  element.textContent = text
  return element
}

function createSeat(player: LobbyPlayer, index: number, isSelf: boolean): HTMLElement {
  const seat = document.createElement('li')
  seat.dataset.role = 'seat'
  seat.dataset.playerId = player.id
  seat.className = `ink-card flex flex-col items-center gap-2 px-3 py-4 text-center ${SEAT_TILTS[index % SEAT_TILTS.length]} ${isSelf ? 'ring-4 ring-mint' : ''}`

  const avatar = document.createElement('img')
  avatar.src = avatarSrc('./avatars', player.avatarId)
  avatar.alt = ''
  avatar.width = 64
  avatar.height = 64
  avatar.className = `size-16 rounded-full border-[3px] border-ink shadow-[0_3px_0_var(--color-ink)] ${SEAT_TONES[index % SEAT_TONES.length]}`

  const nickname = document.createElement('span')
  nickname.dataset.role = 'seat-nickname'
  nickname.className = 'w-full truncate font-display text-lg leading-tight'
  nickname.textContent = player.nickname

  const badges = document.createElement('div')
  badges.className = 'flex min-h-5 flex-wrap justify-center gap-1'
  if (player.isHost) badges.append(badge('Host', 'bg-sunflower'))
  if (isSelf) badges.append(badge('Você', 'bg-mint'))

  seat.append(avatar, nickname, badges)
  return seat
}

function createEmptySeat(): HTMLElement {
  const seat = document.createElement('li')
  seat.dataset.role = 'empty-seat'
  seat.className = 'flex flex-col items-center justify-center gap-2 rounded-2xl border-[3px] border-dashed border-lilac/50 px-3 py-4 text-center'
  const placeholder = document.createElement('span')
  placeholder.setAttribute('aria-hidden', 'true')
  placeholder.className = 'grid size-16 place-items-center rounded-full border-[3px] border-dashed border-lilac/50 font-display text-2xl text-lilac/70'
  placeholder.textContent = '?'
  const label = document.createElement('span')
  label.className = 'text-sm font-bold text-lilac/80'
  label.textContent = 'Esperando…'
  seat.append(placeholder, label)
  return seat
}

function mount(root: HTMLElement): void {
  const animated = canAnimate()
  let seatedIds = new Set<string>()
  let seatsKey = ''

  container = document.createElement('section')
  container.dataset.screen = 'sala'
  container.className = 'container flex flex-col items-center gap-6 py-8'

  const heading = document.createElement('h1')
  heading.className = 'display-title text-center text-4xl sm:text-5xl'
  heading.textContent = 'Telefone sem fio'

  const tagline = document.createElement('p')
  tagline.className = 'max-w-xl text-center text-lg font-semibold text-lilac'
  tagline.textContent = 'Mande o código para o grupo. Cada um escreve, o próximo traduz e a mensagem vai mudando no caminho.'

  const codeCard = document.createElement('div')
  codeCard.className = 'ink-card flex flex-col items-center gap-3 px-6 py-5'
  const codeLabel = document.createElement('span')
  codeLabel.className = 'text-sm font-extrabold uppercase tracking-wider text-ink/70'
  codeLabel.textContent = 'Código da sala'
  const codeDisplay: RoomCodeDisplay = createRoomCodeDisplay()
  codeCard.append(codeLabel, codeDisplay.element)

  const count = document.createElement('p')
  count.dataset.role = 'player-count'
  count.setAttribute('aria-live', 'polite')
  count.className = 'rounded-full border-[3px] border-ink bg-paper px-4 py-1 font-display text-lg text-ink shadow-[0_3px_0_var(--color-ink)]'

  const seats = document.createElement('ul')
  seats.dataset.role = 'seats'
  seats.className = 'grid w-full max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4'

  const footer = document.createElement('div')
  footer.className = 'flex flex-col items-center gap-3 pb-6'

  const startButton = document.createElement('button')
  startButton.type = 'button'
  startButton.dataset.role = 'start-match'
  startButton.className = 'btn-chunky bg-tangerine px-10 py-4 text-2xl text-ink'
  startButton.textContent = 'Começar'
  startButton.addEventListener('click', () => {
    play('tap')
    startTelephoneMatch()
  })

  const startHint = document.createElement('p')
  startHint.id = 'start-hint'
  startHint.dataset.role = 'start-hint'
  startHint.className = 'text-sm font-bold text-lilac'

  const waitingHost = document.createElement('p')
  waitingHost.dataset.role = 'waiting-host'
  waitingHost.className = 'animate-pulse font-display text-xl text-paper'

  const leaveButton = document.createElement('button')
  leaveButton.type = 'button'
  leaveButton.dataset.role = 'leave-room'
  leaveButton.className = 'text-sm font-bold text-lilac underline decoration-2 underline-offset-4 hover:text-paper'
  leaveButton.addEventListener('click', () => {
    play('tap')
    leaveRoom()
    gameState.patch({ screen: 'inicio' })
  })

  footer.append(startButton, startHint, waitingHost, leaveButton)
  container.append(heading, tagline, codeCard, count, seats, footer)
  root.append(container)

  function renderSeats(players: readonly LobbyPlayer[], selfId: string): void {
    const key = players.map((player) => player.id).join('|')
    if (key === seatsKey) return
    seatsKey = key
    const newcomers: HTMLElement[] = []
    const filled = players.map((player, index) => {
      const seat = createSeat(player, index, player.id === selfId)
      if (seatedIds.size > 0 && !seatedIds.has(player.id)) newcomers.push(seat)
      return seat
    })
    const empty = Array.from({ length: TELEPHONE_MAX_PLAYERS - players.length }, createEmptySeat)
    seats.replaceChildren(...filled, ...empty)
    seatedIds = new Set(players.map((player) => player.id))
    if (newcomers.length === 0) return
    play('pop')
    if (animated) gsap.from(newcomers, { scale: 0.5, opacity: 0, duration: 0.6, ease: 'elastic.out(1.1, 0.5)', stagger: 0.08 })
  }

  function render(state: GameState): void {
    const { lobby, room } = state
    if (!lobby) return
    if (room) codeDisplay.show(room.code)
    count.textContent = `${lobby.players.length}/${TELEPHONE_MAX_PLAYERS} jogadores`
    renderSeats(lobby.players, lobby.selfId)

    const isHost = lobby.selfId === lobby.hostId
    const hostNickname = lobby.players.find((player) => player.isHost)?.nickname ?? 'o host'
    const missing = missingPlayers(lobby.players)
    startButton.hidden = !isHost
    startButton.disabled = !canStart(lobby.players)
    startHint.hidden = !isHost || missing === 0
    startHint.textContent = missing > 0 ? missingPlayersHint(missing) : ''
    if (startHint.hidden) startButton.removeAttribute('aria-describedby')
    else startButton.setAttribute('aria-describedby', startHint.id)
    waitingHost.hidden = isHost
    waitingHost.textContent = `Esperando ${hostNickname} começar…`
    leaveButton.textContent = isHost ? 'Encerrar sala' : 'Sair da sala'
  }

  render(gameState.get())
  const unsubscribe = gameState.onChange(render)

  if (animated) gsap.from([heading, tagline, codeCard, count], { y: 24, opacity: 0, duration: 0.45, stagger: 0.07, ease: 'back.out(1.6)' })

  teardown = () => {
    unsubscribe()
    codeDisplay.destroy()
  }
}

function unmount(): void {
  teardown?.()
  teardown = null
  container?.remove()
  container = null
}

const sala: ScreenModule = { mount, unmount }

export default sala
