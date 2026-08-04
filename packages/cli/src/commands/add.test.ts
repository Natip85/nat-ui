import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {CONFIG_FILE_NAME} from '@nat-ui/schema'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import type {FetchJson} from '../registry/fetch-item'
import type {PackageManager} from '../detect/package-manager'
import {add, type AddIo} from './add'

let cwd = ''

const config = {
  $schema: 'https://nat-ui.dev/schema.json',
  rsc: true,
  tsx: true,
  tailwind: {css: 'src/app/globals.css', baseColor: 'neutral'},
  aliases: {components: '@/components', utils: '@/lib/utils', ui: '@/components/ui'},
}

const buttonSource = "import {cn} from '@/lib/utils'\n\nexport const Button = () => null\n"
const dialogSource = [
  "'use client'",
  '',
  "import {buttonVariants} from '@/components/ui/button'",
  '',
  'export const Dialog = () => null',
  '',
].join('\n')

const documents: Record<string, unknown> = {
  button: {
    schemaVersion: '1',
    name: 'button',
    type: 'ui',
    dependencies: ['@base-ui/react', 'class-variance-authority'],
    files: [{path: 'components/ui/button.tsx', type: 'ui', content: buttonSource}],
  },
  dialog: {
    schemaVersion: '1',
    name: 'dialog',
    type: 'ui',
    dependencies: ['@base-ui/react', 'lucide-react'],
    registryDependencies: ['button'],
    files: [{path: 'components/ui/dialog.tsx', type: 'ui', content: dialogSource}],
  },
  mixed: {
    schemaVersion: '1',
    name: 'mixed',
    type: 'ui',
    registryDependencies: ['button'],
    files: [
      {path: 'components/ui/mixed.tsx', type: 'ui', content: 'export const Mixed = () => null\n'},
      {path: 'lib/helper.ts', type: 'lib', content: 'export const helper = () => {}\n'},
    ],
  },
}

const fetchJson: FetchJson = (url) => {
  const name = /\/([^/]+)\.json$/.exec(url)?.[1]
  if (name === 'index') {
    return Promise.resolve({
      status: 200,
      body: JSON.stringify({
        schemaVersion: '1',
        items: [
          {name: 'button', type: 'ui'},
          {name: 'dialog', type: 'ui'},
        ],
      }),
    })
  }
  const document = name === undefined ? undefined : documents[name]
  if (document === undefined) return Promise.resolve({status: 404, body: 'Not Found'})

  return Promise.resolve({status: 200, body: JSON.stringify(document)})
}

const makeIo = (overrides: Partial<AddIo> = {}): AddIo & {logs: string[]} => {
  const logs: string[] = []

  return {
    cwd,
    env: {},
    interactive: false,
    fetchJson,
    confirmOverwrite: () => Promise.resolve(false),
    install: () => Promise.resolve(),
    log: (message) => logs.push(message),
    logs,
    ...overrides,
  }
}

const options = (over: Partial<Parameters<typeof add>[1]> = {}) => ({
  names: ['button'],
  yes: false,
  overwrite: false,
  registry: 'https://r.test',
  ...over,
})

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'nat-ui-add-'))
  await writeFile(join(cwd, 'package.json'), JSON.stringify({name: 'demo'}))
  await writeFile(join(cwd, CONFIG_FILE_NAME), JSON.stringify(config))
})

afterEach(async () => {
  await rm(cwd, {recursive: true, force: true})
})

const read = (relative: string) => readFile(join(cwd, relative), 'utf8')

