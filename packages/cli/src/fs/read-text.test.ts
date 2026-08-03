import {mkdtemp, mkdir, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {beforeEach, describe, expect, test} from 'vitest'
import {directoryExists, fileExists, readText} from './read-text'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'nat-ui-fs-'))
  await writeFile(join(root, 'file.txt'), 'contents\n', 'utf8')
  await mkdir(join(root, 'dir'))
})

describe('readText', () => {
  test('returns the contents of a file', async () => {
    expect(await readText(join(root, 'file.txt'))).toBe('contents\n')
  })

  test('returns undefined instead of throwing when the path is missing', async () => {
    expect(await readText(join(root, 'nope.txt'))).toBeUndefined()
  })

  test('returns undefined for a directory', async () => {
    expect(await readText(join(root, 'dir'))).toBeUndefined()
  })
})

describe('fileExists', () => {
  test('distinguishes a file from a missing path', async () => {
    expect(await fileExists(join(root, 'file.txt'))).toBe(true)
    expect(await fileExists(join(root, 'nope.txt'))).toBe(false)
  })
})

describe('directoryExists', () => {
  test('distinguishes a directory from a file and from nothing', async () => {
    expect(await directoryExists(join(root, 'dir'))).toBe(true)
    expect(await directoryExists(join(root, 'file.txt'))).toBe(false)
    expect(await directoryExists(join(root, 'nope'))).toBe(false)
  })
})
