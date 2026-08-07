import {execFile} from 'node:child_process'
import {mkdtemp, readdir, readFile, rm, stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'

import {findUnresolvedSpecifiers} from './manifest'

// This file is the executable entry point run directly in CI (never
// imported), so side effects and `process.exitCode` are fine here.
//
// It packs with `pnpm`, not `npm`, because that is what the release publishes:
// this repo authors dev dependencies as `catalog:` and `workspace:*`, and only
// pnpm resolves those into installable ranges. Verifying an `npm pack` tarball
// would check a manifest that never ships — a verifier that can be wrong while
// green.
//
// It shells out to `pnpm` and `tar` and assumes a POSIX-ish runner; it is only
// ever run from a single Linux CI job, not across the OS/Node matrix.
const execFileAsync = promisify(execFile)

const PACKAGE_DIR = fileURLToPath(new URL('../', import.meta.url))
const METAFILE_PATTERN = /^dist\/metafile-.*\.json$/

interface PackedFile {
  readonly path: string
  readonly mode: number
  readonly size: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

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
 * Packs into a directory created empty for the purpose and then reads it back,
 * rather than parsing pnpm's stdout — the output format is not contractual,
 * but "the only tarball in an empty directory" is unambiguous.
 */
const packWithPnpm = async (destination: string): Promise<string> => {
  await execFileAsync('pnpm', ['pack', '--pack-destination', destination], {cwd: PACKAGE_DIR})

  const tarballs = (await readdir(destination)).filter((entry) => entry.endsWith('.tgz'))
  // Destructured rather than indexed: `noUncheckedIndexedAccess` makes
  // `tarballs[0]` possibly-undefined, and a type assertion here would be
  // asserting exactly the thing this check exists to establish.
  const [tarball, ...rest] = tarballs
  if (tarball === undefined || rest.length > 0) {
    throw new Error(
      `Expected exactly one tarball in ${destination}, found ${String(tarballs.length)}.`,
    )
  }

  return tarball
}

/** Enumerate the extracted tree, recording each file's mode so the bin's execute bit can be checked. */
const listPackedFiles = async (root: string): Promise<readonly PackedFile[]> => {
  const files: PackedFile[] = []

  const walk = async (directory: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const absolute = join(directory, entry.name)
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`

      if (entry.isDirectory()) {
        await walk(absolute, relative)
        continue
      }

      const stats = await stat(absolute)
      files.push({path: relative, mode: stats.mode & 0o777, size: stats.size})
    }
  }

  await walk(root, '')

  return files
}

/**
 * This is a *shape* check, not a full manifest: everything under `dist/`
 * other than a metafile is accepted, since tsup names its chunk files with a
 * content hash that changes with the code, making a hardcoded list of them
 * impractical to keep in sync. So a stray non-metafile artifact injected into
 * `dist/` by some future build change would slip past this — only a bug in
 * package.json's `files` field that leaks a file from *outside* `dist/`, or a
 * metafile leaking from inside it, is what this actually catches.
 */
const isExpectedPath = (path: string): boolean =>
  path === 'package.json' ||
  path === 'LICENSE' ||
  path === 'README.md' ||
  path === 'THIRD_PARTY_NOTICES' ||
  (path.startsWith('dist/') && !METAFILE_PATTERN.test(path))

const main = async (): Promise<void> => {
  const binPath = await readBinPath()
  const workDir = await mkdtemp(join(tmpdir(), 'nat-ui-verify-pack-'))
  const issues: string[] = []

  try {
    const filename = await packWithPnpm(workDir)
    await execFileAsync('tar', ['-xzf', filename, '-C', workDir], {cwd: workDir})

    // npm and pnpm both wrap a tarball's contents in a top-level "package/".
    const packageRoot = join(workDir, 'package')
    const files = await listPackedFiles(packageRoot)
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

      const contents = await readFile(join(packageRoot, binPath), 'utf8')
      if (!contents.startsWith('#!')) {
        issues.push(
          `Executable "${binPath}" is packed without a shebang line (the build likely stripped it).`,
        )
      }
    }

    if (!byPath.has('THIRD_PARTY_NOTICES')) {
      issues.push('THIRD_PARTY_NOTICES is missing from the packed tarball.')
    }

    // npm publishes README.md whatever `files` says, so its absence means the
    // file itself is gone — and the failure is silent: a blank package page on
    // npm that nobody notices until someone goes looking for documentation.
    if (!byPath.has('README.md')) {
      issues.push('README.md is missing from the packed tarball, so npm would show a blank page.')
    }

    for (const file of files) {
      if (isExpectedPath(file.path)) continue

      issues.push(
        METAFILE_PATTERN.test(file.path)
          ? `Internal build artifact "${file.path}" leaked into the packed tarball (should be excluded by package.json "files").`
          : `Unexpected file "${file.path}" is included in the packed tarball (not covered by package.json "files").`,
      )
    }

    const manifest: unknown = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
    for (const {field, name, specifier} of findUnresolvedSpecifiers(manifest)) {
      issues.push(
        `Dependency "${name}" in "${field}" is packed as "${specifier}", which no npm client can ` +
          'install. The tarball was built by a tool that does not resolve pnpm protocols.',
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

    console.log(
      `Verified packed tarball shape and manifest for @nat-ui/cli (${String(files.length)} files; ` +
        `contents of dist/ are not individually enumerated).`,
    )
  } finally {
    await rm(workDir, {recursive: true, force: true})
  }
}

await main()
