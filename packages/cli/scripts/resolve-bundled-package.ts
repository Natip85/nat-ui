export interface BundledPackage {
  readonly name: string
  readonly directory: string
}

/**
 * pnpm nests every install under `.pnpm/<name>@<version>/node_modules/<name>/...`,
 * and a bundled package can itself depend on another package nested one level
 * deeper (`node_modules/<outer>/node_modules/<inner>/...`). The real package
 * root is always the LAST `node_modules/<name>` segment in the path, not the
 * first, so this walks from the end of the path rather than the start.
 */
export const resolveBundledPackage = (absolutePath: string): BundledPackage | undefined => {
  const marker = 'node_modules/'
  const markerIndex = absolutePath.lastIndexOf(marker)
  if (markerIndex === -1) return undefined

  const prefix = absolutePath.slice(0, markerIndex + marker.length)
  const segments = absolutePath.slice(markerIndex + marker.length).split('/')
  const first = segments[0]
  if (first === undefined || first === '') return undefined

  if (!first.startsWith('@')) {
    return {name: first, directory: `${prefix}${first}`}
  }

  const second = segments[1]
  if (second === undefined || second === '') return undefined

  const name = `${first}/${second}`

  return {name, directory: `${prefix}${name}`}
}
