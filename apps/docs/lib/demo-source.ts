/** Matches the workspace package specifier, capturing the path within it. */
const workspaceImport = /(['"])@nat-ui\/registry\/((?:components\/ui|lib)\/[\w.-]+)\1/g

/**
 * Demos import through the workspace package, because that is how this
 * repository is laid out. A reader's project is laid out the way `init`
 * configures it, so the line they would write names the `@/` alias instead.
 * Showing them our path would hand them an import that cannot resolve.
 *
 * The throw is the safety net: rewriting only the specifiers we know about
 * means a demo reaching for something else would otherwise quietly publish a
 * path that exists in no one's project but ours.
 */
export const asConsumerSource = (source: string): string => {
  const rewritten = source.replace(workspaceImport, (_match, quote: string, path: string) => {
    return `${quote}@/${path}${quote}`
  })

  if (rewritten.includes('@nat-ui/')) {
    throw new Error(
      `A demo imports from @nat-ui/ in a form this rewrite does not cover, so the source shown ` +
        `would name a path no reader has. Extend the pattern in lib/demo-source.ts.\n\n${rewritten}`,
    )
  }

  return rewritten
}
