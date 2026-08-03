import {mkdir, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {CONFIG_FILE_NAME, type Config} from '@nat-ui/schema'
import {aliasesFor, resolveConfig, type InitAnswers} from '../config/resolve'
import {installCommand, type PackageManager} from '../detect/package-manager'
import {detectProject} from '../detect/project'
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

/** `@/lib/utils` with prefix `@` and tsconfig paths rooted at src → `src/lib/utils.ts`. */
const utilsPath = (alias: string, prefix: string, underSrc: boolean, tsx: boolean): string => {
  const withoutPrefix = alias.startsWith(`${prefix}/`) ? alias.slice(prefix.length + 1) : alias
  const extension = tsx ? '.ts' : '.js'

  return join(underSrc ? 'src' : '', `${withoutPrefix}${extension}`)
}

export const init = async (io: InitIo, options: {yes: boolean}): Promise<number> => {
  const detected = await detectProject(io.cwd, io.env)

  if (!detected.hasPackageJson) {
    io.log('No package.json found here. Run init from the root of your project.')

    return 1
  }

  const configPath = join(io.cwd, CONFIG_FILE_NAME)
  if ((await readText(configPath)) !== undefined) {
    const overwrite = io.interactive ? await io.confirmOverwrite() : false
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
    answers = gathered
  } catch (error) {
    io.log(error instanceof Error ? error.message : String(error))

    return 1
  }

  if (answers.tsx && !detected.hasTsconfig) {
    io.log('No tsconfig.json found, so the import alias cannot be verified. Continuing anyway.')
  }

  const stylesheetPath = join(io.cwd, answers.css)
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

  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  io.log(`Wrote ${CONFIG_FILE_NAME}`)

  const underSrc = answers.css.startsWith('src/')
  const relativeUtils = utilsPath(
    aliasesFor(answers.aliasPrefix).utils,
    answers.aliasPrefix,
    underSrc,
    answers.tsx,
  )
  const absoluteUtils = join(io.cwd, relativeUtils)

  if ((await readText(absoluteUtils)) === undefined) {
    await mkdir(dirname(absoluteUtils), {recursive: true})
    await writeFile(absoluteUtils, cnTemplate(answers.tsx), 'utf8')
    io.log(`Wrote ${relativeUtils}`)
  } else {
    io.log(`Left ${relativeUtils} alone, since it already exists.`)
  }

  await writeFile(stylesheetPath, themed, 'utf8')
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
