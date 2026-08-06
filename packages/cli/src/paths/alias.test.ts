import {join} from 'node:path'
import {describe, expect, test} from 'vitest'
import {aliasBaseDir, aliasDirOf, aliasPrefixOf, aliasToPath, isWithinRoot} from './alias'

describe('isWithinRoot', () => {
  test('accepts a path inside the root', () => {
    expect(isWithinRoot('/p', join('/p', 'src', 'a.css'))).toBe(true)
  })

  test('rejects a path that climbs out', () => {
    expect(isWithinRoot('/p', join('/p', '..', 'a.css'))).toBe(false)
  })

  test('does not mistake a directory beginning with dots for an escape', () => {
    expect(isWithinRoot('/p', join('/p', '..styles', 'a.css'))).toBe(true)
  })
})

describe('aliasPrefixOf', () => {
  test('takes everything before the first slash', () => {
    expect(aliasPrefixOf('@/components/ui')).toBe('@')
    expect(aliasPrefixOf('~/ui')).toBe('~')
  })

  test('returns the whole alias when there is no slash', () => {
    expect(aliasPrefixOf('@')).toBe('@')
  })
})

describe('aliasToPath', () => {
  test('strips the prefix and joins onto the base directory', () => {
    expect(aliasToPath('@/components/ui', '@', 'src')).toBe(join('src', 'components', 'ui'))
  })

  test('handles an empty base directory', () => {
    expect(aliasToPath('@/lib/utils', '@', '')).toBe(join('lib', 'utils'))
  })

  test('leaves an alias that does not carry the prefix alone', () => {
    expect(aliasToPath('components/ui', '@', 'src')).toBe(join('src', 'components', 'ui'))
  })

  test('reads a bare prefix as the base directory itself', () => {
    // What `aliasDirOf` returns for a single-segment alias such as `@/utils`.
    // Joining the prefix on as a segment would write files into a directory
    // named `@`, and `add` would report success while the rewritten import
    // pointed at nothing.
    expect(aliasToPath('@', '@', 'src')).toBe('src')
  })
})

describe('aliasBaseDir', () => {
  test("prefers tsconfig's target for the prefix", () => {
    const targets = [{prefix: '@', targetDir: 'src'}]

    expect(aliasBaseDir('/p', targets, '@', 'app/globals.css')).toBe('src')
  })

  test('guesses from the stylesheet when nothing maps the prefix', () => {
    expect(aliasBaseDir('/p', [], '@', 'src/app/globals.css')).toBe('src')
    expect(aliasBaseDir('/p', [], '@', 'app/globals.css')).toBe('')
  })

  test('discards a target that points outside the project', () => {
    const targets = [{prefix: '@', targetDir: join('..', 'elsewhere')}]

    expect(aliasBaseDir('/p', targets, '@', 'src/app/globals.css')).toBe('src')
  })
})

describe('aliasDirOf', () => {
  test('returns the directory an aliased file sits in', () => {
    expect(aliasDirOf('@/lib/utils')).toBe('@/lib')
  })

  test('handles a nested alias', () => {
    expect(aliasDirOf('~/src/helpers/cn')).toBe('~/src/helpers')
  })

  test('ignores trailing slashes', () => {
    expect(aliasDirOf('@/lib/utils//')).toBe('@/lib')
  })

  test('returns the alias itself when there is no directory part', () => {
    expect(aliasDirOf('utils')).toBe('utils')
  })
})
