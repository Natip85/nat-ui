import type {ThemePreset} from './presets'

export const THEME_START = '/* nat-ui theme start */'
export const THEME_END = '/* nat-ui theme end */'

/** Matches `@import 'tailwindcss';` however it is quoted, and the whole line. */
const TAILWIND_IMPORT = /^.*@import\s+['"]tailwindcss['"].*$/m

const declarations = (tokens: Record<string, string>): string =>
  Object.entries(tokens)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')

const block = (preset: ThemePreset): string =>
  [
    THEME_START,
    ':root {',
    declarations(preset.light),
    '}',
    '',
    '.dark {',
    declarations(preset.dark),
    '}',
    THEME_END,
  ].join('\n')

export const applyTheme = (stylesheet: string, preset: ThemePreset): string => {
  const next = block(preset)

  const start = stylesheet.indexOf(THEME_START)
  const end = stylesheet.indexOf(THEME_END)
  const hasStart = start !== -1
  const hasEnd = end !== -1

  // Inserting a fresh block alongside a half-marked one would leave the previous
  // run's rules below the new ones, where they win the cascade and silently
  // override the style the user just picked. Refuse instead.
  if (hasStart !== hasEnd || (hasStart && end < start)) {
    throw new Error(
      `Your stylesheet has an incomplete nat-ui theme block. It needs both ${THEME_START} ` +
        `and ${THEME_END}, in that order. Restore the missing marker or delete the leftover ` +
        `block, then run init again.`,
    )
  }

  if (hasStart && hasEnd) {
    return stylesheet.slice(0, start) + next + stylesheet.slice(end + THEME_END.length)
  }

  const match = TAILWIND_IMPORT.exec(stylesheet)
  if (match?.index === undefined) return `${next}\n\n${stylesheet}`

  const insertAt = match.index + match[0].length

  return `${stylesheet.slice(0, insertAt)}\n\n${next}\n${stylesheet.slice(insertAt)}`
}
