import {describe, expect, test} from 'vitest'
import {assertValidItemName} from './item-name'

describe('assertValidItemName', () => {
  test('accepts lowercase hyphenated names', () => {
    expect(() => {
      assertValidItemName('button')
    }).not.toThrow()
    expect(() => {
      assertValidItemName('alert-dialog')
    }).not.toThrow()
  })

  test('rejects anything that could escape a URL or a path', () => {
    for (const name of ['', '..', '../etc/passwd', 'a/b', 'Button', 'https://x', 'a b']) {
      expect(() => {
        assertValidItemName(name)
      }).toThrow(/not a valid component name/)
    }
  })
})
