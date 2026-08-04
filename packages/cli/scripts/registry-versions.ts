const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * Whether a registry package document already lists an exact version.
 *
 * Uses `Object.hasOwn` rather than `in`: the registry document is parsed JSON,
 * and `'constructor' in versions` is true for every object. Reporting a
 * version as published when it is not would silently skip a real release.
 */
export const hasVersion = (document: unknown, version: string): boolean => {
  if (!isRecord(document)) return false

  const {versions} = document
  if (!isRecord(versions)) return false

  return Object.hasOwn(versions, version)
}
