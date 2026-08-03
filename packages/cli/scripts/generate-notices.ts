import {readFile, readdir, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {resolveBundledPackage} from './resolve-bundled-package'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const DIST = fileURLToPath(new URL('../dist/', import.meta.url))

const LICENSE_NAMES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'license']

interface Metafile {
  readonly inputs: Record<string, unknown>
}

const readMetafile = async (): Promise<Metafile> => {
  const files = await readdir(DIST)
  const name = files.find((file) => file.startsWith('metafile-'))
  if (name === undefined) throw new Error('No tsup metafile found in dist/.')

  const parsed: unknown = JSON.parse(await readFile(resolve(DIST, name), 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || !('inputs' in parsed)) {
    throw new Error('Unexpected metafile shape: missing "inputs".')
  }

  const {inputs} = parsed
  if (typeof inputs !== 'object' || inputs === null) {
    throw new Error('Unexpected metafile shape: "inputs" is not an object.')
  }

  return {inputs: inputs as Record<string, unknown>}
}

/**
 * One package can supply several bundled files, so this dedupes by package
 * name. Ordering is by directory path (not encounter order) purely so the
 * choice is deterministic if a name were ever to resolve to more than one
 * physical location; in practice every package here resolves to exactly one.
 */
const bundledPackages = (inputs: Record<string, unknown>): ReadonlyMap<string, string> => {
  const byName = new Map<string, string>()

  for (const key of Object.keys(inputs)) {
    if (!key.includes('node_modules/')) continue

    const pkg = resolveBundledPackage(resolve(ROOT, key))
    if (pkg === undefined || pkg.name.startsWith('@nat-ui/')) continue

    const existing = byName.get(pkg.name)
    if (existing === undefined || pkg.directory < existing) {
      byName.set(pkg.name, pkg.directory)
    }
  }

  return byName
}

const noticeFor = async (name: string, directory: string): Promise<string> => {
  const manifest: unknown = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'))
  const license =
    typeof manifest === 'object' && manifest !== null && 'license' in manifest
      ? String(manifest.license)
      : 'unknown'

  for (const candidate of LICENSE_NAMES) {
    try {
      const text = await readFile(resolve(directory, candidate), 'utf8')

      return `${name}\n\n${text.trim()}\n`
    } catch {
      continue
    }
  }

  // A missing notice is exactly the bug this generator exists to prevent, so
  // this fails the build rather than shipping a placeholder.
  throw new Error(
    `No license file found for bundled package "${name}" (declared license: ${license}). ` +
      `Checked ${directory} for: ${LICENSE_NAMES.join(', ')}. ` +
      'This package is compiled into dist/index.js and must ship its license text.',
  )
}

const HEADER = `THIRD PARTY NOTICES

This package is distributed as a single bundled file. The software listed below
is compiled into dist/index.js, and each license notice is reproduced as that
license requires.

This file is generated at build time from the bundle itself, so it cannot drift
from what actually ships.
`

const main = async (): Promise<void> => {
  const {inputs} = await readMetafile()
  const packages = [...bundledPackages(inputs).entries()].sort(([a], [b]) => a.localeCompare(b))

  const notices = await Promise.all(packages.map(([name, directory]) => noticeFor(name, directory)))

  const separator = `\n${'-'.repeat(80)}\n\n`

  await writeFile(
    resolve(DIST, 'THIRD_PARTY_NOTICES'),
    [HEADER, ...notices].join(separator),
    'utf8',
  )

  console.log(`Wrote dist/THIRD_PARTY_NOTICES for ${String(packages.length)} package(s).`)
}

await main()
