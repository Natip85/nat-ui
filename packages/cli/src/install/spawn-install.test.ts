import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import {spawnInstall} from './spawn-install'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'spawn-install-test-'))
})

afterEach(async () => {
  await rm(tempDir, {recursive: true, force: true})
})

describe('spawnInstall', () => {
  test('resolves when the child exits with code 0', async () => {
    // Empty script — node exits 0 with no output.
    const script = join(tempDir, 'exit-zero.js')
    await writeFile(script, '', 'utf8')
    await expect(spawnInstall(process.execPath, [script], process.cwd())).resolves.toBeUndefined()
  })

  test('rejects with the exit code when the child exits non-zero', async () => {
    const script = join(tempDir, 'exit-three.js')
    await writeFile(script, 'process.exit(3)', 'utf8')
    await expect(spawnInstall(process.execPath, [script], process.cwd())).rejects.toThrow(
      'exited with code 3',
    )
  })

  test('reports the signal, not "code null", when the child is killed by a signal', async () => {
    const script = join(tempDir, 'kill-self.js')
    await writeFile(script, 'process.kill(process.pid, "SIGTERM")', 'utf8')
    await expect(spawnInstall(process.execPath, [script], process.cwd())).rejects.toThrow(/SIGTERM/)
  })

  test('rejects when the binary cannot be found at all', async () => {
    await expect(
      spawnInstall('nat-ui-definitely-not-a-real-binary', [], process.cwd()),
    ).rejects.toThrow()
  })
})
