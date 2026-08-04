import type {Metadata} from 'next'
import {docsPageMetadata, renderDocsPage} from '@/lib/docs-route'
import {docsSource} from '@/lib/source'

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const {slug} = await props.params

  return renderDocsPage(docsSource, slug)
}

export function generateStaticParams() {
  return docsSource.generateParams()
}

export async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  const {slug} = await props.params

  return docsPageMetadata(docsSource, slug)
}
