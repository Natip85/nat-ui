import {RootProvider} from 'fumadocs-ui/provider/next'
import type {Metadata} from 'next'
import {Inter} from 'next/font/google'
import {appName, siteDescription, siteUrl} from '@/lib/shared'
import './global.css'

const inter = Inter({subsets: ['latin']})

/**
 * The one place a title is composed. Pages set only their own title; the
 * template appends the project, so no page has to remember to — and the home
 * page and the 404, which set an absolute title, are the two that opt out.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {default: appName, template: `%s · ${appName}`},
  description: siteDescription,
  openGraph: {
    title: appName,
    description: siteDescription,
    url: siteUrl,
    siteName: appName,
    type: 'website',
  },
}

export default function Layout({children}: LayoutProps<'/'>) {
  return (
    <html lang='en' className={inter.className} suppressHydrationWarning>
      <body className='flex min-h-screen flex-col'>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  )
}
