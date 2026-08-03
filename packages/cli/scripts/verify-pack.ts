import {execFile} from 'node:child_process'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'

// This file is the executable entry point run directly in CI (never
// imported), so side effects and `process.exitCode` are fine here. It shells
// out to `npm` and `tar` rather than a bundler-specific API, since what
// matters is exactly what `npm publish` would ship — not what our own build
// tooling thinks it produced. That also means this assumes a POSIX-ish
// runner (a real `tar` binary, `npm` resolvable without a shell); it is only
// ever run from a single Linux CI job, not across the OS/Node matrix.
const execFileAsync = promisify(execFile)

const PACKAGE_DIR = fileURLToPath(new URL('../', import.meta.url))
const METAFILE_PATTERN = /^dist\/metafile-.*\.json$/

interface PackedFile {
  readonly path: string
  readonly size: number
  readonly mode: number
}

interface PackResult {
  readonly filename: string
  readonly files: readonly PackedFile[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const asString = (value: unknown, description: string): string => {
  if (typeof value !== 'string') throw new Error(`Expected ${description} to be a string.`)

  return value
}

const asNumber = (value: unknown, description: string): number => {
  if (typeof value !== 'number') throw new Error(`Expected ${description} to be a number.`)

  return value
}

const asPackedFile = (value: unknown): PackedFile => {
  if (!isRecord(value)) throw new Error('Expected each `npm pack` file entry to be an object.')

  return {
    path: asString(value.path, 'a packed file `path`'),
    size: asNumber(value.size, 'a packed file `size`'),
    mode: asNumber(value.mode, 'a packed file `mode`'),
  }
}

/**
 * `npm pack --json` reports exactly what `npm publish` would ship, already
 * filtered through package.json's `files` allowlist — so this only needs to
 * assert against that real, resolved list rather than re-implement npm's own
 * glob matching.
 */
const parsePackOutput = (raw: string): PackResult => {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('Expected `npm pack --json` to output an array.')
  if (parsed.length !== 1) {
    throw new Error(
      `Expected \`npm pack\` to report exactly one package, got ${String(parsed.length)}.`,
    )
  }

  const entry: unknown = parsed[0]
  if (!isRecord(entry)) throw new Error('Expected the `npm pack` entry to be an object.')

  const {files} = entry
  if (!Array.isArray(files))
    throw new Error('Expected `npm pack` output to include a `files` array.')

  return {
    filename: asString(entry.filename, 'the `npm pack` `filename`'),
    files: files.map(asPackedFile),
  }
}

/** Read from package.json rather than hardcoded, so this can't drift from the real bin target. */
const readBinPath = async (): Promise<string> => {
  const raw = await readFile(join(PACKAGE_DIR, 'package.json'), 'utf8')
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed)) throw new Error('Expected package.json to be an object.')

  const {bin} = parsed
  if (!isRecord(bin)) throw new Error('Expected package.json "bin" to be an object.')

  const [target] = Object.values(bin)
  if (typeof target !== 'string') {
    throw new Error('Expected package.json "bin" to map to at least one string path.')
  }

  return target.replace(/^\.\//, '')
}

/**
 * Anything not covered by one of these is either a bug in package.json's
 * `files` field or bloat that slipped past it — either way, worth failing on
 * rather than silently publishing.
 */
const isExpectedPath = (path: string): boolean =>
  path === 'package.json' ||
  path === 'LICENSE' ||
  path === 'THIRD_PARTY_NOTICES' ||
  (path.startsWith('dist/') && !METAFILE_PATTERN.test(path))

const main = async (): Promise<void> => {
  const binPath = await readBinPath()
  const workDir = await mkdtemp(join(tmpdir(), 'nat-ui-verify-pack-'))
  const issues: string[] = []

  try {
    const {stdout} = await execFileAsync('npm', ['pack', '--json', '--pack-destination', workDir], {
      cwd: PACKAGE_DIR,
    })
    const {filename, files} = parsePackOutput(stdout)
    const byPath = new Map(files.map((file) => [file.path, file] as const))

    const bin = byPath.get(binPath)
    if (bin === undefined) {
      issues.push(
        `Executable "${binPath}" (from package.json "bin") is missing from the packed tarball.`,
      )
    } else {
      if ((bin.mode & 0o111) === 0) {
        issues.push(
          `Executable "${binPath}" is packed without any execute bit (mode ${bin.mode.toString(8)}).`,
        )
      }

      await execFileAsync('tar', ['-xzf', filename, '-C', workDir], {cwd: workDir})
      // npm wraps every tarball's contents in a top-level "package/" directory.
      const contents = await readFile(join(workDir, 'package', binPath), 'utf8')
      if (!contents.startsWith('#!')) {
        issues.push(
          `Executable "${binPath}" is packed without a shebang line (the build likely stripped it).`,
        )
      }
    }

    if (!byPath.has('THIRD_PARTY_NOTICES')) {
      issues.push('THIRD_PARTY_NOTICES is missing from the packed tarball.')
    }

    for (const file of files) {
      if (isExpectedPath(file.path)) continue

      issues.push(
        METAFILE_PATTERN.test(file.path)
          ? `Internal build artifact "${file.path}" leaked into the packed tarball (should be excluded by package.json "files").`
          : `Unexpected file "${file.path}" is included in the packed tarball (not covered by package.json "files").`,
      )
    }

    if (issues.length > 0) {
      console.error('Packed tarball for @nat-ui/cli failed verification:\n')
      for (const issue of issues) console.error(`  - ${issue}`)
      console.error(`\nFull packed file list (${String(files.length)} entries):`)
      for (const file of files) {
        console.error(`  ${file.path} (mode ${file.mode.toString(8)}, ${String(file.size)}b)`)
      }
      process.exitCode = 1

      return
    }

    console.log(`Verified packed tarball for @nat-ui/cli (${String(files.length)} files).`)
  } finally {
    await rm(workDir, {recursive: true, force: true})
  }
}

await main()
