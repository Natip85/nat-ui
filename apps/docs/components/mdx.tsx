import defaultMdxComponents from 'fumadocs-ui/mdx'
import type {MDXComponents} from 'mdx/types'
import {Step, Steps} from 'fumadocs-ui/components/steps'
import {Tab, Tabs} from 'fumadocs-ui/components/tabs'
import {CliCommand, InstallCommand} from './command-tabs'
import {ComponentInstallation} from './component-installation'
import {ComponentPreview} from './component-preview'

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    CliCommand,
    ComponentInstallation,
    ComponentPreview,
    InstallCommand,
    Step,
    Steps,
    Tab,
    Tabs,
    ...components,
  } satisfies MDXComponents
}

export const useMDXComponents = getMDXComponents

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
