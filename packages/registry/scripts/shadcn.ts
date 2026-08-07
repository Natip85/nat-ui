import type {RegistryItemFileType, RegistryItemPayload, RegistryItemType} from '@nat-ui/schema'
import type {RegistrySourceItem} from '../src/index'

export const SHADCN_SCHEMA_URL = 'https://ui.shadcn.com/schema/registry-item.json'

/**
 * Absolute because it ends up inside the documents themselves. Overridable so
 * CI can serve a build whose cross-references point at its own local server
 * instead of production.
 */
export const DEFAULT_SHADCN_BASE_URL = 'https://nat-ui-delta.vercel.app/s'

/**
 * Throws rather than casts. `toPayload` has already rejected anything that is
 * not `ui` or `lib`, so this is unreachable in the build -- but it is the kind
 * of unreachable that stops being unreachable the day a new type is added, and
 * a silent `registry:ui` on a block would be found by a user, not by us.
 */
export const shadcnTypeOf = (
  type: RegistryItemType | RegistryItemFileType,
): 'registry:ui' | 'registry:lib' => {
  if (type === 'ui') return 'registry:ui'
  if (type === 'lib') return 'registry:lib'

  throw new Error(`Type "${type}" has no shadcn equivalent; only "ui" and "lib" do.`)
}

export interface ShadcnItemFile {
  readonly path: string
  readonly type: 'registry:ui' | 'registry:lib'
  readonly content: string
}

export interface ShadcnItem {
  readonly $schema: string
  readonly name: string
  readonly type: 'registry:ui' | 'registry:lib'
  readonly title: string
  readonly description: string
  readonly dependencies?: readonly string[]
  readonly registryDependencies?: readonly string[]
  readonly files: readonly ShadcnItemFile[]
}

/**
 * The same item, serialised for a CLI we do not own. Contents come from the
 * already-validated nat-ui payload rather than being read again, so the two
 * formats cannot describe different source text.
 */
export const toShadcnItem = (
  item: RegistrySourceItem,
  payload: RegistryItemPayload,
  baseUrl: string,
  known: ReadonlySet<string>,
): ShadcnItem => ({
  $schema: SHADCN_SCHEMA_URL,
  name: item.name,
  type: shadcnTypeOf(item.type),
  title: item.title,
  description: item.description,
  ...(item.dependencies === undefined ? {} : {dependencies: item.dependencies}),
  ...(item.registryDependencies === undefined
    ? {}
    : {
        // Only ours become URLs; a name this registry does not define is
        // left as a bare shadcn name. `assertResolvableGraph` in
        // build-registry.ts currently throws on exactly that case before an
        // item reaches here, so this branch is unreachable in the build
        // today. It stays because that check is what needs to change, not
        // this mapping: the day it learns to allow an external name, this is
        // already the correct thing to do with it, and rewriting it to a
        // nat-ui URL would 404.
        registryDependencies: item.registryDependencies.map((name) =>
          known.has(name) ? `${baseUrl}/${name}.json` : name,
        ),
      }),
  files: payload.files.map((file) => ({
    path: file.path,
    type: shadcnTypeOf(file.type),
    content: file.content,
  })),
})
