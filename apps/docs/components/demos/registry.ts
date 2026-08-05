import type {ComponentType} from 'react'
import {ButtonDefault} from './button-default'
import {ButtonDemo} from './button-demo'
import {ButtonDestructive} from './button-destructive'
import {ButtonDisabled} from './button-disabled'
import {ButtonGhost} from './button-ghost'
import {ButtonIcon} from './button-icon'
import {ButtonLink} from './button-link'
import {ButtonOutline} from './button-outline'
import {ButtonSecondary} from './button-secondary'
import {ButtonSize} from './button-size'
import {DialogDemo} from './dialog-demo'
import {DialogNoCloseButton} from './dialog-no-close-button'
import {InputDemo} from './input-demo'
import {InputDisabled} from './input-disabled'
import {InputInvalid} from './input-invalid'

/**
 * Explicit rather than a glob: a dynamic import on a variable path does not
 * statically analyse, so the bundler could not follow it. The coverage guard
 * keeps this in step with the registry.
 *
 * One entry per worked example, named `<item>-<example>`. The `<item>-demo`
 * entry is the one a component page leads with.
 */
export const demos: Record<string, {component: ComponentType; file: string}> = {
  'button-demo': {component: ButtonDemo, file: 'button-demo.tsx'},
  'button-default': {component: ButtonDefault, file: 'button-default.tsx'},
  'button-secondary': {component: ButtonSecondary, file: 'button-secondary.tsx'},
  'button-destructive': {component: ButtonDestructive, file: 'button-destructive.tsx'},
  'button-outline': {component: ButtonOutline, file: 'button-outline.tsx'},
  'button-ghost': {component: ButtonGhost, file: 'button-ghost.tsx'},
  'button-link': {component: ButtonLink, file: 'button-link.tsx'},
  'button-size': {component: ButtonSize, file: 'button-size.tsx'},
  'button-icon': {component: ButtonIcon, file: 'button-icon.tsx'},
  'button-disabled': {component: ButtonDisabled, file: 'button-disabled.tsx'},
  'input-demo': {component: InputDemo, file: 'input-demo.tsx'},
  'input-disabled': {component: InputDisabled, file: 'input-disabled.tsx'},
  'input-invalid': {component: InputInvalid, file: 'input-invalid.tsx'},
  'dialog-demo': {component: DialogDemo, file: 'dialog-demo.tsx'},
  'dialog-no-close-button': {
    component: DialogNoCloseButton,
    file: 'dialog-no-close-button.tsx',
  },
}
