import {join} from 'node:path'
import type {RegistryItem} from '@nat-ui/schema'
import {describe, expect, it, test} from 'vitest'
import {
  assertResolvableGraph,
  byName,
  danglingRegistryDependencies,
  importSpecifiers,
  normalizeNewlines,
  outputDirectories,
  packageNameOf,
  registryDependencyCycles,
  serialize,
  toIndex,
  toPayload,
  undeclaredDependencies,
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

  test('reports every dynamic alias import because the CLI only rewrites static imports', () => {
    const source = [
      "import('@/hooks/use-thing')",
      "import('@/lib/utils')",
      "import('lucide-react')",
    ].join('\n')

    expect(unsupportedAliasImports(source)).toEqual(['@/hooks/use-thing', '@/lib/utils'])
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
  test('sorts every item by name', () => {
    const index = toIndex([
      {...button, name: 'input'},
      {...button, name: 'aa'},
      {...button, name: 'a-b'},
    ])

    expect(index.items.map((entry) => entry.name)).toEqual(['a-b', 'aa', 'input'])
    expect(index.schemaVersion).toBe('1')
  })
})

describe('byName', () => {
  test('orders by code unit, not by locale', () => {
    // Not reachable through toIndex, whose names are schema-validated to
    // lowercase. Asserted directly because across [a-z0-9-] the two orderings
    // agree, so no valid item name could distinguish them -- and the whole
    // point is that the comparator must not vary with the runtime's locale.
    expect(byName({name: 'B'}, {name: 'a'})).toBeLessThan(0)
    expect('B'.localeCompare('a')).toBeGreaterThan(0)
  })
})

describe('serialize', () => {
  test('writes two-space JSON with a trailing newline', () => {
    expect(serialize({a: 1})).toBe('{\n  "a": 1\n}\n')
  })
})

describe('outputDirectories', () => {
  it('writes the committed copy and the copy the site serves', () => {
    // Built with `join` rather than written as POSIX literals: the function
    // joins too, so literals would assert this platform's separator and fail
    // the Windows leg of the matrix rather than testing where the paths land.
    expect(outputDirectories(join('/repo', 'packages', 'registry'))).toEqual([
      join('/repo', 'r'),
      join('/repo', 'apps', 'docs', 'public', 'r'),
    ])
  })
})

describe('packageNameOf', () => {
  it('returns the package name for a bare specifier', () => {
    expect(packageNameOf('clsx')).toBe('clsx')
  })

  it('keeps both segments of a scoped package', () => {
    expect(packageNameOf('@base-ui/react')).toBe('@base-ui/react')
  })

  it('strips a subpath from a scoped package', () => {
    expect(packageNameOf('@base-ui/react/button')).toBe('@base-ui/react')
  })

  it('strips a subpath from an unscoped package', () => {
    expect(packageNameOf('lucide-react/icons/x')).toBe('lucide-react')
  })

  it('ignores a relative import', () => {
    expect(packageNameOf('./sibling')).toBeUndefined()
  })

  it('ignores an alias import', () => {
    expect(packageNameOf('@/lib/utils')).toBeUndefined()
  })

  it('ignores a node builtin', () => {
    expect(packageNameOf('node:path')).toBeUndefined()
  })
})

describe('undeclaredDependencies', () => {
  it('finds an import that is not declared', () => {
    const source = "import clsx from 'clsx'\n"

    expect(undeclaredDependencies(source, [])).toEqual(['clsx'])
  })

  it('accepts an import that is declared', () => {
    const source = "import {Button} from '@base-ui/react/button'\n"

    expect(undeclaredDependencies(source, ['@base-ui/react'])).toEqual([])
  })

  it('allows react without a declaration, because consumers already have it', () => {
    const source = "import type {ComponentProps} from 'react'\nimport 'react-dom'\n"

    expect(undeclaredDependencies(source, [])).toEqual([])
  })

  it('ignores the utils alias, which init writes rather than installs', () => {
    const source = "import {cn} from '@/lib/utils'\n"

    expect(undeclaredDependencies(source, [])).toEqual([])
  })

  it('reports each missing package once', () => {
    const source = "import 'clsx'\nimport {x} from 'clsx'\n"

    expect(undeclaredDependencies(source, [])).toEqual(['clsx'])
  })

  it('reports a dynamically imported package that is not declared', () => {
    const source = "const {clsx} = await import('clsx')\n"

    expect(undeclaredDependencies(source, [])).toEqual(['clsx'])
  })

  it('accepts a dynamically imported package that is declared', () => {
    const source = "const {Button} = await import('@base-ui/react/button')\n"

    expect(undeclaredDependencies(source, ['@base-ui/react'])).toEqual([])
  })

  it('resolves a dynamic import subpath to the package name', () => {
    const source = "import('@base-ui/react/button')\n"

    expect(undeclaredDependencies(source, ['@base-ui/react'])).toEqual([])
  })

  it('ignores a dynamic alias import', () => {
    const source = "import('@/lib/utils')\n"

    expect(undeclaredDependencies(source, [])).toEqual([])
  })
})

const ui = (name: string, registryDependencies?: string[]): RegistryItem => ({
  name,
  type: 'ui',
  ...(registryDependencies === undefined ? {} : {registryDependencies}),
  files: [{path: `components/ui/${name}.tsx`, type: 'ui'}],
})

describe('danglingRegistryDependencies', () => {
  it('accepts a dependency the registry defines', () => {
    expect(danglingRegistryDependencies([ui('dialog', ['button']), ui('button')])).toEqual([])
  })

  it('reports a dependency nothing defines', () => {
    expect(danglingRegistryDependencies([ui('dialog', ['buton']), ui('button')])).toEqual([
      'dialog -> buton',
    ])
  })

  it('reports every offending pair', () => {
    expect(danglingRegistryDependencies([ui('a', ['x']), ui('b', ['y'])])).toEqual([
      'a -> x',
      'b -> y',
    ])
  })
})

describe('registryDependencyCycles', () => {
  it('accepts an acyclic graph', () => {
    expect(registryDependencyCycles([ui('dialog', ['button']), ui('button')])).toEqual([])
  })

  it('accepts a diamond, where a shared dependency is reached twice', () => {
    const all = [ui('a', ['b', 'c']), ui('b', ['d']), ui('c', ['d']), ui('d')]

    expect(registryDependencyCycles(all)).toEqual([])
  })

  it('reports a two-item cycle', () => {
    expect(registryDependencyCycles([ui('a', ['b']), ui('b', ['a'])])).toEqual(['a -> b -> a'])
  })

  it('reports an item depending on itself', () => {
    expect(registryDependencyCycles([ui('a', ['a'])])).toEqual(['a -> a'])
  })

  it('reports a longer cycle once, whichever item the walk starts from', () => {
    const all = [ui('b', ['c']), ui('c', ['a']), ui('a', ['b'])]

    expect(registryDependencyCycles(all)).toEqual(['a -> b -> c -> a'])
  })

  it('finds a cycle that no listed item leads into', () => {
    const all = [ui('entry', ['a']), ui('a', ['b']), ui('b', ['a'])]

    expect(registryDependencyCycles(all)).toEqual(['a -> b -> a'])
  })
})

describe('assertResolvableGraph', () => {
  it('accepts the graph the registry actually ships', () => {
    expect(() => {
      assertResolvableGraph([ui('dialog', ['button']), ui('button'), ui('input')])
    }).not.toThrow()
  })

  it('names the item and the dependency it cannot resolve', () => {
    expect(() => {
      assertResolvableGraph([ui('dialog', ['buton'])])
    }).toThrow(/dialog -> buton/)
  })

  it('refuses a cycle', () => {
    expect(() => {
      assertResolvableGraph([ui('a', ['b']), ui('b', ['a'])])
    }).toThrow(/cycle: a -> b -> a/)
  })
})

describe('toPayload dependency validation', () => {
  it('refuses a file importing a package the item does not declare', () => {
    const item: RegistryItem = {
      name: 'input',
      type: 'ui',
      dependencies: ['@base-ui/react'],
      files: [{path: 'components/ui/input.tsx', type: 'ui'}],
    }
    const read = () => "import clsx from 'clsx'\n"

    expect(() => toPayload(item, read)).toThrow(/clsx/)
  })

  it('accepts a file whose imports are all declared', () => {
    const item: RegistryItem = {
      name: 'input',
      type: 'ui',
      dependencies: ['@base-ui/react'],
      files: [{path: 'components/ui/input.tsx', type: 'ui'}],
    }
    const read = () => "import {Input} from '@base-ui/react/input'\n"

    expect(toPayload(item, read).files[0]?.content).toContain('@base-ui/react/input')
  })

  it('refuses a file dynamically importing a package the item does not declare', () => {
    const item: RegistryItem = {
      name: 'input',
      type: 'ui',
      dependencies: ['@base-ui/react'],
      files: [{path: 'components/ui/input.tsx', type: 'ui'}],
    }
    const read = () => "const {clsx} = await import('clsx')\n"

    expect(() => toPayload(item, read)).toThrow(/clsx/)
  })
})
