import {readdir, readFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {items} from '@nat-ui/registry/registry'
import {describe, expect, it} from 'vitest'
import {demos} from './components/demos/registry'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * The scaffold leaves two placeholders: `description: TODO` in the frontmatter
 * and a bare `TODO` under `## API Reference`. Matching a whole line rather than
 * the word means prose that mentions a TODO in passing still passes, while
 * either placeholder -- and any other the scaffold grows -- is caught.
 */
const PLACEHOLDER = /^(?:description:[ \t]*)?TODO[ \t]*$/m

/** The component name the scaffold derives from a demo key: `input-demo` -> `InputDemo`. */
const pascalCase = (key: string): string =>
  key
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')

const documented = async (): Promise<string[]> => {
  const entries = await readdir(join(here, 'content', 'components'))

  return entries
    .filter((entry) => entry.endsWith('.mdx') && entry !== 'index.mdx')
    .map((entry) => entry.replace(/\.mdx$/, ''))
    .sort()
}

describe('component documentation coverage', () => {
  it('documents every registry item', async () => {
    const pages = new Set(await documented())
    const missing = items.map((item) => item.name).filter((name) => !pages.has(name))

    expect(missing, 'registry items with no page under content/components').toEqual([])
  })

  it('documents nothing that is not a registry item', async () => {
    const names = new Set(items.map((item) => item.name))
    const orphans = (await documented()).filter((page) => !names.has(page))

    expect(orphans, 'pages naming a component the registry does not serve').toEqual([])
  })

  it('registers a demo for every registry item', () => {
    const missing = items.map((item) => `${item.name}-demo`).filter((demo) => !(demo in demos))

    expect(missing, 'registry items with no entry in the demo map').toEqual([])
  })

  it('registers no demo for a component that does not exist', () => {
    // Keys are `<item>-<example>`, so this asserts only that a key begins with
    // some registry item's name: `button-group-vertical` passes on `button-`
    // whether or not a `button-group` item exists. Which item a key belongs to
    // is not decided here, and the ordering of `names` cannot affect the answer.
    const names = items.map((item) => item.name)
    const orphans = Object.keys(demos).filter(
      (demo) => !names.some((name) => demo.startsWith(`${name}-`)),
    )

    expect(orphans, 'demos naming a component the registry does not serve').toEqual([])
  })

  it('pairs every demo key with the component and the file of that name', () => {
    // Both halves of an entry resolve on their own, so a copy-paste that leaves
    // `input-demo` rendering `ButtonDemo` builds, renders, and shows the wrong
    // component above the right source. Function names survive the bundler the
    // tests run under, so the key can be checked against what it points at.
    const mismatched = Object.entries(demos)
      .filter(
        ([key, {component, file}]) => component.name !== pascalCase(key) || file !== `${key}.tsx`,
      )
      .map(([key, {component, file}]) => `${key}: {component: ${component.name}, file: ${file}}`)

    expect(mismatched, 'demo entries whose key, component, and file disagree').toEqual([])
  })

  it('registers every demo a page asks for, and no demo no page uses', async () => {
    const dir = join(here, 'content', 'components')
    const referenced = new Set<string>()

    for (const page of await documented()) {
      const content = await readFile(join(dir, `${page}.mdx`), 'utf8')
      for (const match of content.matchAll(/<ComponentPreview\s+name=['"]([^'"]+)['"]/g)) {
        referenced.add(match[1])
      }
    }

    const undefined_ = [...referenced].filter((name) => !(name in demos)).sort()
    const unused = Object.keys(demos)
      .filter((name) => !referenced.has(name))
      .sort()

    expect(undefined_, 'previews naming a demo that is not registered').toEqual([])
    expect(unused, 'registered demos no page renders').toEqual([])
  })

  it('leaves no scaffolded placeholder behind', async () => {
    const dir = join(here, 'content', 'components')
    const pages = await documented()
    const unfinished: string[] = []

    for (const page of pages) {
      const content = await readFile(join(dir, `${page}.mdx`), 'utf8')
      if (PLACEHOLDER.test(content)) unfinished.push(page)
    }

    expect(unfinished, 'pages still carrying a scaffold TODO placeholder').toEqual([])
  })
})
