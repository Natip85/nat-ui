import {readFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {asConsumerSource} from '@/lib/demo-source'
import {CollapsibleCode} from './collapsible-code'
import {demos} from './demos/registry'

const demosDir = join(dirname(fileURLToPath(import.meta.url)), 'demos')

/**
 * A worked example: the component running, and directly beneath it the source
 * that produced it. The source is read from the demo file at build time rather
 * than repeated in the page, so the two cannot disagree.
 */
export async function ComponentPreview({name}: {name: string}) {
  const demo = demos[name]
  if (!demo) throw new Error(`No demo is registered under "${name}".`)

  const Demo = demo.component
  const source = await readFile(join(demosDir, demo.file), 'utf8')

  return (
    <div className='not-prose my-6 flex flex-col gap-3'>
      <div className='bg-fd-card flex min-h-56 items-center justify-center rounded-xl border p-8'>
        <Demo />
      </div>
      <CollapsibleCode code={asConsumerSource(source)} />
    </div>
  )
}
