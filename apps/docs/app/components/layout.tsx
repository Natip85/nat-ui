import {DocsLayout} from 'fumadocs-ui/layouts/docs'
import {baseOptions} from '@/lib/layout.shared'
import {componentsSource} from '@/lib/source'

export default function Layout({children}: LayoutProps<'/components'>) {
  return (
    <DocsLayout tree={componentsSource.getPageTree()} {...baseOptions()}>
      {children}
    </DocsLayout>
  )
}
