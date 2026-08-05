import {mkdir} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {CONFIG_FILE_NAME, type Config} from '@nat-ui/schema'
import {aliasesFor, resolveConfig, type InitAnswers} from '../config/resolve'
import {installCommand, type PackageManager} from '../detect/package-manager'
import {detectProject, targetDirForPrefix, toPosixPath} from '../detect/project'
import {atomicWriteFile} from '../fs/atomic-write'
import {readText} from '../fs/read-text'
import {aliasBaseDir, aliasToPath, isWithinRoot} from '../paths/alias'
import {defaultAnswers, type Asker} from '../prompts/ask'
import {cnTemplate} from '../templates/cn'
import {applyTheme} from '../theme/apply'
import {PRESETS} from '../theme/presets'

export interface InitIo {
  cwd: string
  env: NodeJS.ProcessEnv
  interactive: boolean
  ask: Asker
  confirmOverwrite: () => Promise<boolean>
  install: (pm: PackageManager, packages: readonly string[], cwd: string) => Promise<void>
  log: (message: string) => void
}

export const INSTALLED_PACKAGES = ['clsx', 'tailwind-merge'] as const

export const init = async (io: InitIo, options: {yes: boolean}): Promise<number> => {
  const detected = await detectProject(io.cwd, io.env)

  if (!detected.hasPackageJson) {
    io.log('No package.json found here. Run init from the root of your project.')

    return 1
  }
  if (detected.packageJsonParseError) {
    io.log('Could not parse package.json. Fix it and run init again.')

    return 1
  }

  const configPath = join(io.cwd, CONFIG_FILE_NAME)
  if ((await readText(configPath)) !== undefined) {
    // `--yes` means "accept every default without being asked" (per the README), so it
    // must decline here rather than prompt, exactly like a non-TTY does.
    const overwrite = io.interactive && !options.yes ? await io.confirmOverwrite() : false
    if (!overwrite) {
      io.log(`Found an existing ${CONFIG_FILE_NAME}. Nothing was changed.`)

      return 0
    }
  }

  let answers: InitAnswers
  try {
    const gathered =
      io.interactive && !options.yes ? await io.ask(detected) : defaultAnswers(detected)
    if (gathered === undefined) {
      io.log('Cancelled. Nothing was changed.')

      return 1
    }
    // Normalized once here so every downstream use — the stylesheet lookup, the
    // utility placement heuristic, and what lands in components.json — agrees,
    // regardless of which separator style the user typed at the prompt.
    answers = {...gathered, css: toPosixPath(gathered.css)}
  } catch (error) {
    io.log(error instanceof Error ? error.message : String(error))

    return 1
  }

  if (answers.tsx && !detected.hasTsconfig) {
    io.log('No tsconfig.json found, so the import alias cannot be verified. Continuing anyway.')
  }

  const stylesheetPath = join(io.cwd, answers.css)
  if (!isWithinRoot(io.cwd, stylesheetPath)) {
    io.log(
      `${answers.css} resolves outside the project. Choose a stylesheet inside the project root.`,
    )

    return 1
  }

  const stylesheet = await readText(stylesheetPath)
  if (stylesheet === undefined) {
    io.log(`Could not read ${answers.css}. Nothing was changed.`)

    return 1
  }

  // Both of these can fail on bad input (an unresolvable config shape, an
  // already-damaged theme block), so they run before the first write.
  let config: Config
  let themed: string
  try {
    config = resolveConfig(answers)
    themed = applyTheme(stylesheet, PRESETS[answers.baseColor])
  } catch (error) {
    io.log(error instanceof Error ? error.message : String(error))

    return 1
  }

  // Use the prefix the user chose at the prompt, not the detected default —
  // the prompt can override it.
  const utilsBaseDir = aliasBaseDir(io.cwd, detected.aliasTargets, answers.aliasPrefix, answers.css)

  // The quiet failure behind every "cannot find module '@/lib/utils'" report:
  // the files land in the right place, but nothing tells the compiler what the
  // prefix means, so the first error a user sees comes from a file they did not
  // write. Vite is the usual case — `create-vite`'s root tsconfig.json is a
  // solution file with `files: []`, so it compiles nothing and an entry added
  // there has no effect. Warn rather than write: the tsconfig that actually
  // compiles the app is a guess from here, and editing someone's build config
  // is further than this command should reach.
  if (
    answers.tsx &&
    detected.hasTsconfig &&
    targetDirForPrefix(detected.aliasTargets, answers.aliasPrefix) === undefined
  ) {
    const target = utilsBaseDir === '' ? './*' : `./${utilsBaseDir}/*`
    io.log(
      `tsconfig.json does not map "${answers.aliasPrefix}/*" to a directory, so imports like "${aliasesFor(answers.aliasPrefix).utils}" will not resolve yet.`,
    )
    io.log(
      `Add "paths": {"${answers.aliasPrefix}/*": ["${target}"]} to the tsconfig that compiles your app. In a Vite project that is tsconfig.app.json, not tsconfig.json.`,
    )
  }

  const extension = answers.tsx ? '.ts' : '.js'
  const relativeUtils = `${aliasToPath(aliasesFor(answers.aliasPrefix).utils, answers.aliasPrefix, utilsBaseDir)}${extension}`
  const absoluteUtils = join(io.cwd, relativeUtils)

  if ((await readText(absoluteUtils)) === undefined) {
    await mkdir(dirname(absoluteUtils), {recursive: true})
    await atomicWriteFile(absoluteUtils, cnTemplate(answers.tsx))
    io.log(`Wrote ${relativeUtils}`)
  } else {
    io.log(`Left ${relativeUtils} alone, since it already exists.`)
  }

  await atomicWriteFile(stylesheetPath, themed)
  io.log(`Updated ${answers.css}`)

  // Written last, deliberately: `components.json` is the marker every future
  // `nat-ui add` trusts to mean "this project is set up", so it must only
  // land once the writes it depends on have actually succeeded. This is not
  // full transactional rollback — there is no undo for the utility or
  // stylesheet writes above once they succeed — it only guarantees that (1)
  // every fallible validation above ran before any write at all, (2) each
  // individual file write is atomic on its own (see `atomicWriteFile`), and
  // (3) the config is written after everything it describes, so it can never
  // announce a setup that didn't actually finish.
  await atomicWriteFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
  io.log(`Wrote ${CONFIG_FILE_NAME}`)

  const {command, args} = installCommand(detected.packageManager, INSTALLED_PACKAGES)
  try {
    await io.install(detected.packageManager, INSTALLED_PACKAGES, io.cwd)
    io.log(`Installed ${INSTALLED_PACKAGES.join(' and ')}`)
  } catch (error) {
    io.log(error instanceof Error ? error.message : String(error))
    io.log(`Install failed. Run this by hand: ${command} ${args.join(' ')}`)

    return 1
  }

  return 0
}
