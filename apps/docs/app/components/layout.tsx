import {DocsRouteLayout} from '@/lib/docs-route'
import {componentsSource} from '@/lib/source'

export default function Layout({children}: LayoutProps<'/components'>) {
  return <DocsRouteLayout source={componentsSource}>{children}</DocsRouteLayout>
}
