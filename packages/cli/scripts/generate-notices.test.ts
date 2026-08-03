import {realpathSync} from 'node:fs'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import {generateNotices, LICENSE_NAMES, readMetafiles} from './generate-notices'

let root: string
let distDir: string

const write = async (path: string, contents: string): Promise<void> => {
  await mkdir(dirname(path), {recursive: true})
  await writeFile(path, contents, 'utf8')
}

const writeMetafile = async (name: string, inputs: Record<string, unknown>): Promise<void> => {
  await write(join(distDir, name), JSON.stringify({inputs}))
}

const writePackageFile = async (name: string, file: string, contents: string): Promise<void> => {
  await write(join(root, 'node_modules', ...name.split('/'), file), contents)
}

beforeEach(async () => {
  // os.tmpdir() is itself a symlink on macOS (/tmp -> /private/tmp), so
  // realpath it up front or every path-based expectation below is wrong.
  root = realpathSync(await mkdtemp(join(tmpdir(), 'nat-ui-notices-')))
  distDir = join(root, 'dist')
  await mkdir(distDir, {recursive: true})
})

afterEach(async () => {
  await rm(root, {recursive: true, force: true})
})

describe('readMetafiles', () => {
  test('reads every metafile-*.json file in dist, not just one', async () => {
    await writeMetafile('metafile-a.json', {'a-input': {}})
    await writeMetafile('metafile-b.json', {'b-input': {}})

    const {inputs} = await readMetafiles(distDir)

    expect(Object.keys(inputs).sort()).toEqual(['a-input', 'b-input'])
  })
})

describe('generateNotices', () => {
  test('merges bundled packages found across multiple metafiles, not just the first one', async () => {
    await writePackageFile('pkg-a', 'package.json', JSON.stringify({license: 'MIT'}))
    await writePackageFile('pkg-a', 'LICENSE', 'pkg-a license text')
    await writePackageFile('pkg-b', 'package.json', JSON.stringify({license: 'MIT'}))
    await writePackageFile('pkg-b', 'LICENSE', 'pkg-b license text')

    // Two separate metafiles, as tsup would emit if it ever built more than
    // one output format (e.g. esm + cjs). Each mentions a different package.
    await writeMetafile('metafile-a.json', {'node_modules/pkg-a/index.js': {}})
    await writeMetafile('metafile-b.json', {'node_modules/pkg-b/index.js': {}})

    const {content, packageCount} = await generateNotices({root, distDir})

    expect(packageCount).toBe(2)
    expect(content).toContain('pkg-a license text')
    expect(content).toContain('pkg-b license text')
  })

  test('orders packages deterministically, independent of metafile key order', async () => {
    await writePackageFile('zebra-pkg', 'package.json', JSON.stringify({license: 'MIT'}))
    await writePackageFile('zebra-pkg', 'LICENSE', 'zebra text')
    await writePackageFile('apple-pkg', 'package.json', JSON.stringify({license: 'MIT'}))
    await writePackageFile('apple-pkg', 'LICENSE', 'apple text')

    // Insertion order is deliberately reversed so a correct implementation
    // must sort explicitly rather than rely on object or readdir ordering.
    await writeMetafile('metafile-only.json', {
      'node_modules/zebra-pkg/index.js': {},
      'node_modules/apple-pkg/index.js': {},
    })

    const {content} = await generateNotices({root, distDir})

    expect(content.indexOf('apple-pkg')).toBeGreaterThanOrEqual(0)
    expect(content.indexOf('apple-pkg')).toBeLessThan(content.indexOf('zebra-pkg'))
  })

  test('excludes @nat-ui workspace packages, first-party source, and Node builtins', async () => {
    await writePackageFile('kept-pkg', 'package.json', JSON.stringify({license: 'MIT'}))
    await writePackageFile('kept-pkg', 'LICENSE', 'kept license text')
    // Deliberately no package.json/license for @nat-ui/schema: if the
    // exclusion ever breaks, this throws instead of silently passing.
    await writeMetafile('metafile-only.json', {
      'node_modules/kept-pkg/index.js': {},
      'node_modules/@nat-ui/schema/dist/index.js': {},
      'src/index.ts': {},
      'node:fs': {},
    })

    const {content, packageCount} = await generateNotices({root, distDir})

    expect(packageCount).toBe(1)
    expect(content).toContain('kept-pkg')
    expect(content).not.toContain('@nat-ui')
  })

  test('fails loudly when a bundled package has no license file at all', async () => {
    // An SPDX `license` field is not attribution text, so it must not
    // satisfy the check on its own.
    await writePackageFile('unlicensed-pkg', 'package.json', JSON.stringify({license: 'MIT'}))
    await writeMetafile('metafile-only.json', {'node_modules/unlicensed-pkg/index.js': {}})

    await expect(generateNotices({root, distDir})).rejects.toThrow(/unlicensed-pkg/)
  })

  test('honours license filename priority when a package has more than one candidate', async () => {
    await writePackageFile('multi-license-pkg', 'package.json', JSON.stringify({license: 'MIT'}))
    await writePackageFile('multi-license-pkg', 'LICENSE.txt', 'txt version')
    await writePackageFile('multi-license-pkg', 'LICENSE.md', 'md version')
    await writeMetafile('metafile-only.json', {'node_modules/multi-license-pkg/index.js': {}})

    const {content} = await generateNotices({root, distDir})

    expect(content).toContain('md version')
    expect(content).not.toContain('txt version')
  })

  test('discovers COPYING alone', async () => {
    await writePackageFile('copying-pkg', 'package.json', JSON.stringify({license: 'MIT'}))
    await writePackageFile('copying-pkg', 'COPYING', 'copying text')
    await writeMetafile('metafile-only.json', {'node_modules/copying-pkg/index.js': {}})

    const {content} = await generateNotices({root, distDir})

    expect(content).toContain('copying text')
  })
})

describe('LICENSE_NAMES', () => {
  test('includes the conventional COPYING and LICENCE variants', () => {
    expect(LICENSE_NAMES).toEqual(
      expect.arrayContaining(['COPYING', 'COPYING.md', 'LICENCE.md', 'LICENCE.txt']),
    )
  })
})
