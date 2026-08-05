import type {BaseLayoutProps} from 'fumadocs-ui/layouts/shared'
import {DocsHeader, HomeHeader} from '@/components/site-header'
import {appName, githubUrl, navLinks} from './shared'

/**
 * One object behind every layout, so the navigation bar, search trigger, and
 * theme toggle are identical on the home page and both documentation trees.
 */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {title: appName},
    links: navLinks.map(({text, url, nested}) => ({
      text,
      url,
      active: nested ? 'nested-url' : 'url',
    })),
    githubUrl,
  }
}

/**
 * Passing our own header into each layout's slot, which is what makes the bar
 * the same everywhere. The layouts keep their own internals — the sidebar and
 * its offsets break if the documentation layout is nested inside another — so
 * only the bar is shared, not the surrounding structure.
 */
export const homeSlots = {header: HomeHeader}
export const docsSlots = {header: DocsHeader}
