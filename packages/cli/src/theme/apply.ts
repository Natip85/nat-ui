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
  if (start !== -1 && end > start) {
    return stylesheet.slice(0, start) + next + stylesheet.slice(end + THEME_END.length)
  }

  const match = TAILWIND_IMPORT.exec(stylesheet)
  if (match?.index === undefined) return `${next}\n\n${stylesheet}`

  const insertAt = match.index + match[0].length

  return `${stylesheet.slice(0, insertAt)}\n\n${next}\n${stylesheet.slice(insertAt)}`
}
