/**
 * The documentation site, which serves the same `r/` the repository commits.
 *
 * Every published CLI bakes this value into its bundle, so whatever it names has
 * to keep answering for as long as that version is installable. Renaming or
 * deleting the Vercel project strands them, because nothing redirects from the
 * old subdomain; pointing the project at a custom domain later is safe, since
 * `fetch` follows redirects. Anyone can point elsewhere with `--registry`.
 */
export const DEFAULT_REGISTRY_URL = 'https://nat-ui-delta.vercel.app/r'

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
