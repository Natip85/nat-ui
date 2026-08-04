/**
 * pnpm-only dependency protocols. `pnpm pack` resolves these to real ranges;
 * `npm pack` copies them through verbatim, which would publish a manifest
 * whose specifiers no npm client can install. A specifier still carrying one
 * of these prefixes is proof the tarball was built by the wrong tool.
 */
const UNRESOLVED_PREFIXES = ['catalog:', 'workspace:'] as const

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const

export interface UnresolvedSpecifier {
  readonly field: string
  readonly name: string
  readonly specifier: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const findUnresolvedSpecifiers = (manifest: unknown): readonly UnresolvedSpecifier[] => {
  if (!isRecord(manifest)) return []

  const found: UnresolvedSpecifier[] = []

  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = manifest[field]
    if (!isRecord(dependencies)) continue

    for (const [name, specifier] of Object.entries(dependencies)) {
      if (typeof specifier !== 'string') continue
      if (!UNRESOLVED_PREFIXES.some((prefix) => specifier.startsWith(prefix))) continue

      found.push({field, name, specifier})
    }
  }

  return found
}
