import { describe, expect, it, vi } from 'vitest'
import { createDisconnectModal } from './disconnectModal'

describe('disconnectModal', () => {
  it('test_renders_opponent_nickname_in_message', () => {
    const modal = createDisconnectModal({ opponentNickname: 'Ana', onConfirm: vi.fn() })
    expect(modal.textContent).toContain('Ana desconectou. A partida foi encerrada.')
    expect(modal.querySelector('[role="alertdialog"]')).not.toBeNull()
    expect(modal.querySelectorAll('button')).toHaveLength(1)
  })

  it('uses a custom message when one is given', () => {
    const modal = createDisconnectModal({ opponentNickname: 'João', onConfirm: vi.fn(), message: 'João encerrou a sala.' })
    expect(modal.querySelector('#disconnect-message')?.textContent).toBe('João encerrou a sala.')
  })

  it('test_confirm_button_invokes_callback', () => {
    const onConfirm = vi.fn()
    const modal = createDisconnectModal({ opponentNickname: 'Ana', onConfirm })
    const button = modal.querySelector('button')!
    expect(button.textContent).toBe('Voltar ao início')
    button.click()
    button.click()
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
