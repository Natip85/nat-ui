import defaultMdxComponents from 'fumadocs-ui/mdx'
import type {MDXComponents} from 'mdx/types'
import {ComponentInstallation} from './component-installation'
import {ComponentPreview} from './component-preview'

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ComponentInstallation,
    ComponentPreview,
    ...components,
  } satisfies MDXComponents
}

export const useMDXComponents = getMDXComponents

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
