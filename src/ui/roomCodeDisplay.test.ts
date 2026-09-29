import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('trystero/nostr', () => ({ joinRoom: vi.fn(), getRelaySockets: vi.fn(() => ({})), selfId: 'self-peer' }))

const { COPIED_FEEDBACK_MS, createRoomCodeDisplay } = await import('./roomCodeDisplay')

function mockClipboard(writeText: ReturnType<typeof vi.fn>): void {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

function query<T extends HTMLElement>(root: HTMLElement, role: string): T {
  return root.querySelector<T>(`[data-role="${role}"]`)!
}

describe('room code display', () => {
  let display: ReturnType<typeof createRoomCodeDisplay>

  beforeEach(() => {
    vi.useFakeTimers()
    display = createRoomCodeDisplay()
    document.body.append(display.element)
  })

  afterEach(() => {
    display.destroy()
    vi.useRealTimers()
  })

  it('renders one tile per code character', () => {
    display.show('AB3XYZ')
    const tiles = query(display.element, 'room-code').children
    expect(tiles).toHaveLength(6)
    expect(query(display.element, 'room-code').textContent).toBe('AB3XYZ')
  })

  it('shows copied feedback and restores the label', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockClipboard(writeText)
    display.show('AB3XYZ')
    query<HTMLButtonElement>(display.element, 'copy-code').click()
    await vi.waitFor(() => expect(query(display.element, 'copy-code').textContent).toBe('Copiado!'))
    expect(writeText).toHaveBeenCalledWith('AB3XYZ')
    vi.advanceTimersByTime(COPIED_FEEDBACK_MS)
    expect(query(display.element, 'copy-code').textContent).toBe('Copiar')
  })

  it('selects the code and explains when copying fails', async () => {
    mockClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    display.show('AB3XYZ')
    query<HTMLButtonElement>(display.element, 'copy-code').click()
    await vi.waitFor(() => expect(query(display.element, 'copy-error').hidden).toBe(false))
    expect(query(display.element, 'copy-error').textContent).toBe(
      'Não foi possível copiar — selecione o código manualmente.',
    )
    expect(window.getSelection()?.toString()).toBe('AB3XYZ')
  })

  it('reset clears the feedback so the same code can be shown again', async () => {
    mockClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    display.show('AB3XYZ')
    query<HTMLButtonElement>(display.element, 'copy-code').click()
    await vi.waitFor(() => expect(query(display.element, 'copy-error').hidden).toBe(false))
    display.reset()
    expect(query(display.element, 'copy-error').hidden).toBe(true)
    display.show('AB3XYZ')
    expect(query(display.element, 'room-code').textContent).toBe('AB3XYZ')
  })
})
