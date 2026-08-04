import {describe, expect, test} from 'vitest'
import {DEFAULT_REGISTRY_URL, resolveBaseUrl} from './base-url'

describe('resolveBaseUrl', () => {
  test('falls back to the built-in default', () => {
    expect(resolveBaseUrl(undefined, {})).toBe(DEFAULT_REGISTRY_URL)
  })

  test('prefers the environment variable over the default', () => {
    expect(resolveBaseUrl(undefined, {NAT_UI_REGISTRY_URL: 'https://example.test/r'})).toBe(
      'https://example.test/r',
    )
  })

  test('prefers the flag over everything', () => {
    const env = {NAT_UI_REGISTRY_URL: 'https://env.test/r'}

    expect(resolveBaseUrl('https://flag.test/r', env)).toBe('https://flag.test/r')
  })

  test('ignores a blank override rather than producing an empty base', () => {
    expect(resolveBaseUrl('', {})).toBe(DEFAULT_REGISTRY_URL)
    expect(resolveBaseUrl(undefined, {NAT_UI_REGISTRY_URL: '  '})).toBe(DEFAULT_REGISTRY_URL)
  })

  test('drops a trailing slash so joining a name never doubles it', () => {
    expect(resolveBaseUrl('https://example.test/r/', {})).toBe('https://example.test/r')
  })

  test('ignores slash-only overrides', () => {
    expect(resolveBaseUrl('/', {})).toBe(DEFAULT_REGISTRY_URL)
    expect(resolveBaseUrl('///', {})).toBe(DEFAULT_REGISTRY_URL)
  })

  test('falls through to the environment when a slash-only flag is junk', () => {
    expect(resolveBaseUrl('///', {NAT_UI_REGISTRY_URL: 'https://good.test/r'})).toBe(
      'https://good.test/r',
    )
  })

  test('drops multiple trailing slashes', () => {
    expect(resolveBaseUrl('https://example.test/r///', {})).toBe('https://example.test/r')
  })
})
