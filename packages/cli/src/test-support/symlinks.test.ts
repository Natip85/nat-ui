import {afterEach, describe, expect, test, vi} from 'vitest'

// `symlinksSupported` is computed by a top-level await, so exercising the probe
// means re-importing the module fresh under a mocked `node:fs/promises` each
// time rather than calling an exported function directly.
describe('symlinksSupported probe', () => {
  afterEach(() => {
    vi.doUnmock('node:fs/promises')
    vi.resetModules()
  })

  // This exercises the real platform's behavior, so it only makes sense to run
  // where the platform actually is POSIX — on Windows the same failure is
  // expected to resolve to `false` instead (see the test below).
  test.skipIf(process.platform === 'win32')(
    'propagates an unexpected failure on POSIX instead of silently reporting unsupported',
    async () => {
      vi.doMock('node:fs/promises', async () => {
        const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')

        return {...actual, symlink: () => Promise.reject(new Error('EACCES: permission denied'))}
      })

      await expect(import('./symlinks')).rejects.toThrow('EACCES')
    },
  )

  test('reports unsupported on Windows without throwing', async () => {
    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')

      return {
        ...actual,
        symlink: () => Promise.reject(new Error('EPERM: operation not permitted')),
      }
    })
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', {value: 'win32'})

    try {
      const {symlinksSupported} = await import('./symlinks')

      expect(symlinksSupported).toBe(false)
    } finally {
      Object.defineProperty(process, 'platform', {value: originalPlatform})
    }
  })
})
