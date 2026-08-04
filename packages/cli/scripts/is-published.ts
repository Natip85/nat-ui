import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'

import {hasVersion, versionsOf} from './registry-versions'

// Executable entry point for CI (never imported): it prints `key=value` lines
// the workflow appends directly to `$GITHUB_OUTPUT`.
const PACKAGE_JSON = fileURLToPath(new URL('../package.json', import.meta.url))
const REGISTRY = 'https://registry.npmjs.org'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const main = async (): Promise<void> => {
  const parsed: unknown = JSON.parse(await readFile(PACKAGE_JSON, 'utf8'))
  if (!isRecord(parsed)) throw new Error('Expected package.json to be an object.')

  const {name, version} = parsed
  if (typeof name !== 'string' || typeof version !== 'string') {
    throw new Error('Expected package.json to declare a string "name" and "version".')
  }

  const response = await fetch(`${REGISTRY}/${name}`)

  // A package with no published versions at all answers 404. That is "nothing
  // published yet", not a failure.
  if (response.status === 404) {
    process.stdout.write(`version=${version}\npublished=false\n`)

    return
  }

  // Any other failure leaves the answer genuinely unknown, so refuse to guess.
  // Guessing "not published" attempts a duplicate publish; guessing
  // "published" silently skips a real release.
  if (!response.ok) {
    throw new Error(
      `Could not read ${name} from ${REGISTRY} (HTTP ${String(response.status)}), so whether ` +
        `${version} is already published is unknown.`,
    )
  }

  const document: unknown = await response.json()
  const versions = versionsOf(document)

  // A 200 with no usable "versions" map (e.g. `{}`) is not the registry
  // saying "not published" — it is a response we don't understand, and
  // guessing here is the exact mistake this script exists to avoid.
  if (versions === undefined) {
    throw new Error(
      `Registry response for ${name} from ${REGISTRY} has no usable "versions" map, so whether ` +
        `${version} is already published is unknown.`,
    )
  }

  process.stdout.write(`version=${version}\npublished=${String(hasVersion(versions, version))}\n`)
}

await main()
