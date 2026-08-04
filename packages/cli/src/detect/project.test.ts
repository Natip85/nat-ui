import {mkdtemp, mkdir, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {beforeEach, describe, expect, test} from 'vitest'
import {detectProject, targetDirForPrefix} from './project'

let cwd: string

const write = async (relative: string, contents: string): Promise<void> => {
  const path = join(cwd, relative)
  await mkdir(join(path, '..'), {recursive: true})
  await writeFile(path, contents, 'utf8')
}

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'nat-ui-detect-'))
})

describe('detectProject', () => {
  test('reports a missing package.json', async () => {
    const detected = await detectProject(cwd, {})

    expect(detected.hasPackageJson).toBe(false)
  })

  test('finds a Next.js app-directory project', async () => {
    await write('package.json', JSON.stringify({dependencies: {next: '16.0.0'}}))
    await write('tsconfig.json', JSON.stringify({compilerOptions: {paths: {'@/*': ['./src/*']}}}))
    await write('src/app/globals.css', "@import 'tailwindcss';\n")
    await write('pnpm-lock.yaml', '')

    const detected = await detectProject(cwd, {})

    expect(detected.hasPackageJson).toBe(true)
    expect(detected.css).toBe('src/app/globals.css')
    expect(detected.aliasPrefix).toBe('@')
    expect(detected.tsx).toBe(true)
    expect(detected.rsc).toBe(true)
    expect(detected.packageManager).toBe('pnpm')
  })

  test('finds a Vite-style project and does not claim RSC', async () => {
    await write('package.json', JSON.stringify({dependencies: {react: '19.0.0'}}))
    await write('tsconfig.json', JSON.stringify({compilerOptions: {paths: {'~/*': ['./src/*']}}}))
    await write('src/index.css', '@import "tailwindcss";\n')

    const detected = await detectProject(cwd, {})

    expect(detected.css).toBe('src/index.css')
    expect(detected.aliasPrefix).toBe('~')
    expect(detected.rsc).toBe(false)
  })

  test('treats a project without tsconfig as JavaScript with an @ prefix', async () => {
    await write('package.json', '{}')

    const detected = await detectProject(cwd, {})

    expect(detected.hasTsconfig).toBe(false)
    expect(detected.tsx).toBe(false)
    expect(detected.aliasPrefix).toBe('@')
  })

  test('ignores a stylesheet that does not import tailwind', async () => {
    await write('package.json', '{}')
    await write('app/globals.css', 'body {\n  margin: 0;\n}\n')

    const detected = await detectProject(cwd, {})

    expect(detected.css).toBeUndefined()
  })

  test('does not claim RSC for Next.js without an app directory', async () => {
    await write('package.json', JSON.stringify({dependencies: {next: '16.0.0'}}))
    await write('pages/index.tsx', 'export default function Page() {}\n')

    const detected = await detectProject(cwd, {})

    expect(detected.rsc).toBe(false)
  })

  test('falls back to the user agent for the package manager', async () => {
    await write('package.json', '{}')

    const detected = await detectProject(cwd, {npm_config_user_agent: 'bun/1.2.0'})

    expect(detected.packageManager).toBe('bun')
  })

  test('survives malformed json without throwing', async () => {
    await write('package.json', '{not json')
    await write('tsconfig.json', '{not json')

    const detected = await detectProject(cwd, {})

    expect(detected.hasPackageJson).toBe(true)
    expect(detected.rsc).toBe(false)
    expect(detected.aliasPrefix).toBe('@')
  })

  test('parses a tsconfig.json with comments and a trailing comma', async () => {
    await write('package.json', '{}')
    await write(
      'tsconfig.json',
      [
        '{',
        '  // this project aliases everything to "~"',
        '  "compilerOptions": {',
        '    "paths": {',
        '      "~/*": ["./src/*"],',
        '    },',
        '  },',
        '}',
      ].join('\n'),
    )

    const detected = await detectProject(cwd, {})

    expect(detected.aliasPrefix).toBe('~')
  })

  test('falls back to the default prefix for a tsconfig with a genuine syntax error', async () => {
    await write('package.json', '{}')
    await write('tsconfig.json', '{ "compilerOptions": { paths not valid at all')

    const detected = await detectProject(cwd, {})

    expect(detected.hasTsconfig).toBe(true)
    expect(detected.aliasPrefix).toBe('@')
  })

  test('flags a package.json that exists but cannot be parsed', async () => {
    await write('package.json', '{not json')

    const detected = await detectProject(cwd, {})

    expect(detected.hasPackageJson).toBe(true)
    expect(detected.packageJsonParseError).toBe(true)
  })

  test('does not flag a missing package.json as a parse error', async () => {
    const detected = await detectProject(cwd, {})

    expect(detected.hasPackageJson).toBe(false)
    expect(detected.packageJsonParseError).toBe(false)
  })

  test('does not flag a valid package.json as a parse error', async () => {
    await write('package.json', '{}')

    const detected = await detectProject(cwd, {})

    expect(detected.packageJsonParseError).toBe(false)
  })

  test('captures the paths target directory for the alias', async () => {
    await write('package.json', '{}')
    await write('tsconfig.json', JSON.stringify({compilerOptions: {paths: {'@/*': ['./src/*']}}}))

    const detected = await detectProject(cwd, {})

    expect(targetDirForPrefix(detected.aliasTargets, '@')).toBe('src')
  })

  test('captures a paths target that maps the alias to the project root', async () => {
    await write('package.json', '{}')
    await write('tsconfig.json', JSON.stringify({compilerOptions: {paths: {'@/*': ['./*']}}}))

    const detected = await detectProject(cwd, {})

    expect(targetDirForPrefix(detected.aliasTargets, '@')).toBe('')
  })

  test('leaves the alias targets empty when there is no usable paths entry', async () => {
    await write('package.json', '{}')

    const detected = await detectProject(cwd, {})

    expect(detected.aliasTargets).toEqual([])
    expect(targetDirForPrefix(detected.aliasTargets, '@')).toBeUndefined()
  })

  test('captures every prefix-to-target mapping in paths, not just the first', async () => {
    await write('package.json', '{}')
    await write(
      'tsconfig.json',
      JSON.stringify({compilerOptions: {paths: {'~/*': ['./src/*'], '@/*': ['./lib/*']}}}),
    )

    const detected = await detectProject(cwd, {})

    // The default prefix is still the first entry — only the target lookup
    // needs every mapping, so a later override can find its own target.
    expect(detected.aliasPrefix).toBe('~')
    expect(targetDirForPrefix(detected.aliasTargets, '~')).toBe('src')
    expect(targetDirForPrefix(detected.aliasTargets, '@')).toBe('lib')
  })
})
