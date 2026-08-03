import {describe, expect, test} from 'vitest'
import {help, run} from './index'

describe('help', () => {
  test('documents both commands and the version flag', () => {
    expect(help).toContain('init')
    expect(help).toContain('add')
    expect(help).toContain('--version')
  })

  test('documents the -y shorthand alongside --yes', () => {
    expect(help).toContain('-y, --yes')
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

  test('accepts -y as a shorthand for --yes without erroring', async () => {
    for (const flag of ['-y', '--yes']) {
      const lines: string[] = []

      // Pairing the flag with an unknown command proves parseArgs actually
      // recognized it and reached command dispatch, rather than merely
      // falling through to the help path with no positionals at all: if `-y`
      // were still unmapped, strict parsing would reject it as an unknown
      // option before "nope" was ever reached, and the message would say
      // "Unknown option" instead of "Unknown command".
      expect(await run([flag, 'nope'], (message) => lines.push(message))).toBe(1)
      expect(lines.join('\n')).toContain('Unknown command: nope')
    }
  })

  test('rejects an unknown long flag with exit code 1 and a helpful message', async () => {
    const lines: string[] = []

    expect(await run(['--yse'], (message) => lines.push(message))).toBe(1)
    expect(lines.join('\n')).toContain("Unknown option '--yse'.")
    expect(lines.join('\n')).toContain('Usage')
    // Node's own message goes on to suggest passing the flag after `--`, which
    // only applies to positionals and reads as nonsense advice for a typo.
    expect(lines.join('\n')).not.toContain('place it at the end')
  })

  test('rejects an unknown short flag with exit code 1 and a helpful message', async () => {
    const lines: string[] = []

    expect(await run(['-z'], (message) => lines.push(message))).toBe(1)
    expect(lines.join('\n')).toContain('-z')
    expect(lines.join('\n')).toContain('Usage')
  })
})
