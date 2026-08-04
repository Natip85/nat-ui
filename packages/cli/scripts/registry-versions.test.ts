import {describe, expect, it} from 'vitest'

import {hasVersion, versionsOf} from './registry-versions'

describe('versionsOf', () => {
  it('returns the versions map from a well-formed document', () => {
    expect(versionsOf({versions: {'0.1.0': {}, '0.2.0': {}}})).toEqual({
      '0.1.0': {},
      '0.2.0': {},
    })
  })

  it('returns an empty-but-present versions map rather than treating it as unusable', () => {
    // A real package that just doesn't have the version yet — a trustworthy
    // negative, not a response we failed to understand.
    expect(versionsOf({versions: {}})).toEqual({})
  })

  it('is undefined when the document has no versions map at all', () => {
    expect(versionsOf({})).toBeUndefined()
  })

  it('is undefined when "versions" is present but not an object', () => {
    expect(versionsOf({versions: null})).toBeUndefined()
    expect(versionsOf({versions: 'nope'})).toBeUndefined()
  })

  it('is undefined for a document that is not an object', () => {
    expect(versionsOf('not a document')).toBeUndefined()
    expect(versionsOf(null)).toBeUndefined()
  })
})

describe('hasVersion', () => {
  it('finds a version the registry lists', () => {
    expect(hasVersion({'0.1.0': {}, '0.2.0': {}}, '0.2.0')).toBe(true)
  })

  it('does not find a version the registry has never seen', () => {
    expect(hasVersion({'0.1.0': {}}, '0.2.0')).toBe(false)
  })

  it('treats an empty versions map as a genuine negative', () => {
    expect(hasVersion({}, '0.2.0')).toBe(false)
  })

  it('does not confuse inherited object properties for published versions', () => {
    // A naive `version in versions` check would report `true` here, which
    // would silently skip a real release.
    expect(hasVersion({}, 'constructor')).toBe(false)
    expect(hasVersion({}, 'toString')).toBe(false)
  })
})
