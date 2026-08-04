import {HomeLayout} from 'fumadocs-ui/layouts/home'
import Link from 'next/link'
import {baseOptions} from '@/lib/layout.shared'

/**
 * The navigation bar is global, and a 404 is the page a lost reader is most
 * likely to need it on. Without this boundary the route falls outside every
 * section layout and renders bare.
 */
export default function NotFound() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className='flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center'>
        <h1 className='text-3xl font-bold tracking-tight'>Page not found</h1>
        <p className='text-fd-muted-foreground max-w-md'>
          That page does not exist. It may have been renamed, or the link that brought you here may
          be out of date.
        </p>
        <Link
          href='/docs'
          className='bg-fd-primary text-fd-primary-foreground rounded-lg px-5 py-2.5 text-sm font-medium'
        >
          Read the docs
        </Link>
      </main>
    </HomeLayout>
  )
}
