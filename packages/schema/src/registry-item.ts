import * as z from 'zod'

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
