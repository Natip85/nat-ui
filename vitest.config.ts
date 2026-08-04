import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'

export default defineConfig({
  // Vite does not read tsconfig `paths`, so the alias the registry's components
  // are authored against has to be repeated here for tests to resolve it.
  // Rollup's alias matching requires the importee to equal `@` or begin with
  // `@/`, so this does not capture scoped packages like `@base-ui/react`.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./packages/registry/src', import.meta.url)),
    },
  },
  test: {
    // The CLI's tests scaffold throwaway projects on disk, so give them room.
    testTimeout: 30_000,
    exclude: ['**/node_modules/**', '**/dist/**', '**/.pnpm-store/**', '**/.next/**'],
  },
})
