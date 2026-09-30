import { play } from '../audio/sfx'
import { returnToLobby } from '../network/room'
import { advanceReveal } from '../network/telephone'
import { isRevealFinished, revealButtonLabel } from '../network/telephoneProtocol'
import { gameState } from '../state/gameState'
import type { GameState } from '../types/game'
import { createChainEntryCard, type ChainEntryCard } from '../ui/chainEntryCard'
import { createChainTabs, type ChainTabs } from '../ui/chainTabs'
import { celebrate } from '../ui/confetti'
import { canAnimate } from '../ui/motion'
import type { ScreenModule } from './screen'

let container: HTMLElement | null = null
let teardown: (() => void) | null = null

function mount(root: HTMLElement): void {
  const animated = canAnimate()
  let cards: ChainEntryCard[] = []
  let shownChain = -1
  let viewedChain: number | null = null
  let celebrated = false
  let tabs: ChainTabs | null = null

  container = document.createElement('section')
  container.dataset.screen = 'revelacao'
  container.className = 'container flex flex-col gap-5 pt-20 pb-8 sm:pt-6'

  const header = document.createElement('header')
  header.className = 'flex flex-col items-center gap-2 text-center sm:pr-16 sm:pl-16'
  const title = document.createElement('h1')
  title.dataset.role = 'chain-title'
  title.className = 'display-title text-3xl sm:text-4xl'
  title.textContent = 'Revelação'
  const position = document.createElement('p')
  position.dataset.role = 'chain-position'
  position.className = 'rounded-full border-[3px] border-ink bg-sunflower px-4 py-0.5 font-display text-base text-ink'
  header.append(title, position)

  const tabsSlot = document.createElement('div')
  tabsSlot.dataset.role = 'tabs-slot'

  const entries = document.createElement('ol')
  entries.dataset.role = 'chain-entries'
  entries.className = 'mx-auto flex w-full max-w-3xl flex-col gap-5'

  const footer = document.createElement('div')
  footer.className = 'flex flex-col items-center gap-2'
  const nextButton = document.createElement('button')
  nextButton.type = 'button'
  nextButton.dataset.role = 'reveal-next'
  nextButton.className = 'btn-chunky bg-tangerine px-10 py-3 text-2xl text-ink'
  nextButton.addEventListener('click', () => {
    const { telephone } = gameState.get()
    if (!telephone?.chains) return
    play('tap')
    if (isRevealFinished(telephone.revealCursor, telephone.chains.length)) returnToLobby()
    else advanceReveal()
  })
  const conductor = document.createElement('p')
  conductor.dataset.role = 'reveal-conductor'
  conductor.className = 'animate-pulse text-center font-display text-lg text-lilac'
  footer.append(nextButton, conductor)

  container.append(header, tabsSlot, entries, footer)
  root.append(container)

  function clearCards(): void {
    cards.forEach((card) => card.destroy())
    cards = []
  }

  function showEntries(state: GameState, chainIndex: number, visible: number): void {
    const chain = state.telephone?.chains?.[chainIndex]
    if (!chain) return
    if (chainIndex !== shownChain) {
      clearCards()
      shownChain = chainIndex
    }
    const newcomers = chain.entries.slice(cards.length, visible)
    for (const entry of newcomers) {
      const card = createChainEntryCard(entry, cards.length, true)
      cards.push(card)
      entries.append(card.element)
    }
    if (newcomers.length === 0) return
    play('pop')
    cards[cards.length - 1].element.scrollIntoView?.({ behavior: animated ? 'smooth' : 'auto', block: 'nearest' })
  }

  function render(state: GameState): void {
    const { telephone, lobby } = state
    if (!telephone?.chains || !lobby) return
    const total = telephone.chains.length
    const cursor = telephone.revealCursor
    const finished = isRevealFinished(cursor, total)
    const chainIndex = finished && viewedChain !== null ? viewedChain : cursor.chain
    const visible = chainIndex === cursor.chain && !finished ? cursor.entry + 1 : total

    title.textContent = `Cadeia de ${telephone.chains[chainIndex].owner.nickname}`
    position.textContent = `${chainIndex + 1} de ${total}`
    showEntries(state, chainIndex, visible)

    const isHost = lobby.selfId === lobby.hostId
    const hostNickname = lobby.players.find((player) => player.isHost)?.nickname ?? 'O host'
    nextButton.hidden = !isHost
    nextButton.textContent = revealButtonLabel(cursor, total)
    conductor.hidden = isHost
    conductor.textContent = finished ? `Esperando ${hostNickname} voltar para a sala…` : `${hostNickname} está conduzindo a revelação`

    if (finished && !tabs) {
      tabs = createChainTabs({
        chains: telephone.chains,
        selected: chainIndex,
        onSelect: (index) => {
          viewedChain = index
          tabs?.setSelected(index)
          play('select')
          render(gameState.get())
        },
      })
      tabsSlot.append(tabs.element)
    }
    if (finished && !celebrated) {
      celebrated = true
      celebrate()
    }
  }

  render(gameState.get())
  const unsubscribe = gameState.onChange(render)

  teardown = () => {
    unsubscribe()
    clearCards()
    tabs?.destroy()
    tabs = null
  }
}

function unmount(): void {
  teardown?.()
  teardown = null
  container?.remove()
  container = null
}

const revelacao: ScreenModule = { mount, unmount }

export default revelacao
