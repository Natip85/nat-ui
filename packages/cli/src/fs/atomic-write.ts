import {randomBytes} from 'node:crypto'
import {chmod, lstat, realpath, rename, rm, stat, writeFile} from 'node:fs/promises'
import {basename, dirname, join} from 'node:path'

/**
 * Resolves the real path `atomicWriteFile` should rename onto, tolerating a
 * target that doesn't exist yet — the common "we're creating this file for
 * the first time" case, where `path` and `target` are the same.
 *
 * A path that exists on disk but still can't be realpathed is a symlink
 * whose own target is missing (a "dangling" symlink); every other reason
 * `realpath` can fail on an existing path (a permissions problem, a
 * non-directory earlier in the path, ...) is a genuine error and is
 * rethrown as-is. A dangling link is deliberately *not* followed: unlike a
 * working symlink, there's no existing file at the far end whose location
 * we'd be preserving by writing through it, and this is a generic,
 * project-agnostic helper with no way to sanity-check wherever the broken
 * link happens to point. Refusing outright is the safer default for a tool
 * editing someone else's project — it surfaces the broken link so a human
 * can fix or remove it, rather than silently deciding what it should have
 * pointed to.
 */
const resolveTarget = async (path: string): Promise<string> => {
  try {
    return await realpath(path)
  } catch (error) {
    const info = await lstat(path).catch(() => undefined)
    if (info === undefined) return path
    if (!info.isSymbolicLink()) throw error

    throw new Error(
      `${path} is a symlink pointing to a location that no longer exists. Remove or repair the symlink, then try again.`,
      {cause: error},
    )
  }
}

/**
 * Writes `contents` to `path` without ever truncating the file in place: the
 * new contents land in a temp file created alongside the target — exclusively,
 * so a random name collision can never overwrite a file that happens to
 * already be sitting at that name — which is then renamed over the target.
 * That rename stays on one filesystem and is therefore atomic, so a crash or
 * a full disk mid-write leaves the original file exactly as it was, never
 * half-written.
 *
 * If `path` is a symlink, the temp file is renamed over the link's *real*
 * target rather than over the link itself — renaming onto a symlink path
 * would replace the link with a plain file, silently breaking it. A dangling
 * symlink (one whose target is missing) is refused outright rather than
 * guessed at; see `resolveTarget`. When a file already exists at the target,
 * its permissions are copied onto the temp file first, since a freshly
 * created file would otherwise pick up the process's default mode instead of
 * the one the replaced file had.
 */
export const atomicWriteFile = async (path: string, contents: string): Promise<void> => {
  const target = await resolveTarget(path)
  const tempPath = join(
    dirname(target),
    `.${basename(target)}.${randomBytes(6).toString('hex')}.tmp`,
  )

  // Created exclusively (fails instead of overwriting if the name is somehow
  // already taken), and outside the try/catch below: until this succeeds, we
  // don't own `tempPath` and must not delete whatever is already there.
  await writeFile(tempPath, contents, {encoding: 'utf8', flag: 'wx'})

  try {
    const mode = await stat(target)
      .then((info) => info.mode)
      .catch(() => undefined)
    if (mode !== undefined) {
      await chmod(tempPath, mode)
    }

    await rename(tempPath, target)
  } catch (error) {
    // If cleanup itself fails too (e.g. the same full disk that failed the
    // rename), that must never replace the more useful original failure.
    await rm(tempPath, {force: true}).catch(() => undefined)

    throw error
  }
}
