import {randomBytes} from 'node:crypto'
import {chmod, realpath, rename, rm, stat, writeFile} from 'node:fs/promises'
import {basename, dirname, join} from 'node:path'

/**
 * Writes `contents` to `path` without ever truncating the file in place: the
 * new contents land in a temp file created alongside the target (so the
 * final `rename` stays on one filesystem and is therefore atomic), which is
 * then renamed over the target. A crash or a full disk mid-write leaves the
 * original file exactly as it was, never half-written.
 *
 * If `path` is a symlink, the temp file is renamed over the link's *real*
 * target rather than over the link itself — renaming onto a symlink path
 * would replace the link with a plain file, silently breaking it. When a
 * file already exists at the target, its permissions are copied onto the
 * temp file first, since a freshly created file would otherwise pick up the
 * process's default mode instead of the one the replaced file had.
 */
export const atomicWriteFile = async (path: string, contents: string): Promise<void> => {
  // A target that doesn't exist yet (e.g. a file we're creating for the first
  // time) can't be realpathed, so fall back to the given path unresolved.
  const target = await realpath(path).catch(() => path)
  const tempPath = join(
    dirname(target),
    `.${basename(target)}.${randomBytes(6).toString('hex')}.tmp`,
  )

  try {
    await writeFile(tempPath, contents, 'utf8')

    const mode = await stat(target)
      .then((info) => info.mode)
      .catch(() => undefined)
    if (mode !== undefined) {
      await chmod(tempPath, mode)
    }

    await rename(tempPath, target)
  } catch (error) {
    await rm(tempPath, {force: true})

    throw error
  }
}
