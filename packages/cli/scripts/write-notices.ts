import {writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {generateNotices} from './generate-notices'

// This file is the executable entry point run via tsup's `onSuccess`. It is
// never imported by anything else, so it is safe for it to have side effects
// and to assume `dist/` already exists. Keep `generate-notices.ts` itself
// free of both.
const ROOT = fileURLToPath(new URL('../', import.meta.url))
const DIST = fileURLToPath(new URL('../dist/', import.meta.url))

const main = async (): Promise<void> => {
  const {content, packageCount} = await generateNotices({root: ROOT, distDir: DIST})

  await writeFile(resolve(ROOT, 'THIRD_PARTY_NOTICES'), content, 'utf8')

  console.log(`Wrote THIRD_PARTY_NOTICES for ${String(packageCount)} package(s).`)
}

await main()
