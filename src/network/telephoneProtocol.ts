import type { Chain, CodeSubmission, PlayerProfile, StepKind } from '../types/game'

export type StepContent = CodeSubmission | string

export function stepKind(step: number, playerCount: number): StepKind {
  if (playerCount % 2 === 1) return step % 2 === 0 ? 'code' : 'explain'
  if (step === 0) return 'describe'
  return step % 2 === 0 ? 'explain' : 'code'
}

export function chainForSeat(seat: number, step: number, playerCount: number): number {
  return (((seat - step) % playerCount) + playerCount) % playerCount
}

export function seatForChain(chain: number, step: number, playerCount: number): number {
  return (chain + step) % playerCount
}

function profileOf(player: PlayerProfile): PlayerProfile {
  return { nickname: player.nickname, avatarId: player.avatarId }
}

export function createChains(players: readonly PlayerProfile[]): Chain[] {
  return players.map((player) => ({ owner: profileOf(player), entries: [] }))
}

export function stepInput(chains: readonly Chain[], seat: number, step: number): StepContent | null {
  if (step === 0) return null
  const chain = chains[chainForSeat(seat, step, chains.length)]
  return chain?.entries[chain.entries.length - 1]?.content ?? null
}

export function appendStep(
  chains: readonly Chain[],
  answersBySeat: ReadonlyMap<number, StepContent>,
  step: number,
  players: readonly PlayerProfile[],
): Chain[] {
  const kind = stepKind(step, chains.length)
  return chains.map((chain, index) => {
    const seat = seatForChain(index, step, chains.length)
    const content = answersBySeat.get(seat)
    if (content === undefined) return chain
    return { ...chain, entries: [...chain.entries, { author: profileOf(players[seat]), kind, content }] }
  })
}
