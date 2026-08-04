import {spawn} from 'node:child_process'

/**
 * Runs `bin args` in `cwd`, resolving on a clean exit. `close` reports a
 * signal-terminated child as `code: null`, which used to surface as the
 * confusing "exited with code null" — report the signal instead when that
 * happens, since at most one of `code`/`signal` is ever non-null.
 */
export const spawnInstall = async (
  bin: string,
  args: readonly string[],
  cwd: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve()

        return
      }

      const reason =
        code === null
          ? `was killed by signal ${signal ?? 'an unknown signal'}`
          : `exited with code ${String(code)}`
      reject(new Error(`${bin} ${reason}`))
    })
  })
