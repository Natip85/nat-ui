export const appName = 'nat-ui'
export const cliPackage = '@nat-ui/cli'
export const docsRoute = '/docs'
export const componentsRoute = '/components'

export const gitConfig = {
  user: 'Natip85',
  repo: 'nat-ui',
  branch: 'main',
}

export const githubUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`

/**
 * The one list the navigation bar is built from. The bar is rendered by our own
 * component but Fumadocs still needs the same links for its mobile menus, so
 * both read this rather than each keeping a copy that can drift.
 *
 * `nested` marks a section whose child pages should keep the link highlighted.
 */
export const navLinks = [
  {text: 'Home', url: '/', nested: false},
  {text: 'Docs', url: docsRoute, nested: true},
  {text: 'Components', url: componentsRoute, nested: true},
] as const
