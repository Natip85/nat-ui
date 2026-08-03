import {mkdtemp, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

/**
 * Windows only lets unprivileged processes create symlinks when Developer Mode
 * is on. Probe for the capability instead of skipping the whole platform, so a
 * runner that can make symlinks still exercises the tests that need them.
 */
export const symlinksSupported = await (async (): Promise<boolean> => {
  const directory = await mkdtemp(join(tmpdir(), 'nat-ui-symlink-probe-'))

  try {
    const target = join(directory, 'target')
    await writeFile(target, '', 'utf8')
    await symlink(target, join(directory, 'link'))

    return true
  } catch {
    return false
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
})()
