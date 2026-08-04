export interface RewriteAliases {
  readonly ui: string
  readonly utils: string
}

/**
 * Only specifiers introduced by `from` or a bare `import` are matched, so a
 * string in the body that happens to look like a module path is left alone.
 */
const SPECIFIER = /(\bfrom\s*|\bimport\s*)(['"])(@\/[^'"]*)\2/g

const UI_PREFIX = '@/components/ui/'

const joinUiAlias = (ui: string, rest: string): string => {
  const base = ui.endsWith('/') ? ui.slice(0, -1) : ui
  return `${base}/${rest}`
}

const rewriteSpecifier = (specifier: string, aliases: RewriteAliases): string | undefined => {
  if (specifier === '@/lib/utils') return aliases.utils
  if (specifier.startsWith(UI_PREFIX))
    return joinUiAlias(aliases.ui, specifier.slice(UI_PREFIX.length))

  // The generator refuses to publish any other `@/` shape, so reaching here
  // means a hand-edited document. Leaving it be is better than guessing.
  return undefined
}

/**
 * Rebuilt by hand rather than with a `replace` callback, whose parameters are
 * untyped and would need unsafe casts to satisfy the lint rules.
 */
export const rewriteImports = (source: string, aliases: RewriteAliases): string => {
  let result = ''
  let lastIndex = 0

  for (const match of source.matchAll(SPECIFIER)) {
    const [whole, keyword, quote, specifier] = match
    if (keyword === undefined || quote === undefined || specifier === undefined) continue

    const next = rewriteSpecifier(specifier, aliases)
    if (next === undefined) continue

    const index = match.index
    if (index === undefined) continue

    result += source.slice(lastIndex, index) + keyword + quote + next + quote
    lastIndex = index + whole.length
  }

  return result + source.slice(lastIndex)
}
