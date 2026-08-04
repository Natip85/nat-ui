import type {RegistryItemPayload} from '@nat-ui/schema'

/**
 * Depth-first, post-order: an item is appended only once everything it depends
 * on has been. Writing in that order means a component's imports already exist
 * on disk by the time it lands.
 */
export const resolveItems = async (
  names: readonly string[],
  load: (name: string) => Promise<RegistryItemPayload>,
): Promise<RegistryItemPayload[]> => {
  const resolved: RegistryItemPayload[] = []
  const done = new Set<string>()
  const visiting = new Set<string>()

  const visit = async (name: string, trail: readonly string[]): Promise<void> => {
    if (done.has(name)) return
    if (visiting.has(name)) {
      throw new Error(`Registry items form a cycle: ${[...trail, name].join(' -> ')}`)
    }

    visiting.add(name)
    const item = await load(name)
    for (const dependency of item.registryDependencies ?? []) {
      await visit(dependency, [...trail, name])
    }
    visiting.delete(name)

    done.add(name)
    resolved.push(item)
  }

  for (const name of names) {
    await visit(name, [])
  }

  return resolved
}
