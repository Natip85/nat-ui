import {describe, expect, test} from 'vitest'
import {resolveBundledPackage} from './resolve-bundled-package'

describe('resolveBundledPackage', () => {
  test('resolves an unscoped package nested in the pnpm store', () => {
    const path = '/repo/node_modules/.pnpm/zod@4.4.3/node_modules/zod/index.js'

    expect(resolveBundledPackage(path)).toEqual({
      name: 'zod',
      directory: '/repo/node_modules/.pnpm/zod@4.4.3/node_modules/zod',
    })
  })

  test('resolves a scoped package nested in the pnpm store', () => {
    const path =
      '/repo/node_modules/.pnpm/@clack+prompts@1.7.0/node_modules/@clack/prompts/dist/index.mjs'

    expect(resolveBundledPackage(path)).toEqual({
      name: '@clack/prompts',
      directory: '/repo/node_modules/.pnpm/@clack+prompts@1.7.0/node_modules/@clack/prompts',
    })
  })

  test('maps a nested node_modules/<pkg>/node_modules/<dep> path to the inner dependency, not the outer package', () => {
    const path =
      '/repo/node_modules/.pnpm/outer@1.0.0/node_modules/outer/node_modules/inner/index.js'

    expect(resolveBundledPackage(path)).toEqual({
      name: 'inner',
      directory: '/repo/node_modules/.pnpm/outer@1.0.0/node_modules/outer/node_modules/inner',
    })
  })

  test('maps a nested scoped dependency to the inner package, not the outer one', () => {
    const path =
      '/repo/node_modules/.pnpm/outer@1.0.0/node_modules/outer/node_modules/@scope/inner/index.js'

    expect(resolveBundledPackage(path)).toEqual({
      name: '@scope/inner',
      directory:
        '/repo/node_modules/.pnpm/outer@1.0.0/node_modules/outer/node_modules/@scope/inner',
    })
  })

  test('returns undefined for a path with no node_modules segment', () => {
    expect(resolveBundledPackage('/repo/src/index.ts')).toBeUndefined()
  })

  test('returns undefined for a malformed scoped segment with no package name after it', () => {
    expect(resolveBundledPackage('/repo/node_modules/@scope')).toBeUndefined()
  })
})
