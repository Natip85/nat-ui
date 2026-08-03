#!/usr/bin/env node
import {createRequire} from 'node:module'

// Resolved at runtime rather than imported, so `../package.json` points at this
// package whether we are running from `src/` or from the bundled `dist/`.
const {version} = createRequire(import.meta.url)('../package.json') as {version: string}

const help = `
  nat-ui v${version}

  Usage
    $ nat-ui <command> [options]

  Commands
    init    Configure a project to use nat-ui
    add     Add a component to your project

  Options
    -v, --version   Print the version
    -h, --help      Show this message
`

const main = (argv: string[]): void => {
  if (argv.includes('-v') || argv.includes('--version')) {
    console.log(version)
    return
  }

  console.log(help)
}

main(process.argv.slice(2))
