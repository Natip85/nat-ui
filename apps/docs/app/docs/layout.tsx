import {DocsLayout} from 'fumadocs-ui/layouts/docs'
import {baseOptions} from '@/lib/layout.shared'
import {docsSource} from '@/lib/source'

export default function Layout({children}: LayoutProps<'/docs'>) {
  return (
    <DocsLayout tree={docsSource.getPageTree()} {...baseOptions()}>
      {children}
    </DocsLayout>
  )
}
