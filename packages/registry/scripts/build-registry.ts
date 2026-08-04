import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {
  REGISTRY_SCHEMA_VERSION,
  type RegistryIndex,
  type RegistryItem,
  type RegistryItemPayload,
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

/** The two shapes `add` knows how to rewrite. Anything else would ship broken. */
const SUPPORTED_ALIAS = /^@\/(?:lib\/utils|components\/ui\/[a-z0-9-]+)$/
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

export const toPayload = (
  item: RegistryItem,
  read: (path: string) => string,
): RegistryItemPayload => {
  if (item.type !== 'ui') {
    throw new Error(`Item "${item.name}" is type "${item.type}", but only "ui" can be installed.`)
  }

  const files = item.files.map((file) => {
    if (file.type !== 'ui') {
      throw new Error(
        `File "${file.path}" in "${item.name}" is type "${file.type}", but only "ui" can be installed.`,
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

// Sorted by code unit rather than locale, so the order cannot vary by machine.
export const byName = (a: {name: string}, b: {name: string}): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0

export const toIndex = (all: readonly RegistryItem[]): RegistryIndex =>
  registryIndexSchema.parse({
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    items: all.map(({name, type}) => ({name, type})).sort(byName),
  })

export const serialize = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

const main = async (): Promise<void> => {
  const here = dirname(fileURLToPath(import.meta.url))
  const packageRoot = join(here, '..')
  const sourceRoot = join(packageRoot, 'src')
  const outputDir = join(packageRoot, '..', '..', 'r')

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

  const payloads = [...items].sort(byName).map((item) => toPayload(item, read))

  // Removed rather than overwritten, so deleting an item also deletes its
  // document instead of leaving a file nothing points at.
  await rm(outputDir, {recursive: true, force: true})
  await mkdir(outputDir, {recursive: true})

  for (const payload of payloads) {
    await writeFile(join(outputDir, `${payload.name}.json`), serialize(payload))
  }
  await writeFile(join(outputDir, 'index.json'), serialize(toIndex(items)))

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
