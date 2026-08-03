import {readdir} from 'node:fs/promises'
import {join} from 'node:path'
import {type ParseError, parse as parseJsonc} from 'jsonc-parser'
import {directoryExists, fileExists, readText} from '../fs/read-text'
import {detectPackageManager, type PackageManager} from './package-manager'

export interface DetectedProject {
  hasPackageJson: boolean
  hasTsconfig: boolean
  css: string | undefined
  aliasPrefix: string
  tsx: boolean
  rsc: boolean
  packageManager: PackageManager
}

/** Ordered by how likely each layout is, and checked with a `tailwindcss` import. */
export const CSS_CANDIDATES = [
  'app/globals.css',
  'src/app/globals.css',
  'src/index.css',
  'src/styles/globals.css',
  'styles/globals.css',
] as const

const DEFAULT_ALIAS_PREFIX = '@'

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

const asOptionalRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined

/** `package.json` is strict JSON by spec, so this deliberately does not tolerate comments. */
const readJson = async (path: string): Promise<Record<string, unknown> | undefined> => {
  const text = await readText(path)
  if (text === undefined) return undefined

  try {
    const parsed: unknown = JSON.parse(text)

    return asOptionalRecord(parsed)
  } catch {
    return undefined
  }
}

/**
 * `tsconfig.json` is JSONC (comments and trailing commas are legal, and common
 * in real projects), so this uses the same tolerant parser VS Code does
 * rather than `JSON.parse`. `jsonc-parser` is fault-tolerant by design: on
 * genuinely malformed input it still returns a best-effort partial value
 * instead of throwing, so a non-empty error list — not a truthy result — is
 * what distinguishes "malformed" from "valid with comments".
 */
const readJsonc = async (path: string): Promise<Record<string, unknown> | undefined> => {
  const text = await readText(path)
  if (text === undefined) return undefined

  const errors: ParseError[] = []
  const parsed: unknown = parseJsonc(text, errors, {allowTrailingComma: true}) as unknown
  if (errors.length > 0) return undefined

  return asOptionalRecord(parsed)
}

const findStylesheet = async (cwd: string): Promise<string | undefined> => {
  for (const candidate of CSS_CANDIDATES) {
    const contents = await readText(join(cwd, candidate))
    if (contents !== undefined && /@import\s+['"]tailwindcss['"]/.test(contents)) {
      return candidate
    }
  }

  return undefined
}

/** Reads the prefix out of the first `paths` key shaped like `X/*`. */
const findAliasPrefix = (tsconfig: Record<string, unknown> | undefined): string => {
  const paths = asRecord(asRecord(tsconfig?.compilerOptions).paths)
  for (const key of Object.keys(paths)) {
    const prefix = /^(.+)\/\*$/.exec(key)?.[1]
    if (prefix !== undefined) return prefix
  }

  return DEFAULT_ALIAS_PREFIX
}

const usesNext = (pkg: Record<string, unknown> | undefined): boolean =>
  'next' in asRecord(pkg?.dependencies) || 'next' in asRecord(pkg?.devDependencies)

export const detectProject = async (
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<DetectedProject> => {
  const pkg = await readJson(join(cwd, 'package.json'))
  const tsconfig = await readJsonc(join(cwd, 'tsconfig.json'))

  const hasPackageJson = await fileExists(join(cwd, 'package.json'))
  const hasTsconfig = await fileExists(join(cwd, 'tsconfig.json'))

  const hasAppDir =
    (await directoryExists(join(cwd, 'app'))) || (await directoryExists(join(cwd, 'src/app')))

  const files = await listDirectory(cwd)

  return {
    hasPackageJson,
    hasTsconfig,
    css: await findStylesheet(cwd),
    aliasPrefix: findAliasPrefix(tsconfig),
    tsx: hasTsconfig,
    rsc: usesNext(pkg) && hasAppDir,
    packageManager: detectPackageManager(files, env.npm_config_user_agent),
  }
}

const listDirectory = async (path: string): Promise<string[]> => {
  try {
    return await readdir(path)
  } catch {
    return []
  }
}
