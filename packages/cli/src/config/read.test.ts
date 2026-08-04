import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {CONFIG_FILE_NAME} from '@nat-ui/schema'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import {readConfig} from './read'

let cwd = ''

const valid = {
  rsc: true,
  tsx: true,
  tailwind: {css: 'src/app/globals.css', baseColor: 'neutral'},
  aliases: {components: '@/components', utils: '@/lib/utils', ui: '@/components/ui'},
}

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'nat-ui-read-'))
})

afterEach(async () => {
  await rm(cwd, {recursive: true, force: true})
})

describe('readConfig', () => {
  test('reports a missing file distinctly', async () => {
    expect(await readConfig(cwd)).toEqual({status: 'missing'})
  })

  test('parses a valid config', async () => {
    await writeFile(join(cwd, CONFIG_FILE_NAME), JSON.stringify(valid))

    const result = await readConfig(cwd)

    expect(result.status).toBe('ok')
    expect(result.status === 'ok' && result.config.aliases.ui).toBe('@/components/ui')
  })

  test('reports malformed JSON', async () => {
    await writeFile(join(cwd, CONFIG_FILE_NAME), '{nope')

    const result = await readConfig(cwd)

    expect(result.status).toBe('invalid')
    expect(result.status === 'invalid' && result.message).toMatch(/not valid JSON/)
  })

  test('reports a config that does not match the schema', async () => {
    const {aliases: _aliases, ...withoutAliases} = valid
    await writeFile(join(cwd, CONFIG_FILE_NAME), JSON.stringify(withoutAliases))

    const result = await readConfig(cwd)

    expect(result.status).toBe('invalid')
    expect(result.status === 'invalid' && result.message).toMatch(/aliases/)
  })
})
