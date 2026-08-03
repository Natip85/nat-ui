import {REGISTRY_SCHEMA_VERSION} from '@nat-ui/schema'

/**
 * Component sources live under `src/` and are authored against the `@/*` alias.
 * The CLI rewrites that alias to whatever the consuming project configured, so
 * these files are never imported directly from here.
 */
export const registry = {
  schemaVersion: REGISTRY_SCHEMA_VERSION,
  items: [],
} as const
