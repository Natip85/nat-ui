export type PackageManager = 'pnpm' | 'yarn' | 'npm' | 'bun'

/**
 * Ordered, so a project carrying more than one lockfile resolves predictably
 * rather than by directory listing order.
 */
const LOCKFILES: readonly (readonly [string, PackageManager])[] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
  ['bun.lock', 'bun'],
]

const isPackageManager = (value: string): value is PackageManager =>
  value === 'pnpm' || value === 'yarn' || value === 'npm' || value === 'bun'

export const detectPackageManager = (
  files: readonly string[],
  userAgent: string | undefined,
): PackageManager => {
  for (const [lockfile, manager] of LOCKFILES) {
    if (files.includes(lockfile)) return manager
  }

  // npm_config_user_agent looks like "pnpm/10.34.5 npm/? node/v22.13.0".
  const name = userAgent?.split('/')[0]
  if (name !== undefined && isPackageManager(name)) return name

  return 'npm'
}

export const installCommand = (
  pm: PackageManager,
  packages: readonly string[],
): {command: string; args: string[]} => ({
  command: pm,
  args: [pm === 'npm' ? 'install' : 'add', ...packages],
})
