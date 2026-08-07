import {REGISTRY_SCHEMA_VERSION, type RegistryItem} from '@nat-ui/schema'

/**
 * What an item looks like here, as opposed to what the registry serves. The
 * title and description exist for shadcn's format, which displays them; the
 * nat-ui format has no field for either and must not grow one, so `toPayload`
 * drops them on the way out.
 */
export type RegistrySourceItem = RegistryItem & {
  readonly title: string
  readonly description: string
}

/**
 * Component sources live under `src/` and are authored against the `@/*` alias.
 * The CLI rewrites that alias to whatever the consuming project configured, so
 * these files are never imported directly from here.
 *
 * `path` is relative to `src/`. Only its basename decides the filename in a
 * consuming project; the directory part is this repository's structure.
 */
export const items: readonly RegistrySourceItem[] = [
  {
    name: 'motion',
    type: 'lib',
    title: 'Motion',
    description:
      'Spring presets and the easing functions derived from them. Every nat-ui component reads its animation from here.',
    files: [
      {path: 'lib/motion.ts', type: 'lib'},
      {path: 'lib/use-motion.ts', type: 'lib'},
    ],
  },
  {
    name: 'button',
    type: 'ui',
    title: 'Button',
    description:
      'A button whose press is a spring rather than a transition, with smooth, snappy and bouncy presets.',
    dependencies: ['@base-ui/react', 'class-variance-authority'],
    registryDependencies: ['motion'],
    files: [
      {path: 'components/ui/button.tsx', type: 'ui'},
      {path: 'components/ui/button-variants.tsx', type: 'ui'},
    ],
  },
]

export const registry = {schemaVersion: REGISTRY_SCHEMA_VERSION, items} as const
