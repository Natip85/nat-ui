import {describe, expect, it} from 'vitest'

import {findUnresolvedSpecifiers} from './manifest'

describe('findUnresolvedSpecifiers', () => {
  it('accepts a manifest whose specifiers are all resolved', () => {
    expect(
      findUnresolvedSpecifiers({
        dependencies: {},
        devDependencies: {zod: '^4.4.3', '@nat-ui/schema': '0.0.0'},
      }),
    ).toEqual([])
  })

  it('flags a catalog: specifier', () => {
    expect(findUnresolvedSpecifiers({devDependencies: {zod: 'catalog:'}})).toEqual([
      {field: 'devDependencies', name: 'zod', specifier: 'catalog:'},
    ])
  })

  it('flags a named catalog specifier', () => {
    expect(findUnresolvedSpecifiers({devDependencies: {zod: 'catalog:react19'}})).toEqual([
      {field: 'devDependencies', name: 'zod', specifier: 'catalog:react19'},
    ])
  })

  it('flags a workspace: specifier', () => {
    expect(findUnresolvedSpecifiers({dependencies: {'@nat-ui/schema': 'workspace:*'}})).toEqual([
      {field: 'dependencies', name: '@nat-ui/schema', specifier: 'workspace:*'},
    ])
  })

  it('checks every dependency field, not just runtime dependencies', () => {
    const found = findUnresolvedSpecifiers({
      dependencies: {a: 'catalog:'},
      devDependencies: {b: 'workspace:*'},
      peerDependencies: {c: 'catalog:'},
      optionalDependencies: {d: 'workspace:^'},
    })

    expect(found.map((entry) => entry.field)).toEqual([
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ])
  })

  it('ignores fields that are absent or not objects, and non-string specifiers', () => {
    expect(findUnresolvedSpecifiers({dependencies: null, devDependencies: {a: 3}})).toEqual([])
  })

  it('tolerates a manifest that is not an object', () => {
    expect(findUnresolvedSpecifiers('not a manifest')).toEqual([])
  })
})
