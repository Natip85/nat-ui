import {readdir, readFile, stat} from 'node:fs/promises'
import {join} from 'node:path'
import {undefinedCustomProperties} from './css-custom-properties'

// This file is the executable entry point run directly in CI (never
// imported), so side effects and `process.exitCode` are fine here.
//
// It points at a *built* app's CSS output, not at any source in `r/` or
// `s/`: the bug it guards against is a Tailwind class that compiles to a
// `var()` shadcn's theme never defines, and that only exists once Tailwind
// has actually generated the declaration.

interface CssFile {
  readonly path: string
  readonly content: string
}

/** Every `.css` file beneath `root`, found the same way `verify-pack.ts` walks a packed tarball. */
const findCssFiles = async (root: string): Promise<readonly string[]> => {
  const paths: string[] = []

  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const absolute = join(directory, entry.name)

      if (entry.isDirectory()) {
        await walk(absolute)
        continue
      }

      if (entry.name.endsWith('.css')) paths.push(absolute)
    }
  }

  await walk(root)

  return paths
}

// Mirrors the reference pattern `undefinedCustomProperties` uses internally,
// rather than importing it: that module's one exported interface answers
// "is this defined anywhere", and this answers a different, per-file
// question -- "does *this* file mention this specific name" -- purely to
// give a human something to open. Stretching one export into two just to
// avoid a few duplicated lines is not worth coupling the two questions.
const referencesBareProperty = (name: string, content: string): boolean =>
  new RegExp(`var\\(\\s*${name}\\s*\\)`).test(content)

const main = async (): Promise<void> => {
  const [directory] = process.argv.slice(2)
  if (directory === undefined) {
    console.error('Usage: verify-theme-tokens <directory>')
    process.exitCode = 1

    return
  }

  const stats = await stat(directory).catch(() => undefined)
  if (!stats?.isDirectory()) {
    console.error(`"${directory}" is not a directory that exists.`)
    process.exitCode = 1

    return
  }

  const paths = await findCssFiles(directory)
  if (paths.length === 0) {
    console.error(
      `No .css files were found beneath "${directory}". This guard checks nothing when ` +
        'pointed at the wrong place, so an empty result is a failure, not a pass.',
    )
    process.exitCode = 1

    return
  }

  const files: CssFile[] = await Promise.all(
    paths.map(async (path) => ({path, content: await readFile(path, 'utf8')})),
  )

  // Concatenated into one stylesheet, not checked file by file: Next splits
  // generated CSS across chunks, and a property one chunk defines while
  // another reads it is fine in the browser, where all chunks load together.
  // Checking files individually would report failures that are not real.
  const combined = files.map((file) => file.content).join('\n')
  const undefinedProperties = undefinedCustomProperties(combined)

  if (undefinedProperties.length > 0) {
    console.error(
      `Found ${String(undefinedProperties.length)} custom propert${undefinedProperties.length === 1 ? 'y' : 'ies'} ` +
        'read by this build but not defined anywhere in it:\n',
    )
    for (const name of undefinedProperties) {
      const referencingPaths = files
        .filter((file) => referencesBareProperty(name, file.content))
        .map((file) => file.path)

      console.error(`  ${name}`)
      for (const path of referencingPaths) console.error(`    referenced in ${path}`)
    }
    console.error(
      '\nA browser resolves an undefined custom property to nothing rather than erroring, so ' +
        'this renders wrong -- silently -- in any project whose theme does not define these.',
    )
    process.exitCode = 1

    return
  }

  const distinctProperties = new Set(
    [...combined.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)\s*\)/g)].map((match) => match[1]),
  )

  console.log(
    `Verified ${String(files.length)} CSS file(s): ${String(distinctProperties.size)} distinct ` +
      `custom propert${distinctProperties.size === 1 ? 'y' : 'ies'} referenced without a ` +
      'fallback, all defined.',
  )
}

await main()
