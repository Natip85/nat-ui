import {buttonVariants} from '@nat-ui/registry/components/ui/button-variants'
import {transitionStyle} from '@nat-ui/registry/lib/motion'
import type {Metadata} from 'next'
import Link from 'next/link'
import {appName, siteDescription} from '@/lib/shared'

// `buttonVariants` carries the press scale but not the timing that makes it a
// press rather than a jump, so a server-rendered link has to ask for the
// preset itself. Doing it here also keeps the motion module server-safe: if it
// ever grows a runtime React import again, this page stops building.
const press = transitionStyle('snappy')

// `absolute` so the landing page is not titled "nat-ui · nat-ui".
export const metadata: Metadata = {
  title: {absolute: `${appName} — ${siteDescription}`},
}

export default function HomePage() {
  return (
    <main className='flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center'>
      <h1 className='max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl'>
        Components you own, not dependencies you configure
      </h1>
      <p className='text-fd-muted-foreground max-w-xl text-lg'>
        nat-ui copies components into your project as source you can edit. Built on Base UI for
        behavior and Tailwind CSS for styling.
      </p>
      <code className='bg-fd-muted rounded-lg px-4 py-3 font-mono text-sm'>
        npx @nat-ui/cli@latest init
      </code>
      <div className='flex gap-3'>
        <Link
          href='/docs'
          className={buttonVariants({variant: 'default', size: 'lg'})}
          style={press}
        >
          Get started
        </Link>
        <Link
          href='/components'
          className={buttonVariants({variant: 'outline', size: 'lg'})}
          style={press}
        >
          Browse components
        </Link>
      </div>
    </main>
  )
}
