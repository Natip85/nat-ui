import {DocsRouteLayout} from '@/lib/docs-route'
import {docsSource} from '@/lib/source'

export default function Layout({children}: LayoutProps<'/docs'>) {
  return <DocsRouteLayout source={docsSource}>{children}</DocsRouteLayout>
}
