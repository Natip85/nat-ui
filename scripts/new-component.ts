import {access, mkdir, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {registryItemNameSchema} from '@nat-ui/schema'

export const toTitle = (name: string): string =>
  name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

/**
 * Validated against the registry's own name schema, so the scaffold cannot
 * create something `build-registry` would later refuse.
 */
export const componentFiles = (name: string): {path: string; content: string}[] => {
  registryItemNameSchema.parse(name)

  const title = toTitle(name)
  const componentName = title.replace(/ /g, '')

  return [
    {
      path: `packages/registry/src/components/ui/${name}.tsx`,
      content: `import type {ComponentProps} from 'react'
import {cn} from '@/lib/utils'

export type ${componentName}Props = ComponentProps<'div'>

export function ${componentName}({className, ...props}: ${componentName}Props) {
  return <div className={cn('', className)} {...props} />
}
`,
    },
    {
      path: `apps/docs/components/demos/${name}-demo.tsx`,
      content: `import {${componentName}} from '@nat-ui/registry/components/ui/${name}'

export function ${componentName}Demo() {
  return <${componentName} />
}
`,
    },
    {
      path: `apps/docs/content/components/${name}.mdx`,
      content: `---
title: ${title}
description: TODO
---

<ComponentPreview name='${name}-demo' />

## Installation

<ComponentInstallation item='${name}' />

## Usage

\`\`\`tsx
import {${componentName}} from '@/components/ui/${name}'
\`\`\`

## API Reference

TODO
`,
    },
  ]
}

export const manualInstructions = (name: string): string => {
  const componentName = toTitle(name).replace(/ /g, '')

  return `
Add this import to apps/docs/components/demos/registry.ts:

  import {${componentName}Demo} from './${name}-demo'

Add this entry to the \`demos\` map in apps/docs/components/demos/registry.ts:

  '${name}-demo': {component: ${componentName}Demo, file: '${name}-demo.tsx'},

Add this to the \`items\` array in packages/registry/src/index.ts:

  {
    name: '${name}',
    type: 'ui',
    dependencies: ['@base-ui/react'],
    files: [{path: 'components/ui/${name}.tsx', type: 'ui'}],
  },

Then replace the TODO description in apps/docs/content/components/${name}.mdx
and run \`pnpm build\` to regenerate r/.`
}

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path)

    return true
  } catch {
    return false
  }
}

const main = async (): Promise<void> => {
  const name = process.argv[2]
  if (name === undefined) throw new Error('Usage: pnpm new:component <name>')

  const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

  for (const file of componentFiles(name)) {
    const absolute = join(repositoryRoot, file.path)

    if (await exists(absolute)) {
      console.log(`Skipped ${file.path}, which already exists.`)
      continue
    }

    await mkdir(dirname(absolute), {recursive: true})
    await writeFile(absolute, file.content)
    console.log(`Wrote ${file.path}`)
  }

  // Both maps are hand-ordered, so the scaffold prints the required entries
  // instead of creating edits that could silently land in the wrong place.
  console.log(manualInstructions(name))
}

// Only run when invoked as a script, so the tests can import the pure
// functions without writing anything.
if (
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
) {
  await main()
}
