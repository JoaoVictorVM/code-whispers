import { afterEach, describe, expect, it } from 'vitest'
import { isMuted, setMuted } from '../audio/sfx'
import { createSoundToggle } from './soundToggle'

describe('soundToggle', () => {
  afterEach(() => setMuted(false))

  it('toggles mute and reflects it in its label', () => {
    setMuted(false)
    const toggle = createSoundToggle()
    document.body.append(toggle.element)
    expect(toggle.element.getAttribute('aria-pressed')).toBe('false')
    expect(toggle.element.getAttribute('aria-label')).toBe('Desativar sons')
    toggle.element.click()
    expect(isMuted()).toBe(true)
    expect(toggle.element.getAttribute('aria-pressed')).toBe('true')
    expect(toggle.element.getAttribute('aria-label')).toBe('Ativar sons')
    toggle.destroy()
    expect(document.body.contains(toggle.element)).toBe(false)
  })
})
