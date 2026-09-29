import { describe, expect, it, vi } from 'vitest'
import { createReadyButton } from './readyButton'

function render(overrides: Partial<Parameters<typeof createReadyButton>[0]> = {}) {
  const onToggle = vi.fn()
  const node = createReadyButton({
    localReady: false,
    opponentReady: false,
    opponentNickname: 'Ana',
    onToggle,
    ...overrides,
  })
  const button = node.querySelector<HTMLButtonElement>('[data-role="ready-toggle"]')!
  return { node, button, onToggle }
}

describe('readyButton', () => {
  it('test_idle_state_renders_pronto_label', () => {
    const { node, button } = render()
    expect(button.textContent).toBe('Pronto')
    expect(node.querySelector('[data-role="waiting-label"]')).toBeNull()
    expect(node.querySelector('[data-role="opponent-ready-badge"]')).toBeNull()
  })

  it('test_local_ready_renders_cancelar_and_waiting_label', () => {
    const { node, button } = render({ localReady: true })
    expect(button.textContent).toBe('Cancelar')
    expect(node.querySelector('[data-role="waiting-label"]')?.textContent).toBe('Aguardando Ana…')
  })

  it('test_opponent_ready_first_renders_badge', () => {
    const { node, button } = render({ opponentReady: true })
    const badge = node.querySelector('[data-role="opponent-ready-badge"]')
    expect(badge?.textContent).toBe('Ana está pronto')
    expect(badge!.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(button.textContent).toBe('Pronto')
  })

  it('test_click_invokes_onToggle', () => {
    const { button, onToggle } = render()
    button.click()
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('disables the button and shows the reason when requested', () => {
    const { node, button, onToggle } = render({ disabled: true, disabledReason: 'Mínimo de 3 linhas' })
    expect(button.disabled).toBe(true)
    expect(node.querySelector('[data-role="disabled-reason"]')?.textContent).toBe('Mínimo de 3 linhas')
    button.click()
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('keeps Cancelar clickable even when the content became invalid', () => {
    const { button } = render({ localReady: true, disabled: true, disabledReason: 'x' })
    expect(button.disabled).toBe(false)
  })

  it('uses a custom waiting text when one is given', () => {
    const { node } = render({ localReady: true, waitingText: 'Esperando 2 jogadores…' })
    expect(node.querySelector('[data-role="waiting-label"]')?.textContent).toBe('Esperando 2 jogadores…')
  })
})
