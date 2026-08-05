import {readFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {type RegistryItemPayload, registryItemPayloadSchema} from '@nat-ui/schema'
// The CLI's own walk, reached by relative path because `@nat-ui/cli` publishes a
// bundled binary and exposes no entry point to import. Reimplementing it is what
// went wrong before: the copy here agreed on ordering but dropped the cycle
// check, so a cyclic registry would have produced manual instructions for an
// install `add` refuses outright.
import {resolveItems} from '../../../packages/cli/src/registry/resolve-graph'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/**
 * Reads the built registry rather than the component source, so the code a
 * page shows is byte-for-byte what `nat-ui add` would write.
 */
export const readPayload = async (name: string): Promise<RegistryItemPayload> => {
  const raw = await readFile(join(repositoryRoot, 'r', `${name}.json`), 'utf8')

  return registryItemPayloadSchema.parse(JSON.parse(raw))
}

/**
 * Every item `add <name>` would write, dependencies first, each appearing once.
 * Naming a component installs whatever it depends on, so the manual
 * instructions have to account for the same files the CLI would.
 *
 * `load` is a parameter for the reason it is one in the CLI: so the walk can be
 * exercised on graphs the registry does not contain, a cyclic one above all.
 */
export const resolvePayloads = async (
  name: string,
  load: (name: string) => Promise<RegistryItemPayload> = readPayload,
): Promise<RegistryItemPayload[]> => resolveItems([name], load)
