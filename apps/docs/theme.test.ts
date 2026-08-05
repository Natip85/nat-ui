import {readFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'
// Reached by relative path rather than by package specifier: `@nat-ui/cli`
// publishes a bundled binary and exposes no entry point to import. Reading its
// source is the point -- the preset it writes is what this guard compares
// against, so anything derived from it would only move the copy elsewhere.
import {applyTheme, THEME_END, THEME_START} from '../../packages/cli/src/theme/apply'
import {PRESETS} from '../../packages/cli/src/theme/presets'

const here = dirname(fileURLToPath(import.meta.url))

const STYLESHEET = 'apps/docs/app/global.css'
const PRESET_SOURCE = 'packages/cli/src/theme/{presets,apply}.ts'

/** The marked block, extracted the same way from both sides of the comparison. */
const themeBlock = (stylesheet: string, describedAs: string): string => {
  const start = stylesheet.indexOf(THEME_START)
  const end = stylesheet.indexOf(THEME_END)

  if (start === -1 || end === -1) {
    throw new Error(`${describedAs} has no ${THEME_START} ... ${THEME_END} block to compare.`)
  }

  return stylesheet.slice(start, end + THEME_END.length)
}

/**
 * The site's stylesheet carries a copy of the neutral preset so previews render
 * with the tokens a reader's project would have after `init`. A copy can drift,
 * and a drifted one would show every component in a colour scheme the CLI does
 * not write -- which is the one thing the docs app imports canonical source to
 * avoid.
 */
describe('docs theme', () => {
  it('carries exactly what init writes for the neutral preset', async () => {
    const stylesheet = await readFile(join(here, 'app', 'global.css'), 'utf8')

    expect(
      themeBlock(stylesheet, STYLESHEET),
      `The theme block in ${STYLESHEET} is no longer what \`nat-ui init\` writes for the ` +
        `neutral preset. The CLI in ${PRESET_SOURCE} is the source of truth: copy its block ` +
        `into ${STYLESHEET}, between the markers, leaving the rest of the file alone.`,
    ).toBe(themeBlock(applyTheme('', PRESETS.neutral), 'the CLI theme'))
  })
})
