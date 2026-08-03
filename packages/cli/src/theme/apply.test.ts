import {describe, expect, test} from 'vitest'
import {THEME_END, THEME_START, applyTheme} from './apply'
import {PRESETS} from './presets'

const withImport = "@import 'tailwindcss';\n\n.app {\n  color: red;\n}\n"

const countOf = (haystack: string, needle: string): number => haystack.split(needle).length - 1

describe('applyTheme', () => {
  test('inserts a marked block after the tailwindcss import', () => {
    const result = applyTheme(withImport, PRESETS.neutral)

    expect(result).toContain(THEME_START)
    expect(result).toContain(THEME_END)
    expect(result.indexOf('tailwindcss')).toBeLessThan(result.indexOf(THEME_START))
  })

  test('keeps the rest of the stylesheet', () => {
    const result = applyTheme(withImport, PRESETS.neutral)

    expect(result).toContain('.app {')
    expect(result).toContain('color: red;')
  })

  test('writes tokens for both themes', () => {
    const result = applyTheme(withImport, PRESETS.neutral)

    expect(result).toContain('--background: oklch(1 0 0);')
    expect(result).toContain(':root')
    expect(result).toContain('.dark')
  })

  test('is idempotent, so re-running never appends a second block', () => {
    const once = applyTheme(withImport, PRESETS.neutral)
    const twice = applyTheme(once, PRESETS.neutral)

    expect(twice).toBe(once)
    expect(countOf(twice, THEME_START)).toBe(1)
  })

  test('replaces an existing block when the preset changes', () => {
    const asNeutral = applyTheme(withImport, PRESETS.neutral)
    const asSlate = applyTheme(asNeutral, PRESETS.slate)

    expect(countOf(asSlate, THEME_START)).toBe(1)
    expect(asSlate).toContain('--foreground: oklch(0.129 0.042 264.695);')
    expect(asSlate).not.toContain('--foreground: oklch(0.145 0 0);')
  })

  test('prepends when the stylesheet has no tailwindcss import', () => {
    const result = applyTheme('.app {\n  color: red;\n}\n', PRESETS.neutral)

    expect(result.indexOf(THEME_START)).toBe(0)
    expect(result).toContain('.app {')
  })

  test('accepts a double-quoted import too', () => {
    const result = applyTheme('@import "tailwindcss";\n', PRESETS.neutral)

    expect(result.indexOf('tailwindcss')).toBeLessThan(result.indexOf(THEME_START))
  })
})
