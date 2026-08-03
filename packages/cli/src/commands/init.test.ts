import {lstat, mkdtemp, mkdir, readFile, readlink, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import type {PackageManager} from '../detect/package-manager'
import {symlinksSupported} from '../test-support/symlinks'
import {THEME_START} from '../theme/apply'
import {init, type InitIo} from './init'

let cwd: string
let installs: {pm: PackageManager; packages: readonly string[]}[]
let logs: string[]
let externalDir: string | undefined

const write = async (relative: string, contents: string): Promise<void> => {
  const path = join(cwd, relative)
  await mkdir(join(path, '..'), {recursive: true})
  await writeFile(path, contents, 'utf8')
}

const read = (relative: string): Promise<string> => readFile(join(cwd, relative), 'utf8')

/**
 * The ordering invariant is that nothing is written until every fallible step
 * has succeeded, so a failure test that only checks `components.json` would
 * still pass if a later write were hoisted above the guard.
 */
const expectAbsent = async (...paths: string[]): Promise<void> => {
  for (const path of paths) {
    await expect(read(path)).rejects.toThrow()
  }
}

/** Every path init can write, for fixtures that start with none of them. */
const UNWRITTEN = [
  'components.json',
  'lib/utils.ts',
  'lib/utils.js',
  'src/lib/utils.ts',
  'app/globals.css',
  'src/app/globals.css',
] as const

const io = (overrides: Partial<InitIo> = {}): InitIo => ({
  cwd,
  env: {},
  interactive: false,
  ask: () => Promise.resolve(undefined),
  confirmOverwrite: () => Promise.resolve(false),
  install: (pm, packages) => {
    installs.push({pm, packages})

    return Promise.resolve()
  },
  log: (message) => logs.push(message),
  ...overrides,
})

const nextProject = async (): Promise<void> => {
  await write('package.json', JSON.stringify({dependencies: {next: '16.0.0'}}))
  await write('tsconfig.json', JSON.stringify({compilerOptions: {paths: {'@/*': ['./src/*']}}}))
  await write('src/app/globals.css', "@import 'tailwindcss';\n")
  await write('pnpm-lock.yaml', '')
  await mkdir(join(cwd, 'src/app'), {recursive: true})
}

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'nat-ui-init-'))
  installs = []
  logs = []
})

afterEach(async () => {
  if (externalDir !== undefined) {
    await rm(externalDir, {recursive: true, force: true})
    externalDir = undefined
  }
})

