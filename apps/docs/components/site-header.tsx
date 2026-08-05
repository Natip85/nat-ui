'use client'

import {buttonVariants} from 'fumadocs-ui/components/ui/button'
import {SidebarTrigger} from 'fumadocs-ui/layouts/notebook/slots/sidebar'
import {FullSearchTrigger, SearchTrigger} from 'fumadocs-ui/layouts/shared/slots/search-trigger'
import {ThemeSwitch} from 'fumadocs-ui/layouts/shared/slots/theme-switch'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
import type {ComponentProps, ReactNode} from 'react'
import {appName, githubUrl, navLinks} from '@/lib/shared'

const cx = (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(' ')

const iconButton = buttonVariants({color: 'ghost', size: 'icon-sm'})

/**
 * Every layout ships a navigation bar of its own, wired to its own context, so
 * letting each section use its layout's bar puts the same controls in a
 * different order on each route. This is the bar for all of them: the layouts
 * contribute only where it sits, never what is in it.
 */
function SiteHeader({
  className,
  leading,
  ...props
}: ComponentProps<'header'> & {leading?: ReactNode}) {
  const pathname = usePathname()

  return (
    <header {...props} className={cx('sticky', className)}>
      <div className='bg-fd-background/80 flex h-14 items-center gap-2 border-b px-4 backdrop-blur-lg md:px-6'>
        {leading}

        <Link href='/' className='inline-flex items-center gap-2.5 font-semibold'>
          {appName}
        </Link>

        <nav className='flex items-center'>
          {navLinks.map(({text, url, nested}) => (
            <Link
              key={url}
              href={url}
              data-active={pathname === url || (nested && pathname.startsWith(`${url}/`))}
              className='text-fd-muted-foreground hover:text-fd-accent-foreground data-[active=true]:text-fd-primary p-2 text-sm transition-colors'
            >
              {text}
            </Link>
          ))}
        </nav>

        <div className='ms-auto flex items-center gap-1.5'>
          <FullSearchTrigger className='w-48 max-md:hidden' />
          <SearchTrigger className={cx(iconButton, 'md:hidden')} />
          <ThemeSwitch />
          <a
            href={githubUrl}
            aria-label='GitHub'
            target='_blank'
            rel='noreferrer noopener'
            className={iconButton}
          >
            <GitHubIcon />
          </a>
        </div>
      </div>
    </header>
  )
}

/**
 * The two mount points. Each carries the positioning its layout expects — the
 * documentation grid places the bar in a named area and measures the rest of
 * the page against its height — while the bar itself stays one component.
 */
export function HomeHeader(props: ComponentProps<'header'>) {
  return <SiteHeader {...props} className='top-0 z-40' />
}

export function DocsHeader(props: ComponentProps<'header'>) {
  return (
    <SiteHeader
      {...props}
      className='top-(--fd-docs-row-1) z-10 [grid-area:header] layout:[--fd-header-height:--spacing(14)]'
      leading={
        <SidebarTrigger aria-label='Open Sidebar' className={cx(iconButton, '-ms-1.5 md:hidden')}>
          <MenuIcon />
        </SidebarTrigger>
      }
    />
  )
}

function MenuIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      className='size-4'
    >
      <path d='M4 6h16M4 12h16M4 18h16' />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg role='img' viewBox='0 0 24 24' fill='currentColor' className='size-4'>
      <path d='M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12' />
    </svg>
  )
}
