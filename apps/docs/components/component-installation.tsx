import {Step, Steps} from 'fumadocs-ui/components/steps'
import {Tab, Tabs} from 'fumadocs-ui/components/tabs'
import {executeCommands, installCommands} from '@/lib/package-manager'
import {resolvePayloads} from '@/lib/registry-payload'
import {cliPackage} from '@/lib/shared'
import {CollapsibleCode} from './collapsible-code'
import {CommandTabs} from './command-tabs'

/**
 * Two routes to the same result. The CLI is the one to reach for; the manual
 * steps are for projects that would rather paste the source than run a binary,
 * and for anyone who wants to see what the CLI is about to do.
 *
 * Everything here is derived from the built registry — the npm packages, the
 * files, and the components pulled in by dependency — so a page can never
 * promise an install that differs from the one the CLI performs.
 */
export async function ComponentInstallation({item}: {item: string}) {
  const payloads = await resolvePayloads(item)
  const dependencies = [...new Set(payloads.flatMap((payload) => payload.dependencies ?? []))]
  const files = payloads.flatMap((payload) => payload.files)

  return (
    <Tabs items={['Command', 'Manual']}>
      <Tab value='Command'>
        <CommandTabs commands={executeCommands(`${cliPackage} add ${item}`)} />
      </Tab>

      <Tab value='Manual'>
        <Steps>
          <Step>
            <h4>Install the following dependencies:</h4>
            <CommandTabs commands={installCommands(dependencies)} />
          </Step>

          <Step>
            <h4>Copy and paste the following code into your project:</h4>
            {files.map((file) => (
              <div key={file.path} className='not-prose my-4 flex flex-col gap-2'>
                <span className='text-fd-muted-foreground font-mono text-xs'>{file.path}</span>
                <CollapsibleCode code={file.content} />
              </div>
            ))}
          </Step>

          <Step>
            <h4>Update the import paths to match your project setup.</h4>
          </Step>
        </Steps>
      </Tab>
    </Tabs>
  )
}
