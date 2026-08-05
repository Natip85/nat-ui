import {readFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {DynamicCodeBlock} from 'fumadocs-ui/components/dynamic-codeblock'
import {Tab, Tabs} from 'fumadocs-ui/components/tabs'
import {readPayload} from '@/lib/registry-payload'
import {demos} from './demos/registry'

const demosDir = join(dirname(fileURLToPath(import.meta.url)), 'demos')

/**
 * Three tabs rather than two. "Usage" answers how to reach for the component,
 * and "Installed source" is read from the built registry, so it is exactly
 * what lands in a project. Both are read at build time from the files the CLI
 * itself serves, so neither can drift from what a reader would actually get.
 */
export async function ComponentPreview({name, item}: {name: string; item: string}) {
  const demo = demos[name]
  if (!demo) throw new Error(`No demo is registered under "${name}".`)

  const Demo = demo.component
  const usage = await readFile(join(demosDir, demo.file), 'utf8')
  const payload = await readPayload(item)
  const installed = payload.files.map((file) => file.content).join('\n')

  return (
    <Tabs items={['Preview', 'Usage', 'Installed source']}>
      <Tab value='Preview'>
        <div className='flex min-h-56 items-center justify-center rounded-lg border p-8'>
          <Demo />
        </div>
      </Tab>
      <Tab value='Usage'>
        <DynamicCodeBlock lang='tsx' code={usage} />
      </Tab>
      <Tab value='Installed source'>
        <DynamicCodeBlock lang='tsx' code={installed} />
      </Tab>
    </Tabs>
  )
}
