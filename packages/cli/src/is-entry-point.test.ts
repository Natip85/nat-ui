import {realpathSync} from 'node:fs'
import {mkdtemp, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import {isEntryPoint} from './is-entry-point'
import {symlinksSupported} from './test-support/symlinks'

let root: string

beforeEach(async () => {
  // os.tmpdir() is itself a symlink on macOS (/tmp -> /private/tmp), so
  // realpath it up front or every "direct path" expectation below is wrong.
  root = realpathSync(await mkdtemp(join(tmpdir(), 'nat-ui-entry-')))
})

afterEach(async () => {
  await rm(root, {recursive: true, force: true})
})

describe('isEntryPoint', () => {
  test('matches when the entry path equals the module URL directly', async () => {
    const real = join(root, 'index.js')
    await writeFile(real, '', 'utf8')

    expect(isEntryPoint(pathToFileURL(real).href, real)).toBe(true)
  })

  test.skipIf(!symlinksSupported)(
    'matches when the entry is a symlink to the real module',
    async () => {
      const real = join(root, 'index.js')
      const link = join(root, 'nat-ui')
      await writeFile(real, '', 'utf8')
      await symlink(real, link)

      // Node resolves import.meta.url to the realpath of the module but does
      // not realpath argv[1], so `entry` here is the symlink while `metaUrl`
      // reflects the target it points at.
      expect(isEntryPoint(pathToFileURL(real).href, link)).toBe(true)
    },
  )

  test('does not match an unrelated path', async () => {
    const real = join(root, 'index.js')
    const other = join(root, 'other.js')
    await writeFile(real, '', 'utf8')
    await writeFile(other, '', 'utf8')

    expect(isEntryPoint(pathToFileURL(real).href, other)).toBe(false)
  })

  test('returns false when there is no entry', () => {
    expect(isEntryPoint('file:///anything.js', undefined)).toBe(false)
  })

  test('returns false rather than throwing for a non-existent entry', () => {
    expect(isEntryPoint('file:///anything.js', join(root, 'missing.js'))).toBe(false)
  })

  test('matches a path that does not exist when it equals the module URL', () => {
    // Under `--preserve-symlinks-main` the direct comparison is the only one
    // that can match, so it has to be tried before realpath. A missing path
    // pins that order: realpath would throw here and report no match.
    const missing = join(root, 'missing.js')

    expect(isEntryPoint(pathToFileURL(missing).href, missing)).toBe(true)
  })
})
