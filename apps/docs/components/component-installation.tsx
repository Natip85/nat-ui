import {Step, Steps} from 'fumadocs-ui/components/steps'
import {Tab, Tabs} from 'fumadocs-ui/components/tabs'
import Link from 'next/link'
import {executeCommands, installCommands} from '@/lib/package-manager'
import {resolvePayloads} from '@/lib/registry-payload'
import {cliPackage, siteUrl} from '@/lib/shared'
import {CollapsibleCode} from './collapsible-code'
import {CommandTabs} from './command-tabs'

/**
 * Three routes to the same result. shadcn is the one to reach for if the
 * project already has that CLI, since its own `init` already did the setup
 * the other two routes still need; the nat-ui CLI is for a project that does
 * not; the manual steps are for anyone who would rather paste the source
 * directly or see what either CLI is about to do.
 *
 * Everything here is derived from the built registry — the npm packages, the
 * files, and the components pulled in by dependency — so a page can never
 * promise an install that differs from the one either CLI performs.
 */
export async function ComponentInstallation({item}: {item: string}) {
  const payloads = await resolvePayloads(item)
  const dependencies = [...new Set(payloads.flatMap((payload) => payload.dependencies ?? []))]
  const files = payloads.flatMap((payload) => payload.files)

  return (
    <>
      {/* Naming the precondition is still the difference between a route to the
          same result and one that does not compile, so it cannot be dropped now
          that a route exists without it. The shadcn route is the exemption
          rather than the rule: `shadcn init` writes the `cn` helper and the
          theme tokens itself, which is the whole reason it leads. */}
      <p>
        Install with whichever CLI your project already has. The{' '}
        <Link href='/docs/installation'>nat-ui CLI</Link> and manual routes assume{' '}
        <code>{`${cliPackage} init`}</code> has run, because the files below import <code>cn</code>{' '}
        from your utils alias and are styled against the theme tokens it writes. The shadcn route
        needs none of that — <code>shadcn init</code> has already written both.
      </p>

      <Tabs items={['shadcn', 'nat-ui CLI', 'Manual']}>
        <Tab value='shadcn'>
          <CommandTabs commands={executeCommands(`shadcn@latest add ${siteUrl}/s/${item}.json`)} />
        </Tab>

        <Tab value='nat-ui CLI'>
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
