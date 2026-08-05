import type {RegistryItemPayload} from '@nat-ui/schema'
import {describe, expect, it} from 'vitest'
import {resolvePayloads} from './registry-payload'

const payload = (name: string, registryDependencies: string[] = []): RegistryItemPayload => ({
  schemaVersion: '1',
  name,
  type: 'ui',
  registryDependencies,
  files: [{path: `components/ui/${name}.tsx`, type: 'ui', content: ''}],
})

const loading =
  (payloads: readonly RegistryItemPayload[]) =>
  (name: string): Promise<RegistryItemPayload> => {
    const found = payloads.find((candidate) => candidate.name === name)
    if (found === undefined) return Promise.reject(new Error(`No document for "${name}".`))

    return Promise.resolve(found)
  }

/**
 * The page's Manual instructions are only honest if they list what `add` writes,
 * in the order `add` writes it, and refuse whatever `add` refuses.
 */
describe('resolvePayloads', () => {
  it('lists dependencies before the item that names them', async () => {
    const resolved = await resolvePayloads(
      'dialog',
      loading([payload('dialog', ['button']), payload('button')]),
    )

    expect(resolved.map((entry) => entry.name)).toEqual(['button', 'dialog'])
  })

  it('lists a shared dependency once', async () => {
    const resolved = await resolvePayloads(
      'a',
      loading([payload('a', ['b', 'c']), payload('b', ['d']), payload('c', ['d']), payload('d')]),
    )

    expect(resolved.map((entry) => entry.name)).toEqual(['d', 'b', 'c', 'a'])
  })

  it('refuses a cycle rather than rendering an install the CLI would not perform', async () => {
    await expect(
      resolvePayloads('a', loading([payload('a', ['b']), payload('b', ['a'])])),
    ).rejects.toThrow(/cycle: a -> b -> a/)
  })
})
