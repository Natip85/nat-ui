import {describe, expect, it} from 'vitest'
import {componentFiles, manualInstructions, toTitle} from './new-component'

describe('toTitle', () => {
  it('capitalises a single word', () => {
    expect(toTitle('button')).toBe('Button')
  })

  it('capitalises every hyphenated word', () => {
    expect(toTitle('alert-dialog')).toBe('Alert Dialog')
  })
})

describe('componentFiles', () => {
  it('writes a component, a demo, and a page', () => {
    const paths = componentFiles('checkbox').map((file) => file.path)

    expect(paths).toEqual([
      'packages/registry/src/components/ui/checkbox.tsx',
      'apps/docs/components/demos/checkbox-demo.tsx',
      'apps/docs/content/components/checkbox.mdx',
    ])
  })

  it('generates the complete component page structure', () => {
    const page = componentFiles('checkbox').find((file) => file.path.endsWith('.mdx'))

    expect(page?.content).toBe(`---
title: Checkbox
description: TODO
---

<ComponentPreview name='checkbox-demo' />

## Installation

<ComponentInstallation item='checkbox' />

## Usage

\`\`\`tsx
import {Checkbox} from '@/components/ui/checkbox'
\`\`\`

## API Reference

TODO
`)
  })

  it('rejects a name the registry schema would refuse', () => {
    expect(() => componentFiles('Checkbox')).toThrow(/lowercase/)
  })
})

describe('manualInstructions', () => {
  it('tells the author how to register the generated demo', () => {
    expect(manualInstructions('checkbox')).toContain(
      "import {CheckboxDemo} from './checkbox-demo'\n\nAdd this entry to the `demos` map in apps/docs/components/demos/registry.ts:\n\n  'checkbox-demo': {component: CheckboxDemo, file: 'checkbox-demo.tsx'},",
    )
  })

  it('declares no dependency the generated component does not import', () => {
    // Following these instructions verbatim used to install `@base-ui/react` for
    // a component that imports only react and the utils alias. The build's
    // dependency guard is one-directional -- it catches an undeclared import,
    // not a declaration nothing imports -- so the two halves are pinned here
    // together: change what the template imports and this fails until the
    // printed entry says so.
    const [component] = componentFiles('checkbox')
    const imported = [...(component?.content ?? '').matchAll(/from '([^']+)'/g)].map(
      (match) => match[1],
    )
    const declared = /dependencies: \[(.*)\]/.exec(manualInstructions('checkbox'))?.[1]

    expect(imported, 'what the generated component imports').toEqual(['react', '@/lib/utils'])
    expect(declared, 'what the printed items entry declares').toBe('')
  })
})
