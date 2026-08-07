/**
 * A CSS custom property that is read with `var(--name)` but never defined
 * anywhere in the stylesheet is not an error: the browser silently resolves
 * it to nothing, so `color: var(--nothing-defines-this)` just produces no
 * colour. Nothing about the build fails, and nothing about the page fails
 * loudly either -- the component simply renders wrong wherever it lands.
 * This is the only thing that turns that silence into something a guard can
 * catch: it finds every property a stylesheet reads and never defines, so
 * a caller can decide that finding one is a build failure.
 *
 * A reference with a fallback, `var(--name, fallback)`, is excluded on
 * purpose. The fallback is the author's explicit statement that the
 * property may be absent and that absence is handled, so it is not a defect
 * to report.
 */

const PROPERTY_NAME = '--[a-zA-Z0-9_-]+'

const DECLARATION = new RegExp(`(${PROPERTY_NAME})\\s*:`, 'g')
const AT_PROPERTY = new RegExp(`@property\\s+(${PROPERTY_NAME})`, 'g')
// The terminator captured after the name is what distinguishes a bare
// reference from one with a fallback: `)` means nothing follows the name,
// `,` means a fallback does.
const REFERENCE = new RegExp(`var\\(\\s*(${PROPERTY_NAME})\\s*([,)])`, 'g')

const matchedNames = (pattern: RegExp, css: string): Set<string> => {
  const names = new Set<string>()
  for (const match of css.matchAll(pattern)) {
    const name = match[1]
    if (name !== undefined) names.add(name)
  }

  return names
}

export const undefinedCustomProperties = (css: string): readonly string[] => {
  const defined = new Set([...matchedNames(DECLARATION, css), ...matchedNames(AT_PROPERTY, css)])

  const referencedWithoutFallback = new Set<string>()
  for (const match of css.matchAll(REFERENCE)) {
    const [, name, terminator] = match
    if (name !== undefined && terminator === ')') referencedWithoutFallback.add(name)
  }

  return [...referencedWithoutFallback].filter((name) => !defined.has(name)).sort()
}
