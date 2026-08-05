import {readFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {type RegistryItemPayload, registryItemPayloadSchema} from '@nat-ui/schema'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/**
 * Reads the built registry rather than the component source, so the code a
 * page shows is byte-for-byte what `nat-ui add` would write.
 */
export const readPayload = async (name: string): Promise<RegistryItemPayload> => {
  const raw = await readFile(join(repositoryRoot, 'r', `${name}.json`), 'utf8')

  return registryItemPayloadSchema.parse(JSON.parse(raw))
}
