import {describe, expect, test} from 'vitest'
import {undefinedCustomProperties} from './css-custom-properties'

describe('undefinedCustomProperties', () => {
  test('finds a property that is read but never defined', () => {
    expect(undefinedCustomProperties('.a{color:var(--ghost)}')).toEqual(['--ghost'])
  })

  test('accepts a property defined anywhere in the sheet', () => {
    expect(undefinedCustomProperties(':root{--brand:red}.a{color:var(--brand)}')).toEqual([])
  })

  test('accepts a property registered with @property, as Tailwind registers its own', () => {
    const css = '@property --tw-shadow{syntax:"*";inherits:false}.a{box-shadow:var(--tw-shadow)}'

    expect(undefinedCustomProperties(css)).toEqual([])
  })

  test('ignores a reference that supplies a fallback', () => {
    // `scale-[var(--press-scale,0.96)]` is correct code: `pressStyle` sets the
    // property inline per element, and the fallback is the deliberate default.
    expect(undefinedCustomProperties('.a{scale:var(--press-scale,0.96)}')).toEqual([])
  })

  test('reports each missing property once, sorted', () => {
    const css = '.a{color:var(--b)}.c{color:var(--a)}.d{background:var(--b)}'

    expect(undefinedCustomProperties(css)).toEqual(['--a', '--b'])
  })

  test('tolerates the whitespace a minifier leaves behind', () => {
    expect(undefinedCustomProperties('.a{color:var( --ghost )}')).toEqual(['--ghost'])
  })

  test('is not fooled by a property name appearing inside a string', () => {
    expect(undefinedCustomProperties('.a{content:"--ghost"}')).toEqual([])
  })
})
