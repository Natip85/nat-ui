import type {RegistryItem} from '@nat-ui/schema'
import {describe, expect, test} from 'vitest'
import {
  importSpecifiers,
  normalizeNewlines,
  serialize,
  toIndex,
  toPayload,
  unsupportedAliasImports,
} from './build-registry'

const button: RegistryItem = {
  name: 'button',
  type: 'ui',
  dependencies: ['@base-ui/react'],
  files: [{path: 'components/ui/button.tsx', type: 'ui'}],
}

const reading =
  (contents: string) =>
  (_path: string): string =>
    contents

describe('normalizeNewlines', () => {
  test('turns CRLF into LF so output is identical on every platform', () => {
    expect(normalizeNewlines('a\r\nb\r\n')).toBe('a\nb\n')
    expect(normalizeNewlines('a\nb\n')).toBe('a\nb\n')
  })
})

describe('importSpecifiers', () => {
  test('finds import, side-effect import, and re-export specifiers', () => {
    const source = [
      "import {cn} from '@/lib/utils'",
      "import '@/styles.css'",
      "export {x} from './x'",
      'const notAnImport = "@/lib/nope"',
    ].join('\n')

    const found = importSpecifiers(source)

    expect(found).toContain('@/lib/utils')
    expect(found).toContain('@/styles.css')
    expect(found).toContain('./x')
    expect(found).not.toContain('@/lib/nope')
  })
})

describe('unsupportedAliasImports', () => {
  test('accepts the shapes the CLI can rewrite', () => {
    const source = [
      "import {cn} from '@/lib/utils'",
      "import {buttonVariants} from '@/components/ui/button'",
      "import {Dialog} from '@base-ui/react/dialog'",
    ].join('\n')

    expect(unsupportedAliasImports(source)).toEqual([])
  })

  test('reports an alias import the CLI would leave broken', () => {
    const source = "import {thing} from '@/hooks/use-thing'"

    expect(unsupportedAliasImports(source)).toEqual(['@/hooks/use-thing'])
  })
})

describe('toPayload', () => {
  test('embeds the file contents and the schema version', () => {
    const payload = toPayload(button, reading("import {cn} from '@/lib/utils'\n"))

    expect(payload.schemaVersion).toBe('1')
    expect(payload.name).toBe('button')
    expect(payload.files[0]?.content).toBe("import {cn} from '@/lib/utils'\n")
  })

  test('normalises newlines in embedded content', () => {
    const payload = toPayload(button, reading('a\r\nb\r\n'))

    expect(payload.files[0]?.content).toBe('a\nb\n')
  })

  test('refuses an item the CLI could not install', () => {
    const asLib: RegistryItem = {...button, type: 'lib'}
    const fileAsLib: RegistryItem = {
      ...button,
      files: [{path: 'lib/thing.ts', type: 'lib'}],
    }

    expect(() => toPayload(asLib, reading(''))).toThrow(/only "ui"/)
    expect(() => toPayload(fileAsLib, reading(''))).toThrow(/only "ui"/)
  })

  test('refuses an import the rewriter does not understand', () => {
    expect(() => toPayload(button, reading("import x from '@/hooks/use-x'\n"))).toThrow(
      /@\/hooks\/use-x/,
    )
  })
})

describe('toIndex', () => {
  test('lists every item sorted by name', () => {
    const index = toIndex([
      {...button, name: 'input'},
      {...button, name: 'button'},
      {...button, name: 'dialog'},
    ])

    expect(index.items.map((entry) => entry.name)).toEqual(['button', 'dialog', 'input'])
    expect(index.schemaVersion).toBe('1')
  })
})

describe('serialize', () => {
  test('writes two-space JSON with a trailing newline', () => {
    expect(serialize({a: 1})).toBe('{\n  "a": 1\n}\n')
  })
})
