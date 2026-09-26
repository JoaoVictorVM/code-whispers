import { defineConfig } from 'vitest/config'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [tailwindcss()],
  resolve: {
    dedupe: ['@lezer/highlight', '@codemirror/state', '@codemirror/view', '@codemirror/language'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
})
