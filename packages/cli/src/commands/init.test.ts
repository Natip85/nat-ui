import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {beforeEach, describe, expect, test} from 'vitest'
import type {PackageManager} from '../detect/package-manager'
import {THEME_START} from '../theme/apply'
import {init, type InitIo} from './init'

let cwd: string
let installs: {pm: PackageManager; packages: readonly string[]}[]
let logs: string[]

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

  test('overwrites an existing config when the user confirms', async () => {
    await nextProject()
    await write('components.json', '{"existing": true}')

    const code = await init(
      io({interactive: true, confirmOverwrite: () => Promise.resolve(true)}),
      {
        yes: true,
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

  test('is idempotent: running twice leaves one theme block', async () => {
    await nextProject()

    await init(io(), {yes: true})
    await init(io({interactive: true, confirmOverwrite: () => Promise.resolve(true)}), {yes: true})

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
      io({interactive: true, confirmOverwrite: () => Promise.resolve(true)}),
      {
        yes: true,
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
