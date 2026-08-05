import {HomeLayout} from 'fumadocs-ui/layouts/home'
import {baseOptions, homeSlots} from '@/lib/layout.shared'

export default function Layout({children}: LayoutProps<'/'>) {
  return (
    <HomeLayout {...baseOptions()} slots={homeSlots}>
      {children}
    </HomeLayout>
  )
}
