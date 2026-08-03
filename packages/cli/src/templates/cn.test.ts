import {describe, expect, test} from 'vitest'
import {cnTemplate} from './cn'

describe('cnTemplate', () => {
  test('exports cn and imports both helpers in either language', () => {
    for (const tsx of [true, false]) {
      const source = cnTemplate(tsx)

      expect(source).toContain('export function cn(')
      expect(source).toContain("from 'clsx'")
      expect(source).toContain("from 'tailwind-merge'")
      expect(source.endsWith('\n')).toBe(true)
    }
  })

  test('annotates types only for TypeScript', () => {
    expect(cnTemplate(true)).toContain('ClassValue')
    expect(cnTemplate(false)).not.toContain('ClassValue')
  })
})
