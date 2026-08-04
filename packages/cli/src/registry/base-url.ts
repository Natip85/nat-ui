/**
 * Served straight from the repository so the registry needs no infrastructure.
 * The documentation site can take this over later by changing this default, or
 * anyone can point elsewhere with `--registry`, without a change to `add`.
 */
export const DEFAULT_REGISTRY_URL = 'https://raw.githubusercontent.com/Natip85/nat-ui/main/r'

const trimmed = (value: string | undefined): string | undefined => {
  const next = value?.trim()

  if (next === undefined || next === '') {
    return undefined
  }

  const withoutTrailingSlashes = next.replace(/\/+$/, '')

  return withoutTrailingSlashes === '' ? undefined : withoutTrailingSlashes
}

/** Flag beats environment beats default. */
export const resolveBaseUrl = (flag: string | undefined, env: NodeJS.ProcessEnv): string =>
  trimmed(flag) ?? trimmed(env.NAT_UI_REGISTRY_URL) ?? DEFAULT_REGISTRY_URL
