import {registryItemNameSchema} from '@nat-ui/schema'

/**
 * A name is interpolated into a URL and, by way of the item it names, into a
 * filesystem path. Checking the shape here means neither is ever built from
 * something that could traverse out of where it belongs.
 */
export const assertValidItemName = (name: string): void => {
  if (!registryItemNameSchema.safeParse(name).success) {
    throw new Error(
      `"${name}" is not a valid component name. Names are lowercase words separated by single hyphens, like "alert-dialog".`,
    )
  }
}
