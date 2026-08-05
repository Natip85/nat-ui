'use client'

import {DynamicCodeBlock} from 'fumadocs-ui/components/dynamic-codeblock'
import {useState} from 'react'

/**
 * Source is shown below its preview rather than behind a tab, so a reader sees
 * the result and the code that produced it at once. Long files are clipped
 * instead of pushing the next section off the screen, and the fade is what
 * signals there is more rather than an arbitrary cut.
 */
export function CollapsibleCode({
  code,
  lang = 'tsx',
  collapsedHeight = 'max-h-52',
}: {
  code: string
  lang?: string
  collapsedHeight?: string
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className='relative'>
      <div className={expanded ? undefined : `${collapsedHeight} overflow-hidden`}>
        <DynamicCodeBlock lang={lang} code={code} />
      </div>

      <div
        data-expanded={expanded}
        className='from-fd-background absolute inset-x-0 bottom-0 flex items-end justify-center rounded-b-xl bg-gradient-to-t to-transparent pb-3 data-[expanded=false]:h-28 data-[expanded=true]:h-auto data-[expanded=true]:bg-none'
      >
        <button
          type='button'
          onClick={() => setExpanded(!expanded)}
          className='bg-fd-secondary text-fd-secondary-foreground hover:bg-fd-accent hover:text-fd-accent-foreground rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors'
        >
          {expanded ? 'Collapse' : 'View Code'}
        </button>
      </div>
    </div>
  )
}
