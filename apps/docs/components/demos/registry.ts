import type {ComponentType} from 'react'
import {ButtonDemo} from './button-demo'

/**
 * Explicit rather than a glob: a dynamic import on a variable path does not
 * statically analyse, so the bundler could not follow it. The coverage guard
 * keeps this in step with the registry.
 */
export const demos: Record<string, {component: ComponentType; file: string}> = {
  'button-demo': {component: ButtonDemo, file: 'button-demo.tsx'},
}
