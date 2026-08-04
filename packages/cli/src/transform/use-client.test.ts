import {describe, expect, test} from 'vitest'
import {applyClientDirective} from './use-client'

const withDirective = "'use client'\n\nimport {a} from 'b'\n"

describe('applyClientDirective', () => {
  test('keeps the directive for a React Server Components project', () => {
    expect(applyClientDirective(withDirective, true)).toBe(withDirective)
  })

  test('removes the directive and its blank line otherwise', () => {
    expect(applyClientDirective(withDirective, false)).toBe("import {a} from 'b'\n")
  })

  test('handles double quotes and a semicolon', () => {
    expect(applyClientDirective('"use client";\n\nconst a = 1\n', false)).toBe('const a = 1\n')
  })

  test('leaves a file without a directive untouched', () => {
    const source = "import {a} from 'b'\n"

    expect(applyClientDirective(source, false)).toBe(source)
    expect(applyClientDirective(source, true)).toBe(source)
  })

  test('only strips a directive at the top of the file', () => {
    const source = "const a = 1\n'use client'\n"

    expect(applyClientDirective(source, false)).toBe(source)
  })

  test('removes a directive-only file with no trailing newline', () => {
    expect(applyClientDirective("'use client'", false)).toBe('')
  })

  test('removes leading blank lines along with the directive', () => {
    const source = "\n\n'use client'\n\nimport {a} from 'b'\n"

    expect(applyClientDirective(source, false)).toBe("import {a} from 'b'\n")
  })
})
