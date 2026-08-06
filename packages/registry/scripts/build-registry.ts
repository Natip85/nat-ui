import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {
  REGISTRY_SCHEMA_VERSION,
  type RegistryIndex,
  type RegistryItem,
  type RegistryItemFileType,
  type RegistryItemPayload,
  type RegistryItemType,
  registryIndexSchema,
  registryItemPayloadSchema,
} from '@nat-ui/schema'
import {items} from '../src/index'

/**
 * Everything emitted here is compared byte-for-byte against what is committed,
 * so a Windows checkout must not produce different bytes to a Linux one.
 */
export const normalizeNewlines = (text: string): string => text.replace(/\r\n/g, '\n')

const SPECIFIER = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g

export const importSpecifiers = (source: string): string[] => {
  const found: string[] = []
  for (const match of source.matchAll(SPECIFIER)) {
    const value = match[1] ?? match[2]
    if (value !== undefined) found.push(value)
  }

  return found
}

/** The shapes `add` knows how to rewrite. Anything else would ship broken. */
const SUPPORTED_ALIAS = /^@\/(?:lib\/[a-z0-9-]+|components\/ui\/[a-z0-9-]+)$/
const DYNAMIC_SPECIFIER = /\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g

const dynamicImportSpecifiers = (source: string): string[] => {
  const found: string[] = []
  for (const match of source.matchAll(DYNAMIC_SPECIFIER)) {
    const value = match[1]
    if (value !== undefined) found.push(value)
  }

  return found
}

const dynamicAliasImports = (source: string): string[] =>
  dynamicImportSpecifiers(source).filter((specifier) => specifier.startsWith('@/'))

export const unsupportedAliasImports = (source: string): string[] => [
  ...importSpecifiers(source).filter(
    (specifier) => specifier.startsWith('@/') && !SUPPORTED_ALIAS.test(specifier),
  ),
  ...dynamicAliasImports(source),
]

/**
 * Packages a consuming project necessarily already has. `add` never installs
 * them, so an item declaring them would be describing something it does not
 * control.
 */
const ASSUMED_PRESENT = new Set(['react', 'react-dom'])

/**
 * The npm package a bare specifier resolves to, or `undefined` when the
 * specifier is not an npm package at all. Alias imports are handled by
 * `unsupportedAliasImports`; relative imports cannot occur, because every
 * served file is written to a flat directory.
 */
export const packageNameOf = (specifier: string): string | undefined => {
  if (specifier.startsWith('.') || specifier.startsWith('@/') || specifier.startsWith('node:')) {
    return undefined
  }

  const segments = specifier.split('/')

  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]
}

/**
 * npm packages a file imports without the item declaring them. Undeclared
 * imports resolve here through the workspace and fail in the project that
 * installs the component, which is the worst place to find out.
 */
export const undeclaredDependencies = (source: string, declared: readonly string[]): string[] => {
  const known = new Set(declared)
  const missing = new Set<string>()

  for (const specifier of [...importSpecifiers(source), ...dynamicImportSpecifiers(source)]) {
    const name = packageNameOf(specifier)

    if (name !== undefined && !known.has(name) && !ASSUMED_PRESENT.has(name)) {
      missing.add(name)
    }
  }

  return [...missing]
}

/**
 * `hook`, `block`, and `style` are in the schema for later. Publishing one now
 * would produce a document `add` refuses, so the build stops here instead.
 */
const INSTALLABLE_ITEM_TYPES = new Set<RegistryItemType>(['ui', 'lib'])
const INSTALLABLE_FILE_TYPES = new Set<RegistryItemFileType>(['ui', 'lib'])

export const toPayload = (
  item: RegistryItem,
  read: (path: string) => string,
): RegistryItemPayload => {
  if (!INSTALLABLE_ITEM_TYPES.has(item.type)) {
    throw new Error(
      `Item "${item.name}" is type "${item.type}", but only "ui" and "lib" can be installed.`,
    )
  }

  const files = item.files.map((file) => {
    if (!INSTALLABLE_FILE_TYPES.has(file.type)) {
      throw new Error(
        `File "${file.path}" in "${item.name}" is type "${file.type}", but only "ui" and "lib" can be installed.`,
      )
    }

    const content = normalizeNewlines(read(file.path))
    const dynamic = dynamicAliasImports(content)
    if (dynamic.length > 0) {
      throw new Error(
        `File "${file.path}" dynamically imports ${dynamic.join(', ')}, but the CLI cannot rewrite dynamic imports.`,
      )
    }

    const unsupported = unsupportedAliasImports(content)
    if (unsupported.length > 0) {
      throw new Error(
        `File "${file.path}" imports ${unsupported.join(', ')}, which the CLI cannot rewrite.`,
      )
    }

    const undeclared = undeclaredDependencies(content, item.dependencies ?? [])
    if (undeclared.length > 0) {
      throw new Error(
        `File "${file.path}" imports ${undeclared.join(', ')}, which "${item.name}" does not declare in dependencies.`,
      )
    }

    return {...file, content}
  })

  return registryItemPayloadSchema.parse({schemaVersion: REGISTRY_SCHEMA_VERSION, ...item, files})
}

