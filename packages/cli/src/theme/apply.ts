import {THEME_TOKENS, type ThemePreset} from './presets'

export const THEME_START = '/* nat-ui theme start */'
export const THEME_END = '/* nat-ui theme end */'

const BOM = '\uFEFF'

/** Matches `@import 'tailwindcss';` however it is quoted, and the whole line. */
const TAILWIND_IMPORT = /^.*@import\s+['"]tailwindcss['"].*$/m

const declarations = (tokens: Record<string, string>): string =>
  Object.entries(tokens)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')

// `--radius` is a length, not a colour, and Tailwind spells its scale
// differently, so it is mapped by hand below rather than in this loop.
const COLOR_TOKENS = THEME_TOKENS.filter((token) => token !== '--radius')

/**
 * Tailwind v4 builds utilities from `@theme` variables, so the raw tokens above
 * produce no `bg-primary` on their own. The `inline` form points a design token
 * at a variable defined elsewhere, which is what keeps the `.dark` override
 * working: the utility resolves through `var(--primary)` at use time instead of
 * being frozen to the light value.
 */
const mapping = (): string =>
  [
    ...COLOR_TOKENS.map((token) => `  --color-${token.slice('--'.length)}: var(${token});`),
    '  --radius-sm: calc(var(--radius) - 4px);',
    '  --radius-md: calc(var(--radius) - 2px);',
    '  --radius-lg: var(--radius);',
    '  --radius-xl: calc(var(--radius) + 4px);',
  ].join('\n')

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
    '',
    '@theme inline {',
    mapping(),
    '}',
    THEME_END,
  ].join('\n')

/**
 * The block above is always built with `\n`. A stylesheet saved with CRLF line
 * endings (the Windows default) needs the block to match, or every line inside it
 * shows up as a diff and can trip up linters that check line endings. Ties -- a
 * stylesheet with no newlines at all, or an even split -- default to `\n`. A file
 * that's already a mix of both follows whichever convention is more common in it.
 */
const detectEol = (text: string): string => {
  const endings = text.match(/\r\n|\n/g) ?? []
  const crlfCount = endings.filter((ending) => ending === '\r\n').length
  return crlfCount * 2 > endings.length ? '\r\n' : '\n'
}

const withEol = (text: string, eol: string): string =>
  eol === '\n' ? text : text.split('\n').join(eol)

export const applyTheme = (stylesheet: string, preset: ThemePreset): string => {
  // A leading BOM has to stay at byte zero. Strip it before reasoning about markers
  // and imports, then stitch it back onto whatever we produce.
  const hasBom = stylesheet.startsWith(BOM)
  const body = hasBom ? stylesheet.slice(BOM.length) : stylesheet
  const prefix = hasBom ? BOM : ''

  const start = body.indexOf(THEME_START)
  const end = body.indexOf(THEME_END)
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

  // Two complete blocks are just as unreasonable as a partial one: whichever one gets
  // replaced, the other survives and, being later in the file, its stale variables
  // win the cascade. Refuse rather than guess which block the user meant to keep.
  const hasDuplicate =
    hasStart &&
    hasEnd &&
    (body.includes(THEME_START, start + 1) || body.includes(THEME_END, end + 1))
  if (hasDuplicate) {
    throw new Error(
      `Your stylesheet has more than one nat-ui theme block. It should contain exactly one ` +
        `${THEME_START} and one ${THEME_END}. Delete the extra block by hand, then run init ` +
        `again.`,
    )
  }

  const eol = detectEol(body)
  const next = withEol(block(preset), eol)

  if (hasStart && hasEnd) {
    return prefix + body.slice(0, start) + next + body.slice(end + THEME_END.length)
  }

  const match = TAILWIND_IMPORT.exec(body)
  if (match?.index === undefined) return `${prefix}${next}${eol}${eol}${body}`

  const insertAt = match.index + match[0].length

  return `${prefix}${body.slice(0, insertAt)}${eol}${eol}${next}${eol}${body.slice(insertAt)}`
}
