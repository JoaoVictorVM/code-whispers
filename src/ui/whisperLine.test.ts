import { describe, expect, it } from 'vitest'
import { createWhisperLine } from './whisperLine'

describe('whisperLine', () => {
  it('draws two cans joined by a string', () => {
    const line = createWhisperLine({ local: { nickname: 'Ana', avatarId: 3 }, remote: null })
    document.body.append(line.element)
    expect(line.element.querySelector('[data-can="local"]')).not.toBeNull()
    expect(line.element.querySelector('[data-can="remote"]')).not.toBeNull()
    expect(line.element.querySelector('path[id$="-string"]')?.getAttribute('d')).toMatch(/^M /)
    expect(line.element.querySelector('[data-can="local"] image')?.getAttribute('href')).toBe('./avatars/avatar-03.png')
    line.destroy()
  })

  it('shows a question mark until the opponent is known', () => {
    const line = createWhisperLine({ local: null, remote: null })
    const mystery = () => line.element.querySelector<SVGTextElement>('[data-can="remote"] text')!
    expect(mystery().style.display).toBe('')
    line.setRemote({ nickname: 'Bia', avatarId: 7 })
    expect(mystery().style.display).toBe('none')
    expect(line.element.querySelector('[data-can="remote"] image')?.getAttribute('href')).toBe('./avatars/avatar-07.png')
    line.setRemote(null)
    expect(mystery().style.display).toBe('')
    line.destroy()
  })

  it('shows and hides the waiting bubble and survives pulses without layout', () => {
    const line = createWhisperLine({ local: null, remote: null, compact: true })
    document.body.append(line.element)
    expect(() => line.pulse('local')).not.toThrow()
    expect(() => line.setWaiting('remote', true)).not.toThrow()
    expect(() => line.setWaiting('remote', false)).not.toThrow()
    line.destroy()
    expect(document.body.contains(line.element)).toBe(false)
  })
})
