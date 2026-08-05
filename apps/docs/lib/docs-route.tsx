import {DocsLayout} from 'fumadocs-ui/layouts/notebook'
import {DocsBody, DocsDescription, DocsPage, DocsTitle} from 'fumadocs-ui/layouts/notebook/page'
import {createRelativeLink} from 'fumadocs-ui/mdx'
import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import type {ReactNode} from 'react'
import {getMDXComponents} from '@/components/mdx'
import {baseOptions, docsSlots} from '@/lib/layout.shared'
import {docsSource} from '@/lib/source'

/**
 * Either documentation tree's loader. The two are structurally identical — same
 * schemas, different content directory — so one `typeof` describes both, and
 * writing them as a union would only restate the same type twice.
 *
 * The guides and the components tree are required to look the same. Sharing one
 * renderer is what guarantees it: they differ in the content they load and in
 * nothing else, so neither can drift into a design of its own.
 */
export type DocsSource = typeof docsSource

export const renderDocsPage = (source: DocsSource, slug: string[] | undefined): ReactNode => {
  const page = source.getPage(slug)
  if (!page) notFound()

  const MDX = page.data.body

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents({a: createRelativeLink(source, page)})} />
      </DocsBody>
    </DocsPage>
  )
}

export const docsPageMetadata = (source: DocsSource, slug: string[] | undefined): Metadata => {
  const page = source.getPage(slug)
  if (!page) notFound()

  return {title: page.data.title, description: page.data.description}
}

/**
 * The notebook layout rather than the plain docs layout, because the plain one
 * folds navigation into the sidebar and leaves no bar across the top. `mode:
 * 'top'` spans the bar the full width.
 *
 * This layout must stay the outermost one on documentation routes. Nesting it
 * inside another layout detaches the sidebar's sticky offsets, so the sidebar
 * scrolls with the page instead of independently, and drops the trigger that
 * opens it on small screens.
 */
export function DocsRouteLayout({children, source}: {children: ReactNode; source: DocsSource}) {
  const {nav, ...base} = baseOptions()

  return (
    <DocsLayout tree={source.getPageTree()} {...base} nav={{...nav, mode: 'top'}} slots={docsSlots}>
      {children}
    </DocsLayout>
  )
}
