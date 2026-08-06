import {isAbsolute, join, relative, sep} from 'node:path'
import {type AliasMapping, targetDirForPrefix} from '../detect/project'

/**
 * Judged purely on the path given — never on where it resolves on disk — so a
 * stylesheet that is itself a symlink pointing outside the project (a real
 * monorepo pattern) is still accepted. Only a path that already reads outside
 * the project root, like `../../elsewhere.css`, is refused.
 *
 * Checks for a leading `..` *segment* rather than just the characters `..`, so a
 * legitimately in-root name that merely starts with two dots — `..styles/globals.css`,
 * naming a real directory called `..styles` — is not mistaken for an escape.
 */
export const isWithinRoot = (root: string, target: string): boolean => {
  const rel = relative(root, target)

  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)
}

/** `@/components/ui` → `@`. */
export const aliasPrefixOf = (alias: string): string => {
  const slash = alias.indexOf('/')

  return slash === -1 ? alias : alias.slice(0, slash)
}

/** `@/components/ui` with prefix `@` and a paths target rooted at `src` → `src/components/ui`. */
export const aliasToPath = (alias: string, prefix: string, baseDir: string): string => {
  const withoutPrefix = alias.startsWith(`${prefix}/`) ? alias.slice(prefix.length + 1) : alias

  return join(baseDir, withoutPrefix)
}

/**
 * Prefer where tsconfig's `paths` says the alias actually resolves, falling
 * back to a guess from the stylesheet's location when there's nothing more
 * reliable to go on, or when the `paths` target turns out to point outside the
 * project (a hint, not a user instruction, so it's discarded rather than
 * trusted enough to write there).
 */
export const aliasBaseDir = (
  cwd: string,
  aliasTargets: readonly AliasMapping[],
  prefix: string,
  cssPath: string,
): string => {
  const fallback = cssPath.startsWith('src/') ? 'src' : ''
  const target = targetDirForPrefix(aliasTargets, prefix)

  return target !== undefined && isWithinRoot(cwd, join(cwd, target)) ? target : fallback
}

/**
 * `@/lib/utils` → `@/lib`. Used to place lib files when a project's
 * `components.json` predates the `lib` alias: every config carries `utils`, and
 * the directory it names is where a second lib file belongs.
 */
export const aliasDirOf = (alias: string): string => {
  const stripped = alias.replace(/\/+$/, '')
  const slash = stripped.lastIndexOf('/')

  return slash === -1 ? stripped : stripped.slice(0, slash)
}
