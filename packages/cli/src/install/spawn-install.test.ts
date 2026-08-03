import {describe, expect, test} from 'vitest'
import {spawnInstall} from './spawn-install'

describe('spawnInstall', () => {
  test('resolves when the child exits with code 0', async () => {
    await expect(spawnInstall(process.execPath, ['-e', ''], process.cwd())).resolves.toBeUndefined()
  })

  test('rejects with the exit code when the child exits non-zero', async () => {
    await expect(
      spawnInstall(process.execPath, ['-e', 'process.exit(3)'], process.cwd()),
    ).rejects.toThrow('exited with code 3')
  })

  test('reports the signal, not "code null", when the child is killed by a signal', async () => {
    await expect(
      spawnInstall(process.execPath, ['-e', 'process.kill(process.pid, "SIGTERM")'], process.cwd()),
    ).rejects.toThrow(/SIGTERM/)
  })

  test('rejects when the binary cannot be found at all', async () => {
    await expect(
      spawnInstall('nat-ui-definitely-not-a-real-binary', [], process.cwd()),
    ).rejects.toThrow()
  })
})