describe('init', () => {
  test('writes config, utility, and theme, then installs', async () => {
    await nextProject()

    const code = await init(io(), {yes: true})

    expect(code).toBe(0)

    const config: unknown = JSON.parse(await read('components.json'))
    expect(config).toMatchObject({
      rsc: true,
      tsx: true,
      tailwind: {css: 'src/app/globals.css', baseColor: 'neutral', cssVariables: true, prefix: ''},
      aliases: {ui: '@/components/ui'},
    })

    expect(await read('src/lib/utils.ts')).toContain('export function cn(')
    expect(await read('src/app/globals.css')).toContain(THEME_START)
    expect(installs).toEqual([{pm: 'pnpm', packages: ['clsx', 'tailwind-merge']}])
  })

  test('leaves no components.json behind when writing the utility fails partway through', async () => {
    await nextProject()
    vi.resetModules()
    vi.doMock('../fs/atomic-write', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../fs/atomic-write')>()

      return {
        ...actual,
        atomicWriteFile: (path: string, contents: string) =>
          path.endsWith('utils.ts')
            ? Promise.reject(new Error('disk full'))
            : actual.atomicWriteFile(path, contents),
      }
    })

    try {
      const {init: mockedInit} = await import('./init')

      await expect(mockedInit(io(), {yes: true})).rejects.toThrow('disk full')
      await expectAbsent('components.json')
    } finally {
      vi.doUnmock('../fs/atomic-write')
      vi.resetModules()
    }
  })

  test('leaves no components.json behind when writing the stylesheet fails partway through', async () => {
    await nextProject()
    vi.resetModules()
    vi.doMock('../fs/atomic-write', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../fs/atomic-write')>()

      return {
        ...actual,
        atomicWriteFile: (path: string, contents: string) =>
          path.endsWith('.css')
            ? Promise.reject(new Error('disk full'))
            : actual.atomicWriteFile(path, contents),
      }
    })

    try {
      const {init: mockedInit} = await import('./init')

      await expect(mockedInit(io(), {yes: true})).rejects.toThrow('disk full')
      await expectAbsent('components.json')
      // The utility, having no fallible step left after it, is allowed to have
      // landed already -- only the config marker must not have.
      expect(await read('src/lib/utils.ts')).toContain('export function cn(')
    } finally {
      vi.doUnmock('../fs/atomic-write')
      vi.resetModules()
    }
  })

  test('refuses a directory with no package.json and writes nothing', async () => {
    const code = await init(io(), {yes: true})

    expect(code).toBe(1)
    await expectAbsent(...UNWRITTEN)
    expect(installs).toEqual([])
  })

  test('fails before writing when the stylesheet cannot be found', async () => {
    await write('package.json', '{}')

    const code = await init(io(), {yes: true})

    expect(code).toBe(1)
    await expectAbsent(...UNWRITTEN)
    expect(installs).toEqual([])
  })

  test('fails before writing when package.json exists but cannot be parsed', async () => {
    await write('package.json', '{not json')
    const stylesheet = "@import 'tailwindcss';\n"
    await write('app/globals.css', stylesheet)

    const code = await init(io(), {yes: true})

    expect(code).toBe(1)
    expect(logs.join('\n')).toMatch(/package\.json/)
    await expectAbsent('components.json', 'lib/utils.ts', 'lib/utils.js')
    expect(await read('app/globals.css')).toBe(stylesheet)
    expect(installs).toEqual([])
  })

  test('places the utility per the paths target when it disagrees with the stylesheet location', async () => {
    // CSS lives under src/, but the alias maps to the project root, so the
    // import `@/lib/utils` resolves to `lib/utils.ts`, not `src/lib/utils.ts`.
    await write('package.json', JSON.stringify({dependencies: {next: '16.0.0'}}))
    await write('tsconfig.json', JSON.stringify({compilerOptions: {paths: {'@/*': ['./*']}}}))
    await write('src/app/globals.css', "@import 'tailwindcss';\n")

    const code = await init(io(), {yes: true})

    expect(code).toBe(0)
    expect(await read('lib/utils.ts')).toContain('export function cn(')
    await expect(read('src/lib/utils.ts')).rejects.toThrow()
  })

  test('places the utility using the paths target for the prefix the user actually chose, not the detected default', async () => {
    // `~` is the detected default (first paths entry), targeting `src`, but
    // the user overrides the prefix to `@` at the prompt, which targets `app`.
    // The utility -- and the alias recorded in components.json -- must follow
    // the chosen prefix's target, or the import `@/lib/utils` (-> `app/lib/utils`)
    // would resolve to a file that was never written.
    await write('package.json', JSON.stringify({dependencies: {next: '16.0.0'}}))
    await write(
      'tsconfig.json',
      JSON.stringify({compilerOptions: {paths: {'~/*': ['./src/*'], '@/*': ['./app/*']}}}),
    )
    await write('src/app/globals.css', "@import 'tailwindcss';\n")

    const code = await init(
      io({
        interactive: true,
        ask: () =>
          Promise.resolve({
            baseColor: 'neutral' as const,
            css: 'src/app/globals.css',
            aliasPrefix: '@',
            rsc: true,
            tsx: true,
          }),
      }),
      {yes: false},
    )

    expect(code).toBe(0)
    expect(await read('app/lib/utils.ts')).toContain('export function cn(')
    await expect(read('src/lib/utils.ts')).rejects.toThrow()
    await expect(read('lib/utils.ts')).rejects.toThrow()

    const config: unknown = JSON.parse(await read('components.json'))
    expect(config).toMatchObject({aliases: {utils: '@/lib/utils'}})
  })

  test('falls back to the stylesheet-based heuristic when the alias target escapes the project root', async () => {
    await write('package.json', JSON.stringify({dependencies: {next: '16.0.0'}}))
    await write(
      'tsconfig.json',
      JSON.stringify({compilerOptions: {paths: {'@/*': ['../../outside/*']}}}),
    )
    await write('src/app/globals.css', "@import 'tailwindcss';\n")

    const code = await init(io(), {yes: true})

    expect(code).toBe(0)
    // Falls back to the css-based heuristic (css lives under src/, so the
    // utility does too) instead of writing outside the project entirely.
    expect(await read('src/lib/utils.ts')).toContain('export function cn(')
  })

  test('refuses a stylesheet path that resolves outside the project root, before writing anything', async () => {
    await write('package.json', '{}')

    const code = await init(
      io({
        interactive: true,
        ask: () =>
          Promise.resolve({
            baseColor: 'neutral' as const,
            css: '../../elsewhere.css',
            aliasPrefix: '@',
            rsc: true,
            tsx: true,
          }),
      }),
      {yes: false},
    )

    expect(code).toBe(1)
    expect(logs.join('\n')).toMatch(/outside the project/)
    await expectAbsent(...UNWRITTEN)
    expect(installs).toEqual([])
  })

  test('normalizes a Windows-style stylesheet path before placing the utility and writing config', async () => {
    await nextProject()

    const code = await init(
      io({
        interactive: true,
        ask: () =>
          Promise.resolve({
            baseColor: 'neutral' as const,
            css: 'src\\app\\globals.css',
            aliasPrefix: '@',
            rsc: true,
            tsx: true,
          }),
      }),
      {yes: false},
    )

    expect(code).toBe(0)
    expect(await read('src/lib/utils.ts')).toContain('export function cn(')

    const config: unknown = JSON.parse(await read('components.json'))
    expect(config).toMatchObject({tailwind: {css: 'src/app/globals.css'}})
  })

  test('writes a js utility for a javascript project', async () => {
    await write('package.json', '{}')
    await write('app/globals.css', "@import 'tailwindcss';\n")

    const code = await init(io(), {yes: true})

    expect(code).toBe(0)
    expect(await read('lib/utils.js')).toContain('export function cn(')
    await expect(read('lib/utils.ts')).rejects.toThrow()
  })

  test('declines to overwrite an existing config when not interactive', async () => {
    await nextProject()
    await write('components.json', '{"existing": true}')

    const code = await init(io(), {yes: true})

    expect(code).toBe(0)
    expect(await read('components.json')).toContain('existing')
    expect(installs).toEqual([])
  })

  test('declines to overwrite an existing config under --yes on a TTY, without prompting', async () => {
    await nextProject()
    await write('components.json', '{"existing": true}')
    let asked = false

    const code = await init(
      io({
        interactive: true,
        confirmOverwrite: () => {
          asked = true

          return Promise.resolve(true)
        },
      }),
      {yes: true},
    )

    expect(code).toBe(0)
    expect(asked).toBe(false)
    expect(await read('components.json')).toContain('existing')
    expect(installs).toEqual([])
  })

  test('overwrites an existing config when the user confirms', async () => {
    await nextProject()
    await write('components.json', '{"existing": true}')

    const code = await init(
      io({
        interactive: true,
        confirmOverwrite: () => Promise.resolve(true),
        ask: () =>
          Promise.resolve({
            baseColor: 'neutral' as const,
            css: 'src/app/globals.css',
            aliasPrefix: '@',
            rsc: true,
            tsx: true,
          }),
      }),
      {
        yes: false,
      },
    )

    expect(code).toBe(0)
    expect(await read('components.json')).not.toContain('existing')
  })

  test('leaves an existing utility file alone', async () => {
    await nextProject()
    await write('src/lib/utils.ts', 'export const mine = 1\n')

    const code = await init(io(), {yes: true})

    expect(code).toBe(0)
    expect(await read('src/lib/utils.ts')).toBe('export const mine = 1\n')
    expect(logs.join('\n')).toMatch(/utils\.ts/)
  })

  test.skipIf(!symlinksSupported)(
    'updates a symlinked stylesheet through the link without breaking it',
    async () => {
      await nextProject()
      externalDir = await mkdtemp(join(tmpdir(), 'nat-ui-init-external-'))
      const externalCss = join(externalDir, 'globals.css')
      await writeFile(externalCss, "@import 'tailwindcss';\n", 'utf8')
      const linkPath = join(cwd, 'src/app/globals.css')
      await rm(linkPath)
      await symlink(externalCss, linkPath)

      const code = await init(io(), {yes: true})

      expect(code).toBe(0)
      const linkStat = await lstat(linkPath)
      expect(linkStat.isSymbolicLink()).toBe(true)
      expect(await readlink(linkPath)).toBe(externalCss)
      expect(await read('src/app/globals.css')).toContain(THEME_START)
      expect(await readFile(externalCss, 'utf8')).toContain(THEME_START)
    },
  )

  test('is idempotent: running twice leaves one theme block', async () => {
    await nextProject()

    await init(io(), {yes: true})
    await init(
      io({
        interactive: true,
        confirmOverwrite: () => Promise.resolve(true),
        ask: () =>
          Promise.resolve({
            baseColor: 'neutral' as const,
            css: 'src/app/globals.css',
            aliasPrefix: '@',
            rsc: true,
            tsx: true,
          }),
      }),
      {yes: false},
    )

    const css = await read('src/app/globals.css')
    expect(css.split(THEME_START).length - 1).toBe(1)
  })

  test('reports install failure with the command to run by hand', async () => {
    await nextProject()

    const code = await init(io({install: () => Promise.reject(new Error('network down'))}), {
      yes: true,
    })

    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('pnpm add clsx tailwind-merge')
    expect(await read('components.json')).toContain('baseColor')
  })

  test('uses scripted answers when interactive', async () => {
    await nextProject()

    const code = await init(
      io({
        interactive: true,
        ask: () =>
          Promise.resolve({
            baseColor: 'slate' as const,
            css: 'src/app/globals.css',
            aliasPrefix: '~',
            rsc: false,
            tsx: true,
          }),
      }),
      {yes: false},
    )

    expect(code).toBe(0)

    const config: unknown = JSON.parse(await read('components.json'))
    expect(config).toMatchObject({rsc: false, tailwind: {baseColor: 'slate'}})
    expect(await read('src/app/globals.css')).toContain('oklch(0.129 0.042 264.695)')
  })

  test('exits without writing when the user cancels the prompts', async () => {
    await nextProject()
    const before = await read('src/app/globals.css')

    const code = await init(io({interactive: true}), {yes: false})

    expect(code).toBe(1)
    await expectAbsent('components.json', 'src/lib/utils.ts')
    expect(await read('src/app/globals.css')).toBe(before)
    expect(installs).toEqual([])
  })

  test('refuses an incomplete theme block without touching anything', async () => {
    await nextProject()
    await init(io(), {yes: true})
    const applied = await read('src/app/globals.css')
    await write('src/app/globals.css', applied.replace(THEME_START, ''))
    await write('components.json', '{"existing": true}')
    // Removed rather than left in place: init skips a utility that already
    // exists, so asserting an existing one is unchanged would prove nothing
    // about whether the write was hoisted above the guard.
    await rm(join(cwd, 'src/lib/utils.ts'))
    const damaged = await read('src/app/globals.css')
    installs = []

    const code = await init(
      io({
        interactive: true,
        confirmOverwrite: () => Promise.resolve(true),
        ask: () =>
          Promise.resolve({
            baseColor: 'neutral' as const,
            css: 'src/app/globals.css',
            aliasPrefix: '@',
            rsc: true,
            tsx: true,
          }),
      }),
      {
        yes: false,
      },
    )

    expect(code).toBe(1)
    expect(logs.join('\n')).toMatch(/nat-ui theme/)
    expect(await read('components.json')).toContain('existing')
    expect(await read('src/app/globals.css')).toBe(damaged)
    await expectAbsent('src/lib/utils.ts')
    expect(installs).toEqual([])
  })

  test('warns but continues when TypeScript is chosen without a tsconfig', async () => {
    await write('package.json', '{}')
    await write('app/globals.css', "@import 'tailwindcss';\n")

    const code = await init(
      io({
        interactive: true,
        ask: () =>
          Promise.resolve({
            baseColor: 'neutral' as const,
            css: 'app/globals.css',
            aliasPrefix: '@',
            rsc: false,
            tsx: true,
          }),
      }),
      {yes: false},
    )

    expect(code).toBe(0)
    expect(logs.join('\n')).toMatch(/tsconfig/i)
    expect(await read('lib/utils.ts')).toContain('export function cn(')
  })
})
