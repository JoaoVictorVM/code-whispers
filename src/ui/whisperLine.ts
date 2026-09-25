import { play } from '../audio/sfx'
import type { PlayerProfile } from '../types/game'
import { avatarSrc } from './avatarPicker'
import { canAnimate, gsap } from './motion'

export type LineSide = 'local' | 'remote'

export interface WhisperLineOptions {
  local: PlayerProfile | null
  remote: PlayerProfile | null
  compact?: boolean
}

export interface WhisperLine {
  element: HTMLElement
  setLocal(profile: PlayerProfile | null): void
  setRemote(profile: PlayerProfile | null): void
  setWaiting(side: LineSide, waiting: boolean): void
  pulse(from: LineSide): void
  destroy(): void
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const WIDTH = 1000
const HEIGHT = 240
const MID_Y = 120
const LEFT_MOUTH = 238
const RIGHT_MOUTH = WIDTH - LEFT_MOUTH
const REST_SAG = 34
const GLYPHS = ['{', '}', '=>', ';', '()', '[]', '</>', 'if', '&&', '++', '#', 'fn']

let instanceCount = 0

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value))
  return node
}

function createCan(side: LineSide, color: string, clipId: string): { group: SVGGElement; image: SVGImageElement; mystery: SVGTextElement; bubble: SVGGElement } {
  const facing = side === 'local' ? 1 : -1
  const back = side === 'local' ? 58 : WIDTH - 58
  const mouth = side === 'local' ? LEFT_MOUTH - 16 : RIGHT_MOUTH + 16
  const center = (back + mouth) / 2
  const left = Math.min(back, mouth)
  const width = Math.abs(mouth - back)

  const group = svg('g', { 'data-can': side, class: 'cursor-pointer' })
  group.style.transformBox = 'fill-box'
  group.style.transformOrigin = side === 'local' ? '30% 50%' : '70% 50%'

  group.append(
    svg('ellipse', { cx: back, cy: MID_Y, rx: 14, ry: 62, fill: color, stroke: 'var(--color-ink)', 'stroke-width': 5 }),
    svg('rect', { x: left, y: MID_Y - 62, width, height: 124, fill: color, stroke: 'var(--color-ink)', 'stroke-width': 5 }),
    svg('rect', { x: left + 3, y: MID_Y - 44, width: width - 6, height: 10, fill: 'white', opacity: 0.35 }),
  )
  for (const offset of [0.22, 0.78]) {
    const x = back + (mouth - back) * offset
    group.append(
      svg('path', {
        d: `M ${x} ${MID_Y - 60} Q ${x + 8 * facing} ${MID_Y} ${x} ${MID_Y + 60}`,
        fill: 'none',
        stroke: 'var(--color-ink)',
        'stroke-width': 3,
        opacity: 0.45,
      }),
    )
  }
  group.append(
    svg('ellipse', { cx: mouth, cy: MID_Y, rx: 18, ry: 62, fill: 'var(--color-paper-shade)', stroke: 'var(--color-ink)', 'stroke-width': 5 }),
    svg('ellipse', { cx: mouth + 2 * facing, cy: MID_Y, rx: 9, ry: 46, fill: 'var(--color-ink)', opacity: 0.85 }),
  )

  const clip = svg('clipPath', { id: clipId })
  clip.append(svg('circle', { cx: center, cy: MID_Y, r: 38 }))
  group.append(
    clip,
    svg('circle', { cx: center, cy: MID_Y, r: 44, fill: 'var(--color-paper)', stroke: 'var(--color-ink)', 'stroke-width': 4 }),
  )
  const image = svg('image', {
    x: center - 38,
    y: MID_Y - 38,
    width: 76,
    height: 76,
    'clip-path': `url(#${clipId})`,
    preserveAspectRatio: 'xMidYMid slice',
  })
  const mystery = svg('text', {
    x: center,
    y: MID_Y + 16,
    'text-anchor': 'middle',
    'font-family': 'var(--font-display)',
    'font-size': 46,
    fill: 'var(--color-ink)',
  })
  mystery.textContent = '?'
  group.append(image, mystery)

  const bubbleX = side === 'local' ? center + 28 : center - 118
  const bubble = svg('g', { 'data-bubble': side, opacity: 0 })
  bubble.append(
    svg('rect', { x: bubbleX, y: 4, width: 90, height: 40, rx: 16, fill: 'var(--color-paper)', stroke: 'var(--color-ink)', 'stroke-width': 4 }),
  )
  for (let i = 0; i < 3; i++) {
    bubble.append(svg('circle', { cx: bubbleX + 27 + i * 18, cy: 24, r: 5, fill: 'var(--color-ink)', 'data-dot': i }))
  }
  group.append(bubble)

  return { group, image, mystery, bubble }
}

