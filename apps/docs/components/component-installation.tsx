import {Step, Steps} from 'fumadocs-ui/components/steps'
import {Tab, Tabs} from 'fumadocs-ui/components/tabs'
import Link from 'next/link'
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
    <>
      {/* Neither route stands alone: the files below import `cn` from the utils
          alias and are styled against the theme tokens, both of which init
          writes. Saying so here is the difference between two routes to the
          same result and one route that does not compile. */}
      <p>
        Both routes assume <Link href='/docs/installation'>{`${cliPackage} init`}</Link> has already
        run in this project. It writes the <code>cn</code> helper these files import, installs{' '}
        <code>clsx</code> and <code>tailwind-merge</code>, and adds the theme tokens they are styled
        against.
      </p>

      <Tabs items={['Command', 'Manual']}>
        <Tab value='Command'>
          <CommandTabs commands={executeCommands(`${cliPackage}@latest add ${item}`)} />
        </Tab>

        <Tab value='Manual'>
          <Steps>
            {/* An item can legitimately declare no npm dependencies, and
                `pnpm add` with nothing after it is not a command anyone can run. */}
            {dependencies.length > 0 && (
              <Step>
                <h4>Install the following dependencies:</h4>
                <CommandTabs commands={installCommands(dependencies)} />
              </Step>
            )}

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
    </>
  )
}
