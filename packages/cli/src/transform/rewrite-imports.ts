export interface RewriteAliases {
  readonly ui: string
  readonly utils: string
}

/**
 * Matching is keyword-driven: `\bfrom` and `\bimport` reach commented-out
 * imports and example imports in doc comments, not only live statements.
 * Ordinary string literals are left alone. Comment rewriting is tolerated
 * deliberately — only comment text changes, and rewriting an example to the
 * project's alias is more useful than leaving `@/`; avoiding it would require
 * tokenizing the source.
 */
const SPECIFIER = /(\bfrom\s*|\bimport\s*)(['"])(@\/[^'"]*)\2/g

const UI_PREFIX = '@/components/ui/'

const stripTrailingSlashes = (path: string): string => path.replace(/\/+$/, '')

const joinUiAlias = (ui: string, rest: string): string => {
  const base = stripTrailingSlashes(ui)
  return `${base}/${rest}`
}

const rewriteSpecifier = (specifier: string, aliases: RewriteAliases): string | undefined => {
  if (specifier === '@/lib/utils') return stripTrailingSlashes(aliases.utils)
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
