import type {RegistryItemPayload} from '@nat-ui/schema'
import {describe, expect, test} from 'vitest'
import type {RegistrySourceItem} from '../src/index'
import {DEFAULT_SHADCN_BASE_URL, SHADCN_SCHEMA_URL, shadcnTypeOf, toShadcnItem} from './shadcn'

const source: RegistrySourceItem = {
  name: 'button',
  type: 'ui',
  title: 'Button',
  description: 'A button.',
  dependencies: ['@base-ui/react'],
  registryDependencies: ['motion'],
  files: [{path: 'components/ui/button.tsx', type: 'ui'}],
}

// Annotated rather than `as const`: `RegistryItemPayload`'s arrays are
// mutable, and a `readonly` literal is not assignable to them.
const payload: RegistryItemPayload = {
  schemaVersion: '1',
  name: 'button',
  type: 'ui',
  dependencies: ['@base-ui/react'],
  registryDependencies: ['motion'],
  files: [{path: 'components/ui/button.tsx', type: 'ui', content: 'export const Button = 1\n'}],
}

const known = new Set(['button', 'motion'])

// The other tests here compare against the constant, so they would follow it
// anywhere. This is what actually ends up in every published document when
// no override is set, and the production deploy build never sets one, so
// pin the literal and make changing it deliberate.
test('DEFAULT_SHADCN_BASE_URL points at the deployed shadcn registry', () => {
  expect(DEFAULT_SHADCN_BASE_URL).toBe('https://nat-ui-delta.vercel.app/s')
})

describe('shadcnTypeOf', () => {
  test('namespaces both installable types', () => {
    expect(shadcnTypeOf('ui')).toBe('registry:ui')
    expect(shadcnTypeOf('lib')).toBe('registry:lib')
  })

  test('refuses a type the registry cannot install', () => {
    expect(() => shadcnTypeOf('block')).toThrow(/block/)
  })
})

describe('toShadcnItem', () => {
  test('carries the schema url, metadata, and file contents', () => {
    const item = toShadcnItem(source, payload, DEFAULT_SHADCN_BASE_URL, known)

    expect(item.$schema).toBe(SHADCN_SCHEMA_URL)
    expect(item.name).toBe('button')
    expect(item.type).toBe('registry:ui')
    expect(item.title).toBe('Button')
    expect(item.description).toBe('A button.')
    expect(item.dependencies).toEqual(['@base-ui/react'])
    expect(item.files).toEqual([
      {
        path: 'components/ui/button.tsx',
        type: 'registry:ui',
        content: 'export const Button = 1\n',
      },
    ])
  })

  test('rewrites our own registry dependencies to absolute urls', () => {
    // Not `@nat-ui/motion`: a namespaced reference only resolves when the user
    // has configured the namespace in components.json, and the install path we
    // expect most people to take is a bare URL with no configuration at all.
    // An absolute URL resolves under both.
    const item = toShadcnItem(source, payload, 'https://example.test/s', known)

    expect(item.registryDependencies).toEqual(['https://example.test/s/motion.json'])
  })

  test('leaves a plain shadcn dependency alone', () => {
    // `input` is shadcn's, not ours. Rewriting it to a nat-ui URL would 404.
    // `assertResolvableGraph` in build-registry.ts throws on a
    // registryDependencies name this registry does not define, so no item
    // can reach this passthrough in the build today -- it exists for the day
    // that check learns to allow an external name, at which point this is
    // already the right thing to do with it.
    const dependent: RegistrySourceItem = {...source, registryDependencies: ['motion', 'input']}
    const item = toShadcnItem(dependent, payload, 'https://example.test/s', known)

    expect(item.registryDependencies).toEqual(['https://example.test/s/motion.json', 'input'])
  })

  test('omits absent optional keys rather than emitting empty arrays', () => {
    const bare: RegistrySourceItem = {
      name: 'motion',
      type: 'lib',
      title: 'Motion',
      description: 'Springs.',
      files: [{path: 'lib/motion.ts', type: 'lib'}],
    }
    const barePayload: RegistryItemPayload = {
      schemaVersion: '1',
      name: 'motion',
      type: 'lib',
      files: [{path: 'lib/motion.ts', type: 'lib', content: 'export const x = 1\n'}],
    }

    const item = toShadcnItem(bare, barePayload, DEFAULT_SHADCN_BASE_URL, known)

    expect(item).not.toHaveProperty('dependencies')
    expect(item).not.toHaveProperty('registryDependencies')
  })
})
