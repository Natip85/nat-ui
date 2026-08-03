#!/usr/bin/env node
import {createRequire} from 'node:module'
import {parseArgs} from 'node:util'
import {init} from './commands/init'
import {isEntryPoint} from './is-entry-point'
import {ask, confirmOverwrite} from './prompts/ask'

// Resolved at runtime rather than imported, so `../package.json` points at this
// package whether we are running from `src/` or from the bundled `dist/`.
const {version} = createRequire(import.meta.url)('../package.json') as {version: string}

export const help = `
  nat-ui v${version}

  Usage
    $ nat-ui <command> [options]

  Commands
    init    Configure a project to use nat-ui
    add     Add a component to your project

  Options
    -y, --yes       Accept every default without asking
    -v, --version   Print the version
    -h, --help      Show this message
`

type Log = (message: string) => void

// Only argument-parsing failures become usage errors; anything else is a bug
// and should surface as one rather than being reported as bad input.
const isUsageError = (error: unknown): error is Error =>
  error instanceof Error &&
  'code' in error &&
  typeof error.code === 'string' &&
  error.code.startsWith('ERR_PARSE_ARGS_')

// Node follows "Unknown option '--yse'." with advice about passing positionals
// after `--`, which is irrelevant to a typo, so keep only the first sentence.
const firstSentence = (message: string): string => {
  const [first] = message.split('. ')

  return first === undefined ? message : `${first}.`
}

export const run = async (argv: readonly string[], log: Log): Promise<number> => {
  let values: {yes: boolean; version: boolean; help: boolean}
  let positionals: string[]

  try {
    ;({values, positionals} = parseArgs({
      args: [...argv],
      options: {
        yes: {type: 'boolean', short: 'y', default: false},
        version: {type: 'boolean', short: 'v', default: false},
        help: {type: 'boolean', short: 'h', default: false},
      },
      allowPositionals: true,
      strict: true,
    }))
  } catch (error) {
    if (!isUsageError(error)) {
      throw error
    }

    log(`${firstSentence(error.message)}\n${help}`)

    return 1
  }

  if (values.version) {
    log(version)

    return 0
  }

  const command = positionals[0]

  if (command === undefined || values.help) {
    log(help)

    return 0
  }

  if (command === 'init') {
    const [, extra] = positionals
    if (extra !== undefined) {
      log(`Unknown argument: '${extra}'.\n${help}`)

      return 1
    }

    return init(
      {
        cwd: process.cwd(),
        env: process.env,
        interactive: process.stdin.isTTY === true,
        ask,
        confirmOverwrite,
        install: async (pm, packages, cwd) => {
          const {installCommand} = await import('./detect/package-manager')
          const {spawnInstall} = await import('./install/spawn-install')
          const {command: bin, args} = installCommand(pm, packages)

          await spawnInstall(bin, args, cwd)
        },
        log,
      },
      {yes: values.yes},
    )
  }

  log(`Unknown command: ${command}\n${help}`)

  return 1
}

// Only run when invoked as the binary. Comparing against argv[1] matters because
// index.test.ts imports this module, and `process.argv[1] !== undefined` would be
// true there too, making the test run the whole CLI on import.
if (isEntryPoint(import.meta.url, process.argv[1])) {
  run(process.argv.slice(2), (message) => {
    console.log(message)
  })
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
