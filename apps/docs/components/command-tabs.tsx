import {DynamicCodeBlock} from 'fumadocs-ui/components/dynamic-codeblock'
import {Tab, Tabs} from 'fumadocs-ui/components/tabs'
import {type PackageManager, packageManagers} from '@/lib/package-manager'

/**
 * One command in each package manager's dialect. Readers copy a line and run
 * it, so offering only pnpm would make three quarters of them translate it
 * themselves and get it subtly wrong.
 */
export function CommandTabs({commands}: {commands: Record<PackageManager, string>}) {
  return (
    <Tabs items={[...packageManagers]}>
      {packageManagers.map((manager) => (
        <Tab key={manager} value={manager}>
          <DynamicCodeBlock lang='bash' code={commands[manager]} />
        </Tab>
      ))}
    </Tabs>
  )
}
