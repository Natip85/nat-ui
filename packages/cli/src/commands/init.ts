import {mkdir} from 'node:fs/promises'
import {dirname, isAbsolute, join, relative} from 'node:path'
import {CONFIG_FILE_NAME, type Config} from '@nat-ui/schema'
import {aliasesFor, resolveConfig, type InitAnswers} from '../config/resolve'
import {installCommand, type PackageManager} from '../detect/package-manager'
import {detectProject, targetDirForPrefix, toPosixPath} from '../detect/project'
import {atomicWriteFile} from '../fs/atomic-write'
import {readText} from '../fs/read-text'
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

/**
 * Judged purely on the path the user gave — never on where it resolves on disk — so
 * a stylesheet that is itself a symlink pointing outside the project (a real
 * monorepo pattern) is still accepted. Only a path that already reads outside the
 * project root, like `../../elsewhere.css`, is refused.
 */
const isWithinRoot = (root: string, target: string): boolean => {
  const rel = relative(root, target)

  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** `@/lib/utils` with prefix `@` and a paths target rooted at `src` → `src/lib/utils.ts`. */
const utilsPath = (alias: string, prefix: string, baseDir: string, tsx: boolean): string => {
  const withoutPrefix = alias.startsWith(`${prefix}/`) ? alias.slice(prefix.length + 1) : alias
  const extension = tsx ? '.ts' : '.js'

  return join(baseDir, `${withoutPrefix}${extension}`)
}

export const init = async (io: InitIo, options: {yes: boolean}): Promise<number> => {
  const detected = await detectProject(io.cwd, io.env)

  if (!detected.hasPackageJson) {
    io.log('No package.json found here. Run init from the root of your project.')

    return 1
  }
  if (detected.packageJsonParseError) {
    io.log('package.json could not be parsed. Fix it and run init again.')

    return 1
  }

  const configPath = join(io.cwd, CONFIG_FILE_NAME)
  if ((await readText(configPath)) !== undefined) {
    // `--yes` means "accept every default without being asked" (per the README), so it
    // must decline here rather than prompt, exactly like a non-TTY does.
    const overwrite = io.interactive && !options.yes ? await io.confirmOverwrite() : false
    if (!overwrite) {
      io.log(`${CONFIG_FILE_NAME} already exists. Nothing was changed.`)

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
    io.log(`${answers.css} resolves outside the project. Choose a stylesheet inside ${io.cwd}.`)

    return 1
  }

  const stylesheet = await readText(stylesheetPath)
  if (stylesheet === undefined) {
    io.log(`Could not read ${answers.css}. Nothing was changed.`)

    return 1
  }

  // Both of these can fail on bad input, so they run before the first write. Once
  // the config file lands, a later failure would leave a half-configured project.
  let config: Config
  let themed: string
  try {
    config = resolveConfig(answers)
    themed = applyTheme(stylesheet, PRESETS[answers.baseColor])
  } catch (error) {
    io.log(error instanceof Error ? error.message : String(error))

    return 1
  }

  await atomicWriteFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
  io.log(`Wrote ${CONFIG_FILE_NAME}`)

  // Prefer where tsconfig's `paths` says the alias the user actually chose
  // resolves — not whichever prefix was merely detected, since the prompt can
  // override it — falling back to a guess from the stylesheet's location when
  // there's nothing more reliable to go on, or when the `paths` target turns
  // out to point outside the project (a hint, not a user instruction, so it's
  // discarded rather than trusted enough to write there).
  const cssBaseDir = answers.css.startsWith('src/') ? 'src' : ''
  const aliasTargetDir = targetDirForPrefix(detected.aliasTargets, answers.aliasPrefix)
  const utilsBaseDir =
    aliasTargetDir !== undefined && isWithinRoot(io.cwd, join(io.cwd, aliasTargetDir))
      ? aliasTargetDir
      : cssBaseDir
  const relativeUtils = utilsPath(
    aliasesFor(answers.aliasPrefix).utils,
    answers.aliasPrefix,
    utilsBaseDir,
    answers.tsx,
  )
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
