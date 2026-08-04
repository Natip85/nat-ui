import {mkdir} from 'node:fs/promises'
import {basename, dirname, join} from 'node:path'
import type {RegistryItemPayload} from '@nat-ui/schema'
import {readConfig} from '../config/read'
import {installCommand, type PackageManager} from '../detect/package-manager'
import {detectProject, toPosixPath} from '../detect/project'
import {atomicWriteFile} from '../fs/atomic-write'
import {readText} from '../fs/read-text'
import {aliasBaseDir, aliasPrefixOf, aliasToPath} from '../paths/alias'
import {resolveBaseUrl} from '../registry/base-url'
import {fetchIndex, fetchItem, type FetchJson} from '../registry/fetch-item'
import {assertValidItemName} from '../registry/item-name'
import {resolveItems} from '../registry/resolve-graph'
import {rewriteImports} from '../transform/rewrite-imports'
import {applyClientDirective} from '../transform/use-client'

export interface AddIo {
  cwd: string
  env: NodeJS.ProcessEnv
  interactive: boolean
  fetchJson: FetchJson
  confirmOverwrite: (paths: readonly string[]) => Promise<boolean>
  install: (pm: PackageManager, packages: readonly string[], cwd: string) => Promise<void>
  log: (message: string) => void
}

export interface AddOptions {
  names: readonly string[]
  yes: boolean
  overwrite: boolean
  registry: string | undefined
}

interface PlannedFile {
  relative: string
  absolute: string
  content: string
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** Best-effort: the index is a nicety, so failing to read it must not mask the real error. */
const withAvailable = async (baseUrl: string, io: AddIo, message: string): Promise<string> => {
  try {
    const index = await fetchIndex(baseUrl, io.fetchJson)
    const names = index.items.map((entry) => entry.name).join(', ')

    return names === '' ? message : `${message} Available components: ${names}.`
  } catch {
    return message
  }
}

export const add = async (io: AddIo, options: AddOptions): Promise<number> => {
  const baseUrl = resolveBaseUrl(options.registry, io.env)

  if (options.names.length === 0) {
    io.log(await withAvailable(baseUrl, io, 'Name at least one component to add.'))

    return 1
  }

  try {
    for (const name of options.names) assertValidItemName(name)
  } catch (error) {
    io.log(messageOf(error))

    return 1
  }

  const found = await readConfig(io.cwd)
  if (found.status === 'missing') {
    io.log('No components.json here. Run "nat-ui init" first.')

    return 1
  }
  if (found.status === 'invalid') {
    io.log(found.message)

    return 1
  }

  const config = found.config
  if (!config.tsx) {
    io.log(
      'This project is configured for JavaScript. add can only write TypeScript components for now.',
    )

    return 1
  }

  // Everything that can fail happens here, before a single file is touched.
  let items: RegistryItemPayload[]
  try {
    items = await resolveItems(options.names, (name) => fetchItem(baseUrl, name, io.fetchJson))
  } catch (error) {
    io.log(await withAvailable(baseUrl, io, messageOf(error)))

    return 1
  }

  const detected = await detectProject(io.cwd, io.env)
  const prefix = aliasPrefixOf(config.aliases.ui)
  const baseDir = aliasBaseDir(io.cwd, detected.aliasTargets, prefix, config.tailwind.css)
  const uiDir = aliasToPath(config.aliases.ui, prefix, baseDir)

  const planned: PlannedFile[] = []
  for (const item of items) {
    for (const file of item.files) {
      if (file.type !== 'ui') {
        io.log(`"${item.name}" contains a "${file.type}" file, which this version cannot install.`)

        return 1
      }

      // Only the basename matters: the directory in the document is the
      // registry's own layout, not a structure to reproduce in someone's app.
      const relative = join(uiDir, basename(toPosixPath(file.path)))
      const rewritten = rewriteImports(file.content, {
        ui: config.aliases.ui,
        utils: config.aliases.utils,
      })

      planned.push({
        relative: toPosixPath(relative),
        absolute: join(io.cwd, relative),
        content: applyClientDirective(rewritten, config.rsc),
      })
    }
  }

  const existing: string[] = []
  for (const file of planned) {
    if ((await readText(file.absolute)) !== undefined) existing.push(file.relative)
  }

  // `--overwrite` is an instruction; `--yes` only means "accept defaults", and
  // the default here is to leave someone's edits alone. So the flag wins.
  let overwrite = options.overwrite
  if (!overwrite && existing.length > 0) {
    overwrite = io.interactive && !options.yes ? await io.confirmOverwrite(existing) : false
  }

  for (const file of planned) {
    if (!overwrite && existing.includes(file.relative)) {
      io.log(`Left ${file.relative} alone, since it already exists.`)
      continue
    }

    await mkdir(dirname(file.absolute), {recursive: true})
    await atomicWriteFile(file.absolute, file.content)
    io.log(`Wrote ${file.relative}`)
  }

  const packages = [...new Set(items.flatMap((item) => item.dependencies ?? []))].sort()
  if (packages.length > 0) {
    const {command, args} = installCommand(detected.packageManager, packages)
    try {
      await io.install(detected.packageManager, packages, io.cwd)
      io.log(`Installed ${packages.join(', ')}`)
    } catch (error) {
      io.log(messageOf(error))
      io.log(`Install failed. Run this by hand: ${command} ${args.join(' ')}`)

      return 1
    }
  }

  return 0
}
