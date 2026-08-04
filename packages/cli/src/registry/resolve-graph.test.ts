import type {RegistryItemPayload} from '@nat-ui/schema'
import {describe, expect, test} from 'vitest'
import {resolveItems} from './resolve-graph'

const item = (name: string, registryDependencies: string[] = []): RegistryItemPayload => ({
  schemaVersion: '1',
  name,
  type: 'ui',
  registryDependencies,
  files: [{path: `components/ui/${name}.tsx`, type: 'ui', content: ''}],
})

const loaderFor = (items: readonly RegistryItemPayload[], calls: string[]) => {
  return (name: string): Promise<RegistryItemPayload> => {
    calls.push(name)
    const found = items.find((candidate) => candidate.name === name)
    if (found === undefined) return Promise.reject(new Error(`missing ${name}`))

    return Promise.resolve(found)
  }
}

describe('resolveItems', () => {
  test('returns a single item with no dependencies', async () => {
    const calls: string[] = []
    const resolved = await resolveItems(['button'], loaderFor([item('button')], calls))

    expect(resolved.map((entry) => entry.name)).toEqual(['button'])
  })

  test('puts dependencies before the items that need them', async () => {
    const calls: string[] = []
    const items = [item('dialog', ['button']), item('button')]

    const resolved = await resolveItems(['dialog'], loaderFor(items, calls))

    expect(resolved.map((entry) => entry.name)).toEqual(['button', 'dialog'])
  })

  test('resolves transitively', async () => {
    const calls: string[] = []
    const items = [item('a', ['b']), item('b', ['c']), item('c')]

    const resolved = await resolveItems(['a'], loaderFor(items, calls))

    expect(resolved.map((entry) => entry.name)).toEqual(['c', 'b', 'a'])
  })

  test('fetches a shared dependency once', async () => {
    const calls: string[] = []
    const items = [item('dialog', ['button']), item('sheet', ['button']), item('button')]

    const resolved = await resolveItems(['dialog', 'sheet'], loaderFor(items, calls))

    expect(calls.filter((name) => name === 'button')).toHaveLength(1)
    expect(resolved.map((entry) => entry.name)).toEqual(['button', 'dialog', 'sheet'])
  })

  test('does not repeat an item named twice', async () => {
    const calls: string[] = []
    const resolved = await resolveItems(['button', 'button'], loaderFor([item('button')], calls))

    expect(resolved.map((entry) => entry.name)).toEqual(['button'])
  })

  test('reports a cycle instead of looping forever', async () => {
    const calls: string[] = []
    const items = [item('a', ['b']), item('b', ['a'])]

    await expect(resolveItems(['a'], loaderFor(items, calls))).rejects.toThrow(/cycle: a -> b -> a/)
  })

  test('resolves a diamond without reporting a cycle', async () => {
    const calls: string[] = []
    const items = [item('a', ['b', 'c']), item('b', ['d']), item('c', ['d']), item('d')]

    const resolved = await resolveItems(['a'], loaderFor(items, calls))

    expect(calls.filter((name) => name === 'd')).toHaveLength(1)
    expect(resolved.map((entry) => entry.name)).toEqual(['d', 'b', 'c', 'a'])
  })
})
