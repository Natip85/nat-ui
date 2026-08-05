/**
 * The four package managers, in the order the tabs show them. Readers copy the
 * one line that matches their project, so every command a page prints has to
 * exist in all four dialects rather than assuming pnpm.
 */
export const packageManagers = ['pnpm', 'npm', 'yarn', 'bun'] as const

export type PackageManager = (typeof packageManagers)[number]

export const installCommands = (packages: readonly string[]): Record<PackageManager, string> => {
  const list = packages.join(' ')

  return {
    pnpm: `pnpm add ${list}`,
    npm: `npm install ${list}`,
    yarn: `yarn add ${list}`,
    bun: `bun add ${list}`,
  }
}

/** Running a published binary without installing it first. */
export const executeCommands = (args: string): Record<PackageManager, string> => ({
  pnpm: `pnpm dlx ${args}`,
  npm: `npx ${args}`,
  yarn: `yarn dlx ${args}`,
  bun: `bunx ${args}`,
})
