import {defineConfig} from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': new URL('./packages/registry/src', import.meta.url).pathname,
    },
  },
  test: {
    // The CLI's tests scaffold throwaway projects on disk, so give them room.
    testTimeout: 30_000,
    exclude: ['**/node_modules/**', '**/dist/**', '**/.pnpm-store/**', '**/.next/**'],
  },
})