export function createWhisperLine(options: WhisperLineOptions): WhisperLine {
  instanceCount += 1
  const id = `whisper-${instanceCount}`
  const animated = canAnimate()

  const wrapper = document.createElement('div')
  wrapper.dataset.component = 'whisper-line'
  wrapper.className = options.compact ? 'w-full max-w-3xl select-none' : 'w-full max-w-4xl select-none'

  const root = svg('svg', {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    class: 'block h-auto w-full overflow-visible',
    role: 'img',
  })
  root.setAttribute('aria-label', 'Dois telefones de lata ligados por um barbante')

  const string = svg('path', {
    id: `${id}-string`,
    fill: 'none',
    stroke: 'var(--color-paper)',
    'stroke-width': 5,
    'stroke-linecap': 'round',
    'stroke-dasharray': '2 9',
  })
  const stringShadow = svg('path', {
    fill: 'none',
    stroke: 'var(--color-ink)',
    'stroke-width': 9,
    'stroke-linecap': 'round',
    opacity: 0.55,
  })

  const glyphLayer = svg('g', { 'font-family': 'var(--font-mono)', 'font-weight': 700, 'font-size': 26 })
  const glyphs = GLYPHS.slice(0, options.compact ? 4 : 6).map((glyph, index) => {
    const text = svg('text', { fill: index % 2 === 0 ? 'var(--color-sunflower)' : 'var(--color-mint)', dy: -14 })
    const path = svg('textPath', { href: `#${id}-string`, startOffset: '0%' })
    path.textContent = glyph
    text.append(path)
    glyphLayer.append(text)
    return { text, path, progress: index / (options.compact ? 4 : 6), speed: 0.06 + (index % 3) * 0.015 }
  })

  const spark = svg('circle', { r: 12, fill: 'var(--color-sunflower)', stroke: 'var(--color-ink)', 'stroke-width': 4, opacity: 0 })

  const localCan = createCan('local', 'var(--color-sky)', `${id}-clip-local`)
  const remoteCan = createCan('remote', 'var(--color-bubblegum)', `${id}-clip-remote`)

  root.append(stringShadow, string, glyphLayer, spark, localCan.group, remoteCan.group)
  wrapper.append(root)

  const control = { x: WIDTH / 2, y: MID_Y + REST_SAG, vx: 0, vy: 0 }
  const target = { x: WIDTH / 2, y: MID_Y + REST_SAG }
  let pointerActive = false
  let frame = 0
  let lastTime = 0
  let elapsed = 0
  let destroyed = false
  const bubbleTweens = new Map<LineSide, gsap.core.Timeline>()

  function drawString(): void {
    const d = `M ${LEFT_MOUTH} ${MID_Y} Q ${control.x.toFixed(1)} ${control.y.toFixed(1)} ${RIGHT_MOUTH} ${MID_Y}`
    string.setAttribute('d', d)
    stringShadow.setAttribute('d', d)
  }

  function step(time: number): void {
    if (destroyed) return
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0.016
    lastTime = time
    elapsed += dt

    if (!pointerActive) {
      target.x = WIDTH / 2 + Math.sin(elapsed * 0.9) * 40
      target.y = MID_Y + REST_SAG + Math.sin(elapsed * 1.7) * 10
    }
    control.vx = (control.vx + (target.x - control.x) * 0.06) * 0.86
    control.vy = (control.vy + (target.y - control.y) * 0.06) * 0.86
    control.x += control.vx
    control.y += control.vy
    drawString()

    for (const glyph of glyphs) {
      glyph.progress = (glyph.progress + glyph.speed * dt) % 1
      glyph.path.setAttribute('startOffset', `${(glyph.progress * 100).toFixed(2)}%`)
      glyph.text.setAttribute('opacity', Math.sin(Math.PI * glyph.progress).toFixed(3))
    }
    frame = requestAnimationFrame(step)
  }

  function onPointerMove(event: PointerEvent): void {
    const box = root.getBoundingClientRect()
    if (box.width === 0) return
    const x = ((event.clientX - box.left) / box.width) * WIDTH
    const y = ((event.clientY - box.top) / box.height) * HEIGHT
    pointerActive = true
    target.x = Math.min(Math.max(x, LEFT_MOUTH + 60), RIGHT_MOUTH - 60)
    target.y = Math.min(Math.max(y + 20, MID_Y - 70), MID_Y + 110)
  }

  function onPointerLeave(): void {
    pointerActive = false
  }

  function wiggle(group: SVGGElement): void {
    play('pop')
    if (!animated) return
    gsap.fromTo(group, { rotation: -8 }, { rotation: 0, duration: 0.8, ease: 'elastic.out(1.2, 0.3)' })
  }

  function setProfile(can: ReturnType<typeof createCan>, profile: PlayerProfile | null): void {
    if (profile) {
      can.image.setAttribute('href', avatarSrc('./avatars', profile.avatarId))
      can.image.style.display = ''
      can.mystery.style.display = 'none'
    } else {
      can.image.removeAttribute('href')
      can.image.style.display = 'none'
      can.mystery.style.display = ''
    }
  }

  localCan.group.addEventListener('click', () => wiggle(localCan.group))
  remoteCan.group.addEventListener('click', () => wiggle(remoteCan.group))

  setProfile(localCan, options.local)
  setProfile(remoteCan, options.remote)
  drawString()

  if (animated) {
    root.addEventListener('pointermove', onPointerMove)
    root.addEventListener('pointerleave', onPointerLeave)
    frame = requestAnimationFrame(step)
    gsap.from([localCan.group, remoteCan.group], {
      y: 40,
      opacity: 0,
      duration: 0.7,
      ease: 'back.out(1.8)',
      stagger: 0.12,
    })
  } else {
    for (const glyph of glyphs) glyph.text.setAttribute('opacity', '0')
  }

  return {
    element: wrapper,
    setLocal: (profile) => setProfile(localCan, profile),
    setRemote: (profile) => setProfile(remoteCan, profile),
    setWaiting(side, waiting) {
      const can = side === 'local' ? localCan : remoteCan
      bubbleTweens.get(side)?.kill()
      bubbleTweens.delete(side)
      if (!animated) {
        can.bubble.setAttribute('opacity', waiting ? '1' : '0')
        return
      }
      if (!waiting) {
        gsap.to(can.bubble, { opacity: 0, duration: 0.2 })
        return
      }
      gsap.to(can.bubble, { opacity: 1, duration: 0.2 })
      const dots = can.bubble.querySelectorAll('[data-dot]')
      const timeline = gsap.timeline({ repeat: -1 })
      timeline.to(dots, { y: -6, duration: 0.25, ease: 'sine.out', stagger: 0.12, yoyo: true, repeat: 1 })
      bubbleTweens.set(side, timeline)
    },
    pulse(from) {
      play('pulse')
      if (!animated || typeof string.getTotalLength !== 'function') return
      const length = string.getTotalLength()
      const progress = { t: 0 }
      const receiver = from === 'local' ? remoteCan.group : localCan.group
      gsap.fromTo(
        progress,
        { t: 0 },
        {
          t: 1,
          duration: 0.6,
          ease: 'power2.inOut',
          onStart: () => spark.setAttribute('opacity', '1'),
          onUpdate: () => {
            const at = from === 'local' ? progress.t : 1 - progress.t
            const point = string.getPointAtLength(length * at)
            spark.setAttribute('cx', point.x.toFixed(1))
            spark.setAttribute('cy', point.y.toFixed(1))
          },
          onComplete: () => {
            spark.setAttribute('opacity', '0')
            gsap.fromTo(receiver, { scale: 1.12 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1.3, 0.35)' })
          },
        },
      )
      gsap.fromTo(string, { attr: { stroke: 'var(--color-sunflower)' } }, { attr: { stroke: 'var(--color-paper)' }, duration: 0.8, delay: 0.3 })
    },
    destroy() {
      destroyed = true
      cancelAnimationFrame(frame)
      for (const tween of bubbleTweens.values()) tween.kill()
      gsap.killTweensOf([localCan.group, remoteCan.group, string, spark])
      root.removeEventListener('pointermove', onPointerMove)
      root.removeEventListener('pointerleave', onPointerLeave)
      wrapper.remove()
    },
  }
}
