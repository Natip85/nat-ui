import {REGISTRY_SCHEMA_VERSION, type RegistryItem} from '@nat-ui/schema'

/**
 * Component sources live under `src/` and are authored against the `@/*` alias.
 * The CLI rewrites that alias to whatever the consuming project configured, so
 * these files are never imported directly from here.
 *
 * `path` is relative to `src/`. Only its basename decides the filename in a
 * consuming project; the directory part is this repository's structure.
 */
export const items: readonly RegistryItem[] = [
  {
    name: 'motion',
    type: 'lib',
    files: [{path: 'lib/motion.ts', type: 'lib'}],
  },
  {
    name: 'button',
    type: 'ui',
    dependencies: ['@base-ui/react', 'class-variance-authority'],
    registryDependencies: ['motion'],
    files: [{path: 'components/ui/button.tsx', type: 'ui'}],
  },
]

export const registry = {schemaVersion: REGISTRY_SCHEMA_VERSION, items} as const
