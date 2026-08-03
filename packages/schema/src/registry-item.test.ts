import {describe, expect, test} from 'vitest'
import {registryItemSchema} from './registry-item'

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