/**
 * Names in `registryDependencies` that no item defines. `registryDependencies`
 * is a list of strings the schema cannot cross-check, and `add` resolves each
 * one by fetching its own document, so a typo here is a 404 in someone else's
 * project rather than an error in ours.
 */
export const danglingRegistryDependencies = (all: readonly RegistryItem[]): string[] => {
  const defined = new Set(all.map((item) => item.name))
  const dangling = new Set<string>()

  for (const item of all) {
    for (const dependency of item.registryDependencies ?? []) {
      if (!defined.has(dependency)) dangling.add(`${item.name} -> ${dependency}`)
    }
  }

  return [...dangling].sort()
}

/**
 * Rotated to start at the alphabetically first name and closed by repeating it,
 * so the same cycle reads the same however the walk happened to enter it.
 */
const cycleTrail = (nodes: readonly string[]): string => {
  const first = nodes.reduce((lowest, node) => (node < lowest ? node : lowest))
  const at = nodes.indexOf(first)

  return [...nodes.slice(at), ...nodes.slice(0, at), first].join(' -> ')
}

/**
 * Dependency trails that return to where they started. The CLI's `resolveItems`
 * refuses a cyclic graph outright, so shipping one would make `add` fail for
 * every item on the cycle -- and nothing else would have noticed until then.
 */
export const registryDependencyCycles = (all: readonly RegistryItem[]): string[] => {
  const byNameIndex = new Map(all.map((item) => [item.name, item] as const))
  const cycles = new Set<string>()
  const walked = new Set<string>()

  const walk = (name: string, trail: readonly string[]): void => {
    const at = trail.indexOf(name)
    if (at !== -1) {
      cycles.add(cycleTrail(trail.slice(at)))

      return
    }
    if (walked.has(name)) return

    walked.add(name)
    // A name nothing defines is reported by danglingRegistryDependencies; it
    // cannot be part of a cycle, since it has no dependencies of its own.
    const item = byNameIndex.get(name)
    if (item === undefined) return

    for (const dependency of item.registryDependencies ?? []) walk(dependency, [...trail, name])
  }

  for (const item of all) walk(item.name, [])

  return [...cycles].sort()
}

/** Both graph checks, as the build wants them: fail before anything is written. */
export const assertResolvableGraph = (all: readonly RegistryItem[]): void => {
  const dangling = danglingRegistryDependencies(all)
  if (dangling.length > 0) {
    throw new Error(
      `These registryDependencies name items the registry does not define: ${dangling.join(', ')}.`,
    )
  }

  const cycles = registryDependencyCycles(all)
  if (cycles.length > 0) {
    throw new Error(`Registry items form a cycle: ${cycles.join(', ')}.`)
  }
}

// Sorted by code unit rather than locale, so the order cannot vary by machine.
export const byName = (a: {name: string}, b: {name: string}): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0

export const toIndex = (all: readonly RegistryItem[]): RegistryIndex =>
  registryIndexSchema.parse({
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    items: all.map(({name, type}) => ({name, type})).sort(byName),
  })

export const serialize = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

/**
 * Two destinations, one serialisation. `r/` is committed and served by GitHub
 * raw for clients that shipped before the site existed; the copy under the
 * docs app is generated at deploy time and served from the domain.
 */
export const outputDirectories = (packageRoot: string): string[] => [
  join(packageRoot, '..', '..', 'r'),
  join(packageRoot, '..', '..', 'apps', 'docs', 'public', 'r'),
]

const main = async (): Promise<void> => {
  const here = dirname(fileURLToPath(import.meta.url))
  const packageRoot = join(here, '..')
  const sourceRoot = join(packageRoot, 'src')

  const contents = new Map<string, string>()
  for (const item of items) {
    for (const file of item.files) {
      contents.set(file.path, await readFile(join(sourceRoot, file.path), 'utf8'))
    }
  }

  const read = (path: string): string => {
    const content = contents.get(path)
    if (content === undefined) throw new Error(`No source was read for "${path}".`)

    return content
  }

  assertResolvableGraph(items)

  const payloads = [...items].sort(byName).map((item) => toPayload(item, read))
  const documents = new Map<string, string>([
    ...payloads.map((payload): [string, string] => [`${payload.name}.json`, serialize(payload)]),
    ['index.json', serialize(toIndex(items))],
  ])

  // Removed rather than overwritten, so deleting an item also deletes its
  // document instead of leaving a file nothing points at.
  for (const outputDir of outputDirectories(packageRoot)) {
    await rm(outputDir, {recursive: true, force: true})
    await mkdir(outputDir, {recursive: true})

    for (const [name, document] of documents) {
      await writeFile(join(outputDir, name), document)
    }
  }

  console.log(`Wrote ${String(payloads.length)} registry item(s) to r/.`)
}

// Only run when invoked as a script, so the tests above can import the pure
// functions without generating anything.
if (
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
) {
  await main()
}
