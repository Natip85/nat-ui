import {
  REGISTRY_SCHEMA_VERSION,
  type RegistryIndex,
  type RegistryItemPayload,
  registryIndexSchema,
  registryItemPayloadSchema,
} from '@nat-ui/schema'
import type {ZodType} from 'zod'
import {assertValidItemName} from './item-name'

/**
 * Narrower than `fetch` on purpose: the command only needs a status and a body,
 * and a two-field shape is trivial to substitute in tests.
 */
export type FetchJson = (url: string) => Promise<{status: number; body: string}>

export const httpFetchJson: FetchJson = async (url) => {
  const response = await fetch(url)

  return {status: response.status, body: await response.text()}
}

const parseJson = (body: string, url: string): unknown => {
  try {
    return JSON.parse(body)
  } catch {
    throw new Error(`The response from ${url} was not valid JSON.`)
  }
}

const readSchemaVersion = (value: unknown): string | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const {schemaVersion} = value as {schemaVersion?: unknown}

  return typeof schemaVersion === 'string' ? schemaVersion : undefined
}

const parseRegistryDocument = <T>(
  value: unknown,
  schema: ZodType<T>,
  mismatchMessage: (seenVersion: string) => string,
  malformedMessage: string,
): T => {
  const seenVersion = readSchemaVersion(value)

  if (seenVersion !== undefined && seenVersion !== REGISTRY_SCHEMA_VERSION) {
    throw new Error(mismatchMessage(seenVersion))
  }

  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new Error(malformedMessage)
  }

  return parsed.data
}

export const fetchItem = async (
  baseUrl: string,
  name: string,
  fetchJson: FetchJson,
): Promise<RegistryItemPayload> => {
  assertValidItemName(name)

  const url = `${baseUrl}/${name}.json`
  const {status, body} = await fetchJson(url)

  if (status === 404) {
    throw new Error(`No component named "${name}" exists in the registry.`)
  }
  if (status < 200 || status >= 300) {
    throw new Error(`The registry returned ${String(status)} for ${url}.`)
  }

  return parseRegistryDocument(
    parseJson(body, url),
    registryItemPayloadSchema,
    (seenVersion) =>
      `The registry document for "${name}" was built for a different version of the registry format (version ${seenVersion}; this CLI expects ${REGISTRY_SCHEMA_VERSION}). Upgrade the CLI.`,
    `The registry document for "${name}" is malformed — the registry served something this CLI cannot use.`,
  )
}

export const fetchIndex = async (baseUrl: string, fetchJson: FetchJson): Promise<RegistryIndex> => {
  const url = `${baseUrl}/index.json`
  const {status, body} = await fetchJson(url)

  if (status < 200 || status >= 300) {
    throw new Error(`The registry returned ${String(status)} for ${url}.`)
  }

  return parseRegistryDocument(
    parseJson(body, url),
    registryIndexSchema,
    (seenVersion) =>
      `The registry index was built for a different version of the registry format (version ${seenVersion}; this CLI expects ${REGISTRY_SCHEMA_VERSION}). Upgrade the CLI.`,
    'The registry index is malformed — the registry served something this CLI cannot use.',
  )
}
