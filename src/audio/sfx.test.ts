import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MUTE_STORAGE_KEY, isMuted, onMuteChange, play, setMuted, toggleMuted } from './sfx'

describe('sfx', () => {
  beforeEach(() => {
    localStorage.clear()
    setMuted(false)
  })

  it('plays without throwing when the browser has no audio support', () => {
    expect(() => play('stamp')).not.toThrow()
    expect(() => play('fanfare')).not.toThrow()
  })

  it('persists the mute preference and notifies listeners', () => {
    const listener = vi.fn()
    const unsubscribe = onMuteChange(listener)
    expect(toggleMuted()).toBe(true)
    expect(isMuted()).toBe(true)
    expect(localStorage.getItem(MUTE_STORAGE_KEY)).toBe('1')
    expect(listener).toHaveBeenCalledWith(true)
    unsubscribe()
    toggleMuted()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(MUTE_STORAGE_KEY)).toBe('0')
  })

  it('synthesizes sounds through the audio context when available', () => {
    const oscillator = { type: '', frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }
    const gainNode = () => ({ gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn((node) => node) })
    oscillator.connect.mockImplementation((node) => node)
    class FakeAudioContext {
      currentTime = 0
      sampleRate = 8000
      state = 'running'
      destination = {}
      createOscillator = vi.fn(() => oscillator)
      createGain = vi.fn(gainNode)
      createBuffer = vi.fn(() => ({ getChannelData: () => new Float32Array(8000) }))
      createBufferSource = vi.fn(() => ({ buffer: null, connect: vi.fn((node) => node), start: vi.fn() }))
      createBiquadFilter = vi.fn(() => ({ type: '', frequency: { value: 0 }, connect: vi.fn((node) => node) }))
      resume = vi.fn()
    }
    vi.stubGlobal('AudioContext', FakeAudioContext)
    play('success')
    expect(oscillator.start).toHaveBeenCalled()
    setMuted(true)
    oscillator.start.mockClear()
    play('success')
    expect(oscillator.start).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
