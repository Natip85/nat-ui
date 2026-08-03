import {readdir} from 'node:fs/promises'
import {join} from 'node:path'
import {type ParseError, parse as parseJsonc} from 'jsonc-parser'
import {directoryExists, fileExists, readText} from '../fs/read-text'
import {detectPackageManager, type PackageManager} from './package-manager'

export interface DetectedProject {
  hasPackageJson: boolean
  /** True when `package.json` exists but could not be parsed as JSON. */
  packageJsonParseError: boolean
  hasTsconfig: boolean
  css: string | undefined
  aliasPrefix: string
  /**
   * Directory the alias root resolves to, taken from the `paths` entry that
   * supplied `aliasPrefix` (e.g. `{"@/*": ["./src/*"]}` → `'src'`; `["./*"]` →
   * `''` for the project root). Forward-slash normalized, relative to `cwd`.
   * `undefined` when tsconfig had no usable `paths` entry to derive this
   * from — callers should fall back to another heuristic in that case.
   */
  aliasTargetDir: string | undefined
  tsx: boolean
  rsc: boolean
  packageManager: PackageManager
}

/** Backslashes flipped to forward slashes, so paths compare and print consistently across platforms. */
export const toPosixPath = (path: string): string => path.replace(/\\/g, '/')

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

interface AliasMapping {
  readonly prefix: string
  readonly targetDir: string | undefined
}

const ALIAS_KEY_PATTERN = /^(.+)\/\*$/
const ALIAS_TARGET_PATTERN = /^(.*)\/\*$/

/** Strips a leading `./` (or reduces a bare `.`) and any trailing slash, so `'./src/'` and `'src'` agree. */
const normalizeAliasTarget = (raw: string): string => {
  const posix = toPosixPath(raw)
  const withoutLeadingDot = posix === '.' ? '' : posix.startsWith('./') ? posix.slice(2) : posix

  return withoutLeadingDot.replace(/\/+$/, '')
}

/** The first string entry of a `paths` value, matched against the `Y/*` shape TS conventionally pairs with an `X/*` key. */
const targetDirFor = (value: unknown): string | undefined => {
  const first = Array.isArray(value)
    ? value.find((entry): entry is string => typeof entry === 'string')
    : undefined
  if (first === undefined) return undefined

  const target = ALIAS_TARGET_PATTERN.exec(first)?.[1]

  return target === undefined ? undefined : normalizeAliasTarget(target)
}

/** Reads the prefix and target directory out of the first `paths` key shaped like `X/*`. */
const findAlias = (tsconfig: Record<string, unknown> | undefined): AliasMapping => {
  const paths = asRecord(asRecord(tsconfig?.compilerOptions).paths)
  for (const key of Object.keys(paths)) {
    const prefix = ALIAS_KEY_PATTERN.exec(key)?.[1]
    if (prefix !== undefined) return {prefix, targetDir: targetDirFor(paths[key])}
  }

  return {prefix: DEFAULT_ALIAS_PREFIX, targetDir: undefined}
}

const usesNext = (pkg: Record<string, unknown> | undefined): boolean =>
  'next' in asRecord(pkg?.dependencies) || 'next' in asRecord(pkg?.devDependencies)

export const detectProject = async (
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<DetectedProject> => {
  const hasPackageJson = await fileExists(join(cwd, 'package.json'))
  const pkg = await readJson(join(cwd, 'package.json'))

  const hasTsconfig = await fileExists(join(cwd, 'tsconfig.json'))
  const tsconfig = await readJsonc(join(cwd, 'tsconfig.json'))

  const hasAppDir =
    (await directoryExists(join(cwd, 'app'))) || (await directoryExists(join(cwd, 'src/app')))

  const files = await listDirectory(cwd)
  const alias = findAlias(tsconfig)

  return {
    hasPackageJson,
    packageJsonParseError: hasPackageJson && pkg === undefined,
    hasTsconfig,
    css: await findStylesheet(cwd),
    aliasPrefix: alias.prefix,
    aliasTargetDir: alias.targetDir,
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
