/**
 * Version of the registry JSON contract itself, not of any package. The CLI
 * checks this when fetching an item so an old CLI can refuse a payload it
 * cannot understand rather than writing corrupt files into someone's project.
 */
export const REGISTRY_SCHEMA_VERSION = '1' as const

export type RegistrySchemaVersion = typeof REGISTRY_SCHEMA_VERSION

export * from './config'
export * from './registry-item'
