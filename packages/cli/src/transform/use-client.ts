/** Anchored, so only a directive in the position React honours is removed. */
const DIRECTIVE = /^\s*(['"])use client\1\s*;?[ \t]*\r?\n(?:\r?\n)?/

/**
 * The directive is meaningful only where server components exist. Left in a
 * plain React or Vite app it is inert, but it reads as a claim about the
 * project's architecture that isn't true.
 */
export const applyClientDirective = (source: string, rsc: boolean): string =>
  rsc ? source : source.replace(DIRECTIVE, '')
