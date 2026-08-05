import {describe, expect, it} from 'vitest'
import {componentFiles, toTitle} from './new-component'

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

  it('names the component in its page frontmatter', () => {
    const page = componentFiles('checkbox').find((file) => file.path.endsWith('.mdx'))

    expect(page?.content).toContain('title: Checkbox')
  })

  it('wires the page preview to the demo it generates', () => {
    const page = componentFiles('checkbox').find((file) => file.path.endsWith('.mdx'))

    expect(page?.content).toContain("<ComponentPreview name='checkbox-demo' />")
  })

  it('uses the built-registry installation component', () => {
    const page = componentFiles('checkbox').find((file) => file.path.endsWith('.mdx'))

    expect(page?.content).toContain("<ComponentInstallation item='checkbox' />")
  })

  it('rejects a name the registry schema would refuse', () => {
    expect(() => componentFiles('Checkbox')).toThrow(/lowercase/)
  })
})
