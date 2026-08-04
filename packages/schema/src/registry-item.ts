import * as z from 'zod'
import {REGISTRY_SCHEMA_VERSION} from './schema-version'

/**
 * What an item is, which decides how the CLI treats it as a whole.
 */
export const registryItemTypeSchema = z.enum(['ui', 'lib', 'hook', 'block', 'style'])
export type RegistryItemType = z.infer<typeof registryItemTypeSchema>

/**
 * What a single file is, which decides which configured alias it lands under.
 * A `block` item can mix these, e.g. a component plus the hook it needs.
 */
export const registryItemFileTypeSchema = z.enum(['ui', 'lib', 'hook', 'component'])
export type RegistryItemFileType = z.infer<typeof registryItemFileTypeSchema>

const isSafeRelativePath = (value: string): boolean => {
  const isPosixAbsolute = value.startsWith('/')
  const isWindowsAbsolute = /^[a-zA-Z]:/.test(value) || value.startsWith('\\')
  if (isPosixAbsolute || isWindowsAbsolute) return false

  return !value.split(/[/\\]/).includes('..')
}

/**
 * A path the CLI will resolve against a directory in someone else's project.
 * Anything absolute, or containing a `..` segment, could write outside that
 * directory, so it is rejected before the value is ever used.
 */
const safeRelativePathSchema = z.string().min(1).refine(isSafeRelativePath, {
  error: 'must be a relative path with no ".." segments',
})

export const registryItemFileSchema = z.strictObject({
  path: safeRelativePathSchema,
  type: registryItemFileTypeSchema,
})
export type RegistryItemFile = z.infer<typeof registryItemFileSchema>

export const registryItemSchema = z.strictObject({
  name: z.string().min(1),
  type: registryItemTypeSchema,
  /** npm packages to install. */
  dependencies: z.array(z.string()).optional(),
  /** Other nat-ui items to install first. */
  registryDependencies: z.array(z.string()).optional(),
  files: z.array(registryItemFileSchema).min(1),
})
export type RegistryItem = z.infer<typeof registryItemSchema>

/**
 * An item name reaches both a URL and a filesystem path, so it is constrained
 * to a shape that cannot traverse either. This is a guard, not a style rule.
 */
export const REGISTRY_ITEM_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const registryItemNameSchema = z.string().regex(REGISTRY_ITEM_NAME_PATTERN, {
  error: 'must be lowercase words separated by single hyphens',
})

/**
 * What the registry serves, as opposed to what it declares. The authoring
 * schemas above describe files that exist on disk next to their declaration;
 * these describe the same files travelling over a network, so they carry their
 * own text and the version of the contract they were written against.
 */
export const registryItemFilePayloadSchema = registryItemFileSchema.extend({
  content: z.string(),
})
export type RegistryItemFilePayload = z.infer<typeof registryItemFilePayloadSchema>

export const registryItemPayloadSchema = registryItemSchema.extend({
  schemaVersion: z.literal(REGISTRY_SCHEMA_VERSION),
  name: registryItemNameSchema,
  files: z.array(registryItemFilePayloadSchema).min(1),
})
export type RegistryItemPayload = z.infer<typeof registryItemPayloadSchema>

export const registryIndexEntrySchema = z.strictObject({
  name: registryItemNameSchema,
  type: registryItemTypeSchema,
})
export type RegistryIndexEntry = z.infer<typeof registryIndexEntrySchema>

export const registryIndexSchema = z.strictObject({
  schemaVersion: z.literal(REGISTRY_SCHEMA_VERSION),
  items: z.array(registryIndexEntrySchema),
})
export type RegistryIndex = z.infer<typeof registryIndexSchema>
