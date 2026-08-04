import type {BaseLayoutProps} from 'fumadocs-ui/layouts/shared'
import {appName, componentsRoute, docsRoute, gitConfig} from './shared'

/**
 * One object behind every layout, so the navigation bar, search trigger, and
 * theme toggle are identical on the home page and both documentation trees.
 */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {title: appName},
    links: [
      {text: 'Home', url: '/', active: 'url'},
      {text: 'Docs', url: docsRoute, active: 'nested-url'},
      {text: 'Components', url: componentsRoute, active: 'nested-url'},
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  }
}
