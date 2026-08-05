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

/**
 * Every item `add <name>` would write, dependencies first, each appearing once.
 * Naming a component installs whatever it depends on, so the manual
 * instructions have to account for the same files the CLI would.
 */
export const resolvePayloads = async (name: string): Promise<RegistryItemPayload[]> => {
  const seen = new Set<string>()
  const resolved: RegistryItemPayload[] = []

  const visit = async (current: string): Promise<void> => {
    if (seen.has(current)) return
    seen.add(current)

    const payload = await readPayload(current)
    for (const dependency of payload.registryDependencies ?? []) await visit(dependency)

    resolved.push(payload)
  }

  await visit(name)

  return resolved
}
