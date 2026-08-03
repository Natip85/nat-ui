import {describe, expect, test} from 'vitest'
import {detectPackageManager, installCommand} from './package-manager'

describe('detectPackageManager', () => {
  test('recognises each lockfile', () => {
    expect(detectPackageManager(['pnpm-lock.yaml'], undefined)).toBe('pnpm')
    expect(detectPackageManager(['yarn.lock'], undefined)).toBe('yarn')
    expect(detectPackageManager(['package-lock.json'], undefined)).toBe('npm')
    expect(detectPackageManager(['bun.lock'], undefined)).toBe('bun')
  })

  test('prefers pnpm when several lockfiles are present', () => {
    const files = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']

    expect(detectPackageManager(files, undefined)).toBe('pnpm')
  })

  test('falls back to the user agent when no lockfile exists', () => {
    expect(detectPackageManager([], 'yarn/4.9.1 npm/? node/v22.13.0')).toBe('yarn')
  })

  test('prefers a lockfile over the user agent', () => {
    expect(detectPackageManager(['pnpm-lock.yaml'], 'npm/10.9.2 node/v22.13.0')).toBe('pnpm')
  })

  test('falls back to npm when nothing identifies a manager', () => {
    expect(detectPackageManager([], undefined)).toBe('npm')
    expect(detectPackageManager([], 'deno/2.0.0')).toBe('npm')
  })
})

describe('installCommand', () => {
  test('uses add for every manager except npm', () => {
    expect(installCommand('pnpm', ['clsx'])).toEqual({command: 'pnpm', args: ['add', 'clsx']})
    expect(installCommand('yarn', ['clsx'])).toEqual({command: 'yarn', args: ['add', 'clsx']})
    expect(installCommand('bun', ['clsx'])).toEqual({command: 'bun', args: ['add', 'clsx']})
    expect(installCommand('npm', ['clsx'])).toEqual({command: 'npm', args: ['install', 'clsx']})
  })

  test('passes every package through', () => {
    expect(installCommand('pnpm', ['clsx', 'tailwind-merge']).args).toEqual([
      'add',
      'clsx',
      'tailwind-merge',
    ])
  })
})
