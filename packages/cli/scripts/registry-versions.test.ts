import {describe, expect, it} from 'vitest'

import {hasVersion} from './registry-versions'

describe('hasVersion', () => {
  it('finds a version the registry lists', () => {
    expect(hasVersion({versions: {'0.1.0': {}, '0.2.0': {}}}, '0.2.0')).toBe(true)
  })

  it('does not find a version the registry has never seen', () => {
    expect(hasVersion({versions: {'0.1.0': {}}}, '0.2.0')).toBe(false)
  })

  it('treats a document without a versions map as having no versions', () => {
    expect(hasVersion({}, '0.2.0')).toBe(false)
    expect(hasVersion({versions: null}, '0.2.0')).toBe(false)
  })

  it('tolerates a document that is not an object', () => {
    expect(hasVersion('not a document', '0.2.0')).toBe(false)
  })

  it('does not confuse inherited object properties for published versions', () => {
    // A naive `version in versions` check would report `true` here, which
    // would silently skip a real release.
    expect(hasVersion({versions: {}}, 'constructor')).toBe(false)
    expect(hasVersion({versions: {}}, 'toString')).toBe(false)
  })
})
