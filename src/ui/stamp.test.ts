import { describe, expect, it } from 'vitest'
import { createStamp, slamStamp } from './stamp'

describe('stamp', () => {
  it('creates a decorative stamp with the given text and tone', () => {
    const stamp = createStamp('CORRETO', 'mint')
    expect(stamp.textContent).toBe('CORRETO')
    expect(stamp.getAttribute('aria-hidden')).toBe('true')
    expect(stamp.className).toContain('text-mint')
    expect(() => slamStamp(stamp, document.body)).not.toThrow()
  })
})
