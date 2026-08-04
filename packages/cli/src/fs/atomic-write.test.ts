import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {symlinksSupported} from '../test-support/symlinks'
import {atomicWriteFile} from './atomic-write'

let dir: string
let externalDir: string | undefined

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nat-ui-atomic-'))
})

afterEach(async () => {
  await rm(dir, {recursive: true, force: true})
  if (externalDir !== undefined) {
    await rm(externalDir, {recursive: true, force: true})
    externalDir = undefined
  }
})

describe('atomicWriteFile', () => {
  test('creates a new file when none exists', async () => {
    const path = join(dir, 'fresh.txt')

    await atomicWriteFile(path, 'hello\n')

    expect(await readFile(path, 'utf8')).toBe('hello\n')
  })

  test('replaces the contents of an existing (longer) file rather than appending', async () => {
    const path = join(dir, 'existing.txt')
    await writeFile(path, 'old contents, much longer than the replacement text\n', 'utf8')

    await atomicWriteFile(path, 'new\n')

    expect(await readFile(path, 'utf8')).toBe('new\n')
  })

  // Windows has no POSIX permission bits to preserve.
  test.skipIf(process.platform === 'win32')(
    'preserves the permissions of the file it replaces',
    async () => {
      const path = join(dir, 'permissioned.txt')
      await writeFile(path, 'old\n', 'utf8')
      await chmod(path, 0o640)

      await atomicWriteFile(path, 'new\n')

      const info = await stat(path)
      expect(info.mode & 0o777).toBe(0o640)
    },
  )

  test('leaves no temp file behind after a successful write', async () => {
    const path = join(dir, 'clean.txt')
    await writeFile(path, 'old\n', 'utf8')

    await atomicWriteFile(path, 'new\n')

    expect(await readdir(dir)).toEqual(['clean.txt'])
  })

  test.skipIf(!symlinksSupported)('writes through a symlink without breaking it', async () => {
    externalDir = await mkdtemp(join(tmpdir(), 'nat-ui-atomic-external-'))
    const target = join(externalDir, 'target.txt')
    await writeFile(target, 'old\n', 'utf8')
    const link = join(dir, 'link.txt')
    await symlink(target, link)

    await atomicWriteFile(link, 'new\n')

    const linkStat = await lstat(link)
    expect(linkStat.isSymbolicLink()).toBe(true)
    expect(await readlink(link)).toBe(target)
    expect(await readFile(target, 'utf8')).toBe('new\n')
    expect(await readFile(link, 'utf8')).toBe('new\n')
  })

  test.skipIf(!symlinksSupported)(
    'refuses to write through a dangling symlink rather than replacing it',
    async () => {
      const missingTarget = join(dir, 'missing-target.txt')
      const link = join(dir, 'dangling-link.txt')
      await symlink(missingTarget, link)

      await expect(atomicWriteFile(link, 'new\n')).rejects.toThrow(/no longer exists/)

      const linkStat = await lstat(link)
      expect(linkStat.isSymbolicLink()).toBe(true)
      expect(await readlink(link)).toBe(missingTarget)
      await expect(readFile(missingTarget, 'utf8')).rejects.toThrow()
    },
  )

  test('creates the temp file exclusively, so a name collision cannot overwrite an existing file', async () => {
    vi.resetModules()
    vi.doMock('node:crypto', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:crypto')>()

      return {...actual, randomBytes: () => Buffer.from('deadbeefcafe', 'hex')}
    })

    try {
      const {atomicWriteFile: mockedAtomicWriteFile} = await import('./atomic-write')
      const path = join(dir, 'target.txt')
      await writeFile(path, 'original\n', 'utf8')
      const collidingTempPath = join(dir, '.target.txt.deadbeefcafe.tmp')
      await writeFile(collidingTempPath, 'not mine\n', 'utf8')

      await expect(mockedAtomicWriteFile(path, 'new\n')).rejects.toThrow()

      expect(await readFile(collidingTempPath, 'utf8')).toBe('not mine\n')
      expect(await readFile(path, 'utf8')).toBe('original\n')
    } finally {
      vi.doUnmock('node:crypto')
      vi.resetModules()
    }
  })

  test('preserves the original failure when cleaning up the temp file also fails', async () => {
    vi.resetModules()
    vi.doMock('node:fs/promises', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs/promises')>()

      return {
        ...actual,
        rename: () => Promise.reject(new Error('disk is full')),
        rm: () => Promise.reject(new Error('cleanup also failed')),
      }
    })

    try {
      const {atomicWriteFile: mockedAtomicWriteFile} = await import('./atomic-write')
      const path = join(dir, 'target.txt')

      await expect(mockedAtomicWriteFile(path, 'new\n')).rejects.toThrow('disk is full')
    } finally {
      vi.doUnmock('node:fs/promises')
      vi.resetModules()
    }
  })
})
