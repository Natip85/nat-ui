import Link from 'next/link'

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
          className='bg-fd-primary text-fd-primary-foreground rounded-lg px-5 py-2.5 text-sm font-medium'
        >
          Get started
        </Link>
        <Link
          href='/components'
          className='border-fd-border rounded-lg border px-5 py-2.5 text-sm font-medium'
        >
          Browse components
        </Link>
      </div>
    </main>
  )
}
