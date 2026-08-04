import {describe, expect, test} from 'vitest'
import {
  registryIndexSchema,
  registryItemNameSchema,
  registryItemPayloadSchema,
  registryItemSchema,
} from './registry-item'

const button = {
  name: 'button',
  type: 'ui',
  files: [{path: 'ui/button.tsx', type: 'ui'}],
} as const

describe('registryItemSchema', () => {
  test('accepts a minimal ui item', () => {
    const result = registryItemSchema.safeParse(button)

    expect(result.success).toBe(true)
  })

  test('rejects an item whose type is not a known item type', () => {
    const result = registryItemSchema.safeParse({...button, type: 'registry:ui'})

    expect(result.success).toBe(false)
  })

  test('rejects unknown top-level keys so registry typos fail loudly', () => {
    const result = registryItemSchema.safeParse({...button, dependancies: ['clsx']})

    expect(result.success).toBe(false)
  })

  test('requires at least one file, since an item that installs nothing is a mistake', () => {
    const result = registryItemSchema.safeParse({...button, files: []})

    expect(result.success).toBe(false)
  })

  test('keeps npm dependencies and registry dependencies as separate lists', () => {
    const result = registryItemSchema.safeParse({
      ...button,
      dependencies: ['@base-ui/react'],
      registryDependencies: ['cn'],
    })

    expect(result.success).toBe(true)
  })
})

// These paths become write destinations inside someone else's project, so a
// hostile or typo'd registry must not be able to escape the target directory.
describe('registryItemSchema file path safety', () => {
  const withPath = (path: string) => ({...button, files: [{path, type: 'ui'}]})

  test('accepts an ordinary nested relative path', () => {
    expect(registryItemSchema.safeParse(withPath('ui/button.tsx')).success).toBe(true)
  })

  test('rejects a path that climbs out of the registry root', () => {
    expect(registryItemSchema.safeParse(withPath('../../../etc/passwd')).success).toBe(false)
  })

  test('rejects a path that hides the climb in the middle', () => {
    expect(registryItemSchema.safeParse(withPath('ui/../../../etc/passwd')).success).toBe(false)
  })

  test('rejects an absolute path', () => {
    expect(registryItemSchema.safeParse(withPath('/etc/passwd')).success).toBe(false)
  })

  test('rejects a windows style absolute path', () => {
    expect(registryItemSchema.safeParse(withPath('C:\\Windows\\System32')).success).toBe(false)
  })
})

describe('registryItemNameSchema', () => {
  test('accepts lowercase hyphenated names', () => {
    expect(registryItemNameSchema.safeParse('button').success).toBe(true)
    expect(registryItemNameSchema.safeParse('alert-dialog').success).toBe(true)
    expect(registryItemNameSchema.safeParse('h1').success).toBe(true)
  })

  test('rejects anything that could escape a URL or a path', () => {
    for (const name of ['', '..', '../etc', 'a/b', 'Button', 'a--b', '-a', 'a-', 'a b']) {
      expect(registryItemNameSchema.safeParse(name).success).toBe(false)
    }
  })
})

describe('registryItemPayloadSchema', () => {
  const payload = {
    schemaVersion: '1',
    name: 'button',
    type: 'ui',
    dependencies: ['@base-ui/react'],
    files: [{path: 'ui/button.tsx', type: 'ui', content: 'export const Button = () => null\n'}],
  }

  test('accepts a well-formed payload', () => {
    expect(registryItemPayloadSchema.safeParse(payload).success).toBe(true)
  })

  test('rejects a schema version it does not understand', () => {
    expect(registryItemPayloadSchema.safeParse({...payload, schemaVersion: '2'}).success).toBe(
      false,
    )
  })

  test('requires content on every file', () => {
    const withoutContent = {...payload, files: [{path: 'ui/button.tsx', type: 'ui'}]}

    expect(registryItemPayloadSchema.safeParse(withoutContent).success).toBe(false)
  })

  test('still rejects unsafe paths and unknown keys', () => {
    const escaping = {...payload, files: [{path: '../x.tsx', type: 'ui', content: ''}]}
    const absolute = {...payload, files: [{path: '/x.tsx', type: 'ui', content: ''}]}

    expect(registryItemPayloadSchema.safeParse(escaping).success).toBe(false)
    expect(registryItemPayloadSchema.safeParse(absolute).success).toBe(false)
    expect(registryItemPayloadSchema.safeParse({...payload, extra: 1}).success).toBe(false)
  })

  test('rejects a name the pattern forbids', () => {
    expect(registryItemPayloadSchema.safeParse({...payload, name: '../evil'}).success).toBe(false)
  })
})

describe('registryIndexSchema', () => {
  test('accepts an index and rejects a bad entry', () => {
    const index = {schemaVersion: '1', items: [{name: 'button', type: 'ui'}]}

    expect(registryIndexSchema.safeParse(index).success).toBe(true)
    expect(
      registryIndexSchema.safeParse({schemaVersion: '1', items: [{name: 'button'}]}).success,
    ).toBe(false)
  })
})
