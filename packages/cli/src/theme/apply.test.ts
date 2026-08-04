import {describe, expect, test} from 'vitest'
import {THEME_END, THEME_START, applyTheme} from './apply'
import {PRESETS} from './presets'

const withImport = "@import 'tailwindcss';\n\n.app {\n  color: red;\n}\n"

const countOf = (haystack: string, needle: string): number => haystack.split(needle).length - 1

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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

  test('refuses a stylesheet carrying only the start marker', () => {
    const damaged = applyTheme(withImport, PRESETS.neutral).replace(THEME_START, '')

    expect(() => applyTheme(damaged, PRESETS.slate)).toThrow(/nat-ui theme/)
  })

  test('refuses a stylesheet carrying only the end marker', () => {
    const damaged = applyTheme(withImport, PRESETS.neutral).replace(THEME_END, '')

    expect(() => applyTheme(damaged, PRESETS.slate)).toThrow(/nat-ui theme/)
  })

  test('refuses markers in the wrong order', () => {
    const damaged = `${THEME_END}\n:root {\n}\n${THEME_START}\n`

    expect(() => applyTheme(damaged, PRESETS.neutral)).toThrow(/nat-ui theme/)
  })

  test('names both markers in the error, so the user can find them', () => {
    const damaged = applyTheme(withImport, PRESETS.neutral).replace(THEME_START, '')

    expect(() => applyTheme(damaged, PRESETS.slate)).toThrow(
      new RegExp(`${escapeRegExp(THEME_START)}[\\s\\S]*${escapeRegExp(THEME_END)}`),
    )
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

  test('refuses a stylesheet carrying two complete theme blocks', () => {
    const once = applyTheme(withImport, PRESETS.neutral)
    const duplicated = once + '\n' + once.slice(once.indexOf(THEME_START))

    expect(() => applyTheme(duplicated, PRESETS.slate)).toThrow(/nat-ui theme/)
  })

  test('names both markers in the two-block error too', () => {
    const once = applyTheme(withImport, PRESETS.neutral)
    const duplicated = once + '\n' + once.slice(once.indexOf(THEME_START))

    expect(() => applyTheme(duplicated, PRESETS.slate)).toThrow(
      new RegExp(`${escapeRegExp(THEME_START)}[\\s\\S]*${escapeRegExp(THEME_END)}`),
    )
  })

  test('keeps CRLF endings throughout, including the injected block', () => {
    const crlf = withImport.replace(/\n/g, '\r\n')
    const result = applyTheme(crlf, PRESETS.neutral)

    // Every line ending is \r\n -- no lone \n survives once all \r\n pairs are stripped.
    expect(result.replace(/\r\n/g, '')).not.toContain('\n')
    expect(result).toContain('\r\n' + THEME_START)
  })

  test('is idempotent for CRLF input, byte for byte', () => {
    const crlf = withImport.replace(/\n/g, '\r\n')
    const once = applyTheme(crlf, PRESETS.neutral)
    const twice = applyTheme(once, PRESETS.neutral)

    expect(twice).toBe(once)
  })

  test('keeps a leading BOM at byte zero when the block is prepended', () => {
    const bom = '\uFEFF'
    const result = applyTheme(`${bom}.app {\n  color: red;\n}\n`, PRESETS.neutral)

    expect(result.charCodeAt(0)).toBe(0xfeff)
    expect(result.indexOf(THEME_START)).toBe(1)
  })

  test('keeps a leading BOM at byte zero when inserted after the tailwindcss import', () => {
    const bom = '\uFEFF'
    const result = applyTheme(`${bom}${withImport}`, PRESETS.neutral)

    expect(result.charCodeAt(0)).toBe(0xfeff)
    expect(result.indexOf('tailwindcss')).toBeGreaterThan(0)
    expect(result.indexOf('tailwindcss')).toBeLessThan(result.indexOf(THEME_START))
  })

  test('keeps a leading BOM at byte zero when an existing block is replaced', () => {
    const bom = '\uFEFF'
    const asNeutral = applyTheme(`${bom}${withImport}`, PRESETS.neutral)
    const asSlate = applyTheme(asNeutral, PRESETS.slate)

    expect(asSlate.charCodeAt(0)).toBe(0xfeff)
  })
})
