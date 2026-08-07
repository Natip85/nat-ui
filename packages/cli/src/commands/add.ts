import {mkdir} from 'node:fs/promises'
import {basename, dirname, isAbsolute, join, resolve} from 'node:path'
import type {RegistryItemPayload} from '@nat-ui/schema'
import {readConfig} from '../config/read'
import {installCommand, type PackageManager} from '../detect/package-manager'
import {detectProject, toPosixPath} from '../detect/project'
import {atomicWriteFile} from '../fs/atomic-write'
import {readText} from '../fs/read-text'
import {aliasBaseDir, aliasDirOf, aliasPrefixOf, aliasToPath, isWithinRoot} from '../paths/alias'
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
  all: boolean
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

  if (options.all && options.names.length > 0) {
    io.log('Pass either --all or component names, not both.')

    return 1
  }

  let requested: readonly string[]
  if (options.all) {
    try {
      requested = (await fetchIndex(baseUrl, io.fetchJson)).items.map((entry) => entry.name)
    } catch (error) {
      io.log(messageOf(error))

      return 1
    }
  } else {
    requested = options.names
  }

  if (requested.length === 0) {
    io.log(
      options.all
        ? 'The registry lists no components.'
        : await withAvailable(baseUrl, io, 'Name at least one component to add.'),
    )

    return 1
  }

  try {
    for (const name of requested) assertValidItemName(name)
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
    items = await resolveItems(requested, (name) => fetchItem(baseUrl, name, io.fetchJson))
  } catch (error) {
    io.log(await withAvailable(baseUrl, io, messageOf(error)))

    return 1
  }

  const detected = await detectProject(io.cwd, io.env)

  const resolveAliasDir = (alias: string): string => {
    if (isAbsolute(alias)) return alias
    const prefix = aliasPrefixOf(alias)

    return aliasToPath(
      alias,
      prefix,
      aliasBaseDir(io.cwd, detected.aliasTargets, prefix, config.tailwind.css),
    )
  }

  const uiDir = resolveAliasDir(config.aliases.ui)
  // Every config carries `utils`; `lib` is optional and absent from any
  // components.json written before lib items existed, so the directory holding
  // `utils` is the fallback rather than a hard-coded path.
  const libAlias = config.aliases.lib ?? aliasDirOf(config.aliases.utils)
  const libDir = resolveAliasDir(libAlias)

  const planned: PlannedFile[] = []
  const destinationItems = new Map<string, string>()
  for (const item of items) {
    for (const file of item.files) {
      if (file.type !== 'ui' && file.type !== 'lib') {
        io.log(
          `The add command only installs ui and lib files; "${item.name}" includes a ${file.type} file.`,
        )

        return 1
      }

      // Only the basename matters: the directory in the document is the
      // registry's own layout, not a structure to reproduce in someone's app.
      const targetDir = file.type === 'ui' ? uiDir : libDir
      const relative = toPosixPath(join(targetDir, basename(toPosixPath(file.path))))
      const priorItem = destinationItems.get(relative)
      if (priorItem !== undefined) {
        io.log(`Adding "${priorItem}" and "${item.name}" would both write to ${relative}.`)

        return 1
      }

      destinationItems.set(relative, item.name)
      const rewritten = rewriteImports(file.content, {
        ui: config.aliases.ui,
        utils: config.aliases.utils,
        lib: libAlias,
      })

      planned.push({
        relative,
        absolute: resolve(io.cwd, relative),
        content: applyClientDirective(rewritten, config.rsc),
      })
    }
  }

  for (const file of planned) {
    if (!isWithinRoot(io.cwd, file.absolute)) {
      io.log(
        `An alias resolves to ${file.relative} outside the project. Choose aliases inside the project root.`,
      )

      return 1
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

  const written: string[] = []
  const skipped: string[] = []
  try {
    for (const file of planned) {
      if (!overwrite && existing.includes(file.relative)) {
        skipped.push(file.relative)
        io.log(`Left ${file.relative} alone, since it already exists.`)
        continue
      }

      await mkdir(dirname(file.absolute), {recursive: true})
      await atomicWriteFile(file.absolute, file.content)
      written.push(file.relative)
      io.log(`Wrote ${file.relative}`)
    }
  } catch (error) {
    io.log(messageOf(error))
    if (written.length > 0) {
      io.log(
        `Could not finish writing. Already wrote: ${written.join(', ')}. The component set is incomplete — remove those files or fix the problem and run add again.`,
      )
    } else {
      io.log(
        'Could not finish writing. The component set is incomplete — fix the problem and run add again.',
      )
    }

    return 1
  }

  // A component is now more than one file, so keeping an old copy of one of
  // them while taking new copies of the rest leaves a set that does not agree
  // with itself. Worth saying plainly, because every individual line above
  // reads like success.
  if (skipped.length > 0 && written.length > 0) {
    io.log(
      `Kept ${skipped.join(', ')} but wrote ${written.join(', ')}, so these files come from different versions. Run add again with --overwrite to take the whole set.`,
    )
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
