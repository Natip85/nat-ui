import {realpathSync} from 'node:fs'
import {pathToFileURL} from 'node:url'

/**
 * Node does not realpath `process.argv[1]`, but it does resolve the main
 * module itself to its real path (unless `--preserve-symlinks-main` is set).
 * When the CLI runs through a `node_modules/.bin` symlink — which is how it
 * runs for every installed user, including `npx`/`pnpm dlx` — `entry` is the
 * symlink while `metaUrl` reflects the realpath it points at, so the naive
 * comparison alone would be false and the CLI would silently do nothing.
 *
 * The naive comparison is tried first so `--preserve-symlinks-main` still
 * works: in that mode the main module is intentionally *not* realpathed, so
 * only the direct comparison matches.
 */
export const isEntryPoint = (metaUrl: string, entry: string | undefined): boolean => {
  if (entry === undefined) {
    return false
  }

  if (metaUrl === pathToFileURL(entry).href) {
    return true
  }

  try {
    return metaUrl === pathToFileURL(realpathSync(entry)).href
  } catch {
    return false
  }
}
