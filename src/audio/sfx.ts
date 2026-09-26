export type SoundName =
  | 'tap'
  | 'pop'
  | 'select'
  | 'stamp'
  | 'pulse'
  | 'whoosh'
  | 'success'
  | 'error'
  | 'fanfare'

export const MUTE_STORAGE_KEY = 'cw.muted'

type Listener = (muted: boolean) => void

let context: AudioContext | null = null
let master: GainNode | null = null
let muted = readStoredMute()
const listeners = new Set<Listener>()

function readStoredMute(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return null
  if (!context) {
    context = new window.AudioContext()
    master = context.createGain()
    master.gain.value = 0.35
    master.connect(context.destination)
  }
  if (context.state === 'suspended') void context.resume()
  return { ctx: context, out: master! }
}

function tone(
  ctx: AudioContext,
  out: AudioNode,
  options: { type: OscillatorType; from: number; to?: number; start?: number; duration: number; volume?: number },
): void {
  const { type, from, to = from, start = 0, duration, volume = 0.6 } = options
  const at = ctx.currentTime + start
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(from, at)
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), at + duration)
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  osc.connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + duration + 0.02)
}

function noise(ctx: AudioContext, out: AudioNode, duration: number, volume: number, cutoff: number): void {
  const length = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2
  const source = ctx.createBufferSource()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  source.buffer = buffer
  filter.type = 'lowpass'
  filter.frequency.value = cutoff
  gain.gain.value = volume
  source.connect(filter).connect(gain).connect(out)
  source.start()
}

const recipes: Record<SoundName, (ctx: AudioContext, out: AudioNode) => void> = {
  tap: (ctx, out) => tone(ctx, out, { type: 'triangle', from: 520, to: 380, duration: 0.07, volume: 0.35 }),
  pop: (ctx, out) => tone(ctx, out, { type: 'sine', from: 380, to: 900, duration: 0.09, volume: 0.45 }),
  select: (ctx, out) => {
    tone(ctx, out, { type: 'square', from: 660, duration: 0.06, volume: 0.18 })
    tone(ctx, out, { type: 'square', from: 990, start: 0.06, duration: 0.08, volume: 0.18 })
  },
  stamp: (ctx, out) => {
    noise(ctx, out, 0.18, 0.9, 900)
    tone(ctx, out, { type: 'sine', from: 160, to: 55, duration: 0.22, volume: 0.8 })
  },
  pulse: (ctx, out) => {
    tone(ctx, out, { type: 'sine', from: 300, to: 1200, duration: 0.35, volume: 0.3 })
    tone(ctx, out, { type: 'triangle', from: 600, to: 2400, start: 0.05, duration: 0.3, volume: 0.12 })
  },
  whoosh: (ctx, out) => noise(ctx, out, 0.35, 0.5, 2400),
  success: (ctx, out) =>
    [523.25, 659.25, 783.99].forEach((frequency, index) =>
      tone(ctx, out, { type: 'triangle', from: frequency, start: index * 0.07, duration: 0.22, volume: 0.35 }),
    ),
  error: (ctx, out) => {
    tone(ctx, out, { type: 'sawtooth', from: 220, to: 140, duration: 0.18, volume: 0.25 })
    tone(ctx, out, { type: 'sawtooth', from: 180, to: 110, start: 0.12, duration: 0.2, volume: 0.25 })
  },
  fanfare: (ctx, out) =>
    [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((frequency, index) =>
      tone(ctx, out, {
        type: index % 2 === 0 ? 'triangle' : 'square',
        from: frequency,
        start: index * 0.09,
        duration: index === 5 ? 0.5 : 0.16,
        volume: index % 2 === 0 ? 0.35 : 0.14,
      }),
    ),
}

export function play(name: SoundName): void {
  if (muted) return
  try {
    const output = audio()
    if (output) recipes[name](output.ctx, output.out)
  } catch {
    return
  }
}

export function isMuted(): boolean {
  return muted
}

export function setMuted(value: boolean): void {
  muted = value
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, value ? '1' : '0')
  } catch {
    return
  } finally {
    for (const listener of listeners) listener(muted)
  }
}

export function toggleMuted(): boolean {
  setMuted(!muted)
  return muted
}

export function onMuteChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
