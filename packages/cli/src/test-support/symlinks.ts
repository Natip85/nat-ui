import {mkdtemp, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

/**
 * Windows only lets unprivileged processes create symlinks when Developer Mode
 * is off, so probing lets a capable runner still exercise the tests that need
 * them instead of skipping the whole platform.
 *
 * Only Windows treats a probe failure as "unsupported": symlink creation has
 * no such restriction on POSIX, so there a failure means something is
 * actually broken (permissions, a missing temp directory, ...), and swallowing
 * it would silently drop the coverage those tests exist for. Let it propagate
 * there instead, so a real regression is loud.
 */
export const probeSymlinkSupport = async (): Promise<boolean> => {
  const directory = await mkdtemp(join(tmpdir(), 'nat-ui-symlink-probe-'))

  try {
    const target = join(directory, 'target')
    await writeFile(target, '', 'utf8')
    await symlink(target, join(directory, 'link'))

    return true
  } catch (error) {
    if (process.platform === 'win32') return false

    throw error
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
}

export const symlinksSupported = await probeSymlinkSupport()
