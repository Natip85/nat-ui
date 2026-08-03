import {describe, expect, test} from 'vitest'
import {help, run} from './index'

describe('help', () => {
  test('documents both commands and the version flag', () => {
    expect(help).toContain('init')
    expect(help).toContain('add')
    expect(help).toContain('--version')
  })
})

describe('run', () => {
  test('prints help and succeeds with no arguments', async () => {
    const lines: string[] = []

    expect(await run([], (message) => lines.push(message))).toBe(0)
    expect(lines.join('\n')).toContain('Usage')
  })

  test('prints the version for -v and --version', async () => {
    for (const flag of ['-v', '--version']) {
      const lines: string[] = []

      expect(await run([flag], (message) => lines.push(message))).toBe(0)
      expect(lines.join('\n')).toMatch(/^\d+\.\d+\.\d+/)
    }
  })

  test('rejects an unknown command with a non-zero code', async () => {
    const lines: string[] = []

    expect(await run(['nope'], (message) => lines.push(message))).toBe(1)
    expect(lines.join('\n')).toContain('nope')
  })
})
