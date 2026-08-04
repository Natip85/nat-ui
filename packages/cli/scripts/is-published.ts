import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'

import {hasVersion} from './registry-versions'

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
  process.stdout.write(`version=${version}\npublished=${String(hasVersion(document, version))}\n`)
}

await main()
