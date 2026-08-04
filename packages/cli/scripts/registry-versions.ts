const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * The versions map from a registry package document, or `undefined` if there
 * is none to consult.
 *
 * `undefined` here is not the same as "no versions": it means the document
 * did not have a usable `versions` map at all (missing, `null`, or not an
 * object), which is not information about any particular version — it is the
 * response being something other than what a package document looks like.
 * An empty-but-present map (`{versions: {}}`) is not this case: that is a
 * real package with no matching version, and callers can trust it.
 */
export const versionsOf = (document: unknown): Record<string, unknown> | undefined => {
  if (!isRecord(document)) return undefined

  const {versions} = document

  // `isRecord` accepts arrays too (`typeof [] === 'object'`), but a versions
  // map is keyed by version string, not by array index — `[]` is no more a
  // versions map than `null` or a string is. Checked here, not inside
  // `isRecord`: that helper is shared verbatim with `manifest.ts`, where
  // "is this an object" is genuinely all that's being asked.
  if (!isRecord(versions) || Array.isArray(versions)) return undefined

  return versions
}

/**
 * Whether a registry's versions map already lists an exact version.
 *
 * Uses `Object.hasOwn` rather than `in`: `versions` comes from parsed JSON,
 * and `'constructor' in versions` is true for every object. Reporting a
 * version as published when it is not would silently skip a real release.
 *
 * Takes the map itself, not the whole document: whether the document even
 * has a usable map to consult is a separate question, answered by
 * `versionsOf`, and callers must not collapse the two — an absent map is not
 * information about this version, so it must not be reported as `false`.
 */
export const hasVersion = (versions: Record<string, unknown>, version: string): boolean =>
  Object.hasOwn(versions, version)
