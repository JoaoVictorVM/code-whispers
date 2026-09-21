export interface ScreenModule {
  mount(root: HTMLElement): void
  unmount(): void
}

export function createPlaceholderScreen(id: string, title: string): ScreenModule {
  let container: HTMLElement | null = null

  return {
    mount(root) {
      container = document.createElement('section')
      container.dataset.screen = id
      container.className = 'container flex flex-col gap-4 py-8'

      const heading = document.createElement('h1')
      heading.className = 'text-3xl font-bold'
      heading.textContent = title

      container.append(heading)
      root.append(container)
    },
    unmount() {
      container?.remove()
      container = null
    },
  }
}
