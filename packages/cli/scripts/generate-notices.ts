import {readFile, readdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {resolveBundledPackage} from './resolve-bundled-package'

// Priority order for which file wins when a package ships more than one.
// LICENSE-family names come before the older COPYING convention.
export const LICENSE_NAMES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENCE',
  'LICENCE.md',
  'LICENCE.txt',
  'license',
  'COPYING',
  'COPYING.md',
] as const

interface Metafile {
  readonly inputs: Record<string, unknown>
}

interface ErrnoLike {
  readonly code?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isEnoent = (error: unknown): boolean =>
  error instanceof Error && (error as Error & ErrnoLike).code === 'ENOENT'

const parseMetafile = (raw: string): Metafile => {
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed) || !('inputs' in parsed)) {
    throw new Error('Unexpected metafile shape: missing "inputs".')
  }

  const {inputs} = parsed
  if (!isRecord(inputs)) {
    throw new Error('Unexpected metafile shape: "inputs" is not an object.')
  }

  return {inputs}
}

/**
 * Reads every metafile-*.json in dist, not just one. tsup emits one per
 * output format; today that's a single ESM file, but if a second format is
 * ever added, a package unique to it must not be silently dropped. The
 * sorted filename order is what makes the merge deterministic, not
 * whatever order readdir() happens to return.
 */
export const readMetafiles = async (distDir: string): Promise<Metafile> => {
  const names = (await readdir(distDir))
    .filter((file) => file.startsWith('metafile-') && file.endsWith('.json'))
    .sort()

  if (names.length === 0) throw new Error('No tsup metafile found in dist/.')

  const contents = await Promise.all(names.map((name) => readFile(resolve(distDir, name), 'utf8')))

  const inputs: Record<string, unknown> = {}
  for (const raw of contents) {
    Object.assign(inputs, parseMetafile(raw).inputs)
  }

  return {inputs}
}

/**
 * One package can supply several bundled files, so this dedupes by package
 * name. Ordering is by directory path (not encounter order) purely so the
 * choice is deterministic if a name were ever to resolve to more than one
 * physical location; in practice every package here resolves to exactly one.
 */
export const bundledPackages = (
  inputs: Record<string, unknown>,
  root: string,
): ReadonlyMap<string, string> => {
  const byName = new Map<string, string>()

  for (const key of Object.keys(inputs)) {
    if (!key.includes('node_modules/')) continue

    const pkg = resolveBundledPackage(resolve(root, key))
    if (pkg === undefined || pkg.name.startsWith('@nat-ui/')) continue

    const existing = byName.get(pkg.name)
    if (existing === undefined || pkg.directory < existing) {
      byName.set(pkg.name, pkg.directory)
    }
  }

  return byName
}

export const noticeFor = async (name: string, directory: string): Promise<string> => {
  const manifest: unknown = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'))
  const license = isRecord(manifest) && 'license' in manifest ? String(manifest.license) : 'unknown'

  for (const candidate of LICENSE_NAMES) {
    try {
      const text = await readFile(resolve(directory, candidate), 'utf8')

      return `${name}\n\n${text.trim()}\n`
    } catch (error) {
      if (isEnoent(error)) continue
      throw error
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

export interface GenerateNoticesOptions {
  readonly root: string
  readonly distDir: string
}

export interface GeneratedNotices {
  readonly content: string
  readonly packageCount: number
}

export const generateNotices = async (
  options: GenerateNoticesOptions,
): Promise<GeneratedNotices> => {
  const {inputs} = await readMetafiles(options.distDir)
  const packages = [...bundledPackages(inputs, options.root).entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )

  const notices = await Promise.all(packages.map(([name, directory]) => noticeFor(name, directory)))

  const separator = `\n${'-'.repeat(80)}\n\n`

  return {
    content: [HEADER, ...notices].join(separator),
    packageCount: packages.length,
  }
}
