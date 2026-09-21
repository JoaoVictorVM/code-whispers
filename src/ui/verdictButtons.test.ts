import { describe, expect, it, vi } from 'vitest'
import { createVerdictButtons } from './verdictButtons'

function buttonsOf(node: HTMLElement) {
  return Array.from(node.querySelectorAll<HTMLButtonElement>('button'))
}

describe('verdictButtons', () => {
  it('test_renders_three_options', () => {
    const node = createVerdictButtons({ selected: null, onSelect: vi.fn() })
    const buttons = buttonsOf(node)
    expect(buttons).toHaveLength(3)
    expect(buttons.map((b) => b.textContent)).toEqual(['Errou', 'Meio Certo', 'Correto'])
    expect(buttons.every((b) => !b.disabled)).toBe(true)
  })

  it('test_select_calls_onSelect_with_correct_value', () => {
    const onSelect = vi.fn()
    const node = createVerdictButtons({ selected: null, onSelect })
    node.querySelector<HTMLButtonElement>('[data-verdict="correct"]')!.click()
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('correct')
  })

  it('test_selected_option_is_highlighted_and_others_disabled', () => {
    const node = createVerdictButtons({ selected: 'half', onSelect: vi.fn() })
    const [wrong, half, correct] = buttonsOf(node)
    expect(half.classList.contains('selected')).toBe(true)
    expect(half.disabled).toBe(false)
    expect(half.getAttribute('aria-pressed')).toBe('true')
    expect(wrong.disabled).toBe(true)
    expect(correct.disabled).toBe(true)
    expect(wrong.classList.contains('selected')).toBe(false)
    expect(correct.classList.contains('selected')).toBe(false)
  })
})
