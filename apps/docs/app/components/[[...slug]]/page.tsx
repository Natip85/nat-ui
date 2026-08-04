import type {Metadata} from 'next'
import {docsPageMetadata, renderDocsPage} from '@/lib/docs-route'
import {componentsSource} from '@/lib/source'

export default async function Page(props: PageProps<'/components/[[...slug]]'>) {
  const {slug} = await props.params

  return renderDocsPage(componentsSource, slug)
}

export function generateStaticParams() {
  return componentsSource.generateParams()
}

export async function generateMetadata(
  props: PageProps<'/components/[[...slug]]'>,
): Promise<Metadata> {
  const {slug} = await props.params

  return docsPageMetadata(componentsSource, slug)
}