describe('add', () => {
  test('writes the component and installs its dependencies', async () => {
    const install = vi.fn((_pm: PackageManager, _packages: readonly string[], _cwd: string) =>
      Promise.resolve(),
    )
    const io = makeIo({install})

    const code = await add(io, options())

    expect(code).toBe(0)
    expect(await read('src/components/ui/button.tsx')).toBe(buttonSource)
    expect(install).toHaveBeenCalledTimes(1)
    expect(install.mock.calls[0]?.[1]).toEqual(['@base-ui/react', 'class-variance-authority'])
  })

  test('installs registry dependencies before the item that needs them', async () => {
    const io = makeIo()

    const code = await add(io, options({names: ['dialog']}))

    expect(code).toBe(0)
    expect(await read('src/components/ui/button.tsx')).toBeTruthy()
    const written = io.logs.filter((line) => line.startsWith('Wrote '))
    expect(written[0]).toContain('button.tsx')
    expect(written[1]).toContain('dialog.tsx')
  })

  test('installs the union of dependencies exactly once', async () => {
    const install = vi.fn((_pm: PackageManager, _packages: readonly string[], _cwd: string) =>
      Promise.resolve(),
    )

    await add(makeIo({install}), options({names: ['dialog']}))

    expect(install).toHaveBeenCalledTimes(1)
    expect(install.mock.calls[0]?.[1]).toEqual([
      '@base-ui/react',
      'class-variance-authority',
      'lucide-react',
    ])
  })

  test('rewrites imports to the project aliases', async () => {
    await writeFile(
      join(cwd, CONFIG_FILE_NAME),
      JSON.stringify({
        ...config,
        aliases: {components: '~/parts', utils: '~/helpers/cn', ui: '~/parts/ui'},
      }),
    )

    await add(makeIo(), options({names: ['dialog']}))

    // No tsconfig in the fixture, so the base directory is guessed from the
    // stylesheet path, which is under src/.
    const dialog = await read('src/parts/ui/dialog.tsx')

    expect(dialog).toContain("from '~/parts/ui/button'")
    expect(dialog).not.toContain('@/components/ui/button')
  })

  test('keeps the client directive for a server components project', async () => {
    await add(makeIo(), options({names: ['dialog']}))

    expect(await read('src/components/ui/dialog.tsx')).toContain("'use client'")
  })

  test('strips the client directive when the project has no server components', async () => {
    await writeFile(join(cwd, CONFIG_FILE_NAME), JSON.stringify({...config, rsc: false}))

    await add(makeIo(), options({names: ['dialog']}))

    expect(await read('src/components/ui/dialog.tsx')).not.toContain('use client')
  })

  test('leaves an existing file alone when it cannot ask', async () => {
    await mkdir(join(cwd, 'src/components/ui'), {recursive: true})
    await writeFile(join(cwd, 'src/components/ui/button.tsx'), 'mine\n')

    const io = makeIo()
    const code = await add(io, options())

    expect(code).toBe(0)
    expect(await read('src/components/ui/button.tsx')).toBe('mine\n')
    expect(io.logs.join('\n')).toMatch(/already exists/)
  })

  test('overwrites when --overwrite is passed', async () => {
    await mkdir(join(cwd, 'src/components/ui'), {recursive: true})
    await writeFile(join(cwd, 'src/components/ui/button.tsx'), 'mine\n')

    const code = await add(makeIo(), options({overwrite: true}))

    expect(code).toBe(0)
    expect(await read('src/components/ui/button.tsx')).toBe(buttonSource)
  })

  test('asks once, naming every affected file', async () => {
    await mkdir(join(cwd, 'src/components/ui'), {recursive: true})
    await writeFile(join(cwd, 'src/components/ui/button.tsx'), 'mine\n')
    await writeFile(join(cwd, 'src/components/ui/dialog.tsx'), 'mine\n')

    const confirmOverwrite = vi.fn((_paths: readonly string[]) => Promise.resolve(true))
    await add(makeIo({interactive: true, confirmOverwrite}), options({names: ['dialog']}))

    expect(confirmOverwrite).toHaveBeenCalledTimes(1)
    expect(confirmOverwrite.mock.calls[0]?.[0]).toHaveLength(2)
  })

  test('--overwrite wins over --yes', async () => {
    await mkdir(join(cwd, 'src/components/ui'), {recursive: true})
    await writeFile(join(cwd, 'src/components/ui/button.tsx'), 'mine\n')

    const confirmOverwrite = vi.fn((_paths: readonly string[]) => Promise.resolve(false))
    await add(makeIo({interactive: true, confirmOverwrite}), options({overwrite: true, yes: true}))

    expect(confirmOverwrite).not.toHaveBeenCalled()
    expect(await read('src/components/ui/button.tsx')).toBe(buttonSource)
  })

  test('refuses to run without a config', async () => {
    await rm(join(cwd, CONFIG_FILE_NAME))

    const io = makeIo()
    const code = await add(io, options())

    expect(code).toBe(1)
    expect(io.logs.join('\n')).toMatch(/nat-ui init/)
  })

  test('reports a malformed config without writing anything', async () => {
    await writeFile(join(cwd, CONFIG_FILE_NAME), '{nope')

    const io = makeIo()
    const code = await add(io, options())

    expect(code).toBe(1)
    expect(io.logs.join('\n')).toMatch(/not valid JSON/)
    await expect(read('src/components/ui/button.tsx')).rejects.toThrow()
  })

  test('refuses a JavaScript project', async () => {
    await writeFile(join(cwd, CONFIG_FILE_NAME), JSON.stringify({...config, tsx: false}))

    const io = makeIo()
    const code = await add(io, options())

    expect(code).toBe(1)
    expect(io.logs.join('\n')).toMatch(/TypeScript/)
  })

  test('lists what is available when the item is unknown', async () => {
    const io = makeIo()
    const code = await add(io, options({names: ['carousel']}))

    expect(code).toBe(1)
    expect(io.logs.join('\n')).toMatch(/carousel/)
    expect(io.logs.join('\n')).toMatch(/button, dialog/)
  })

  test('lists what is available when nothing is named', async () => {
    const io = makeIo()
    const code = await add(io, options({names: []}))

    expect(code).toBe(1)
    expect(io.logs.join('\n')).toMatch(/button, dialog/)
  })

  test('rejects an unsafe name without fetching anything', async () => {
    const spy = vi.fn(fetchJson)
    const io = makeIo({fetchJson: spy})

    const code = await add(io, options({names: ['../../etc/passwd']}))

    expect(code).toBe(1)
    expect(spy).not.toHaveBeenCalled()
  })

  test('writes nothing when one of several items cannot be fetched', async () => {
    const io = makeIo()

    const code = await add(io, options({names: ['button', 'carousel']}))

    expect(code).toBe(1)
    await expect(read('src/components/ui/button.tsx')).rejects.toThrow()
  })

  test('uses the configured registry base URL for fetches', async () => {
    const requested: string[] = []
    const trackingFetch: FetchJson = (url) => {
      requested.push(url)
      return fetchJson(url)
    }
    const io = makeIo({fetchJson: trackingFetch})

    await add(io, options({registry: 'https://r.test'}))

    expect(requested.length).toBeGreaterThan(0)
    for (const url of requested) {
      expect(url.startsWith('https://r.test/')).toBe(true)
    }
  })

  test('uses NAT_UI_REGISTRY_URL when no registry flag is passed', async () => {
    const requested: string[] = []
    const trackingFetch: FetchJson = (url) => {
      requested.push(url)
      return fetchJson(url)
    }
    const io = makeIo({
      fetchJson: trackingFetch,
      env: {NAT_UI_REGISTRY_URL: 'https://env-registry.test'},
    })

    await add(io, options({registry: undefined}))

    expect(requested.length).toBeGreaterThan(0)
    for (const url of requested) {
      expect(url.startsWith('https://env-registry.test/')).toBe(true)
    }
  })

  test('refuses unsupported file types without writing anything', async () => {
    const io = makeIo()
    const code = await add(io, options({names: ['mixed']}))

    expect(code).toBe(1)
    expect(io.logs.join('\n')).toMatch(/lib/)
    await expect(read('src/components/ui/button.tsx')).rejects.toThrow()
    await expect(read('src/components/ui/mixed.tsx')).rejects.toThrow()
  })

  test('reports a failed install with the command to run by hand', async () => {
    const io = makeIo({install: () => Promise.reject(new Error('offline'))})

    const code = await add(io, options())

    expect(code).toBe(1)
    expect(io.logs.join('\n')).toMatch(/Run this by hand/)
    // The files still landed; only the install failed.
    expect(await read('src/components/ui/button.tsx')).toBe(buttonSource)
  })
})
