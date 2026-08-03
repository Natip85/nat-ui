import {describe, expect, test} from 'vitest'
import {configSchema} from './config'

const minimal = {
  tailwind: {css: 'app/globals.css', baseColor: 'neutral'},
  aliases: {components: '@/components', utils: '@/lib/utils', ui: '@/components/ui'},
}

describe('configSchema', () => {
  test('accepts a minimal config', () => {
    expect(configSchema.safeParse(minimal).success).toBe(true)
  })

  test('defaults tsx to true and rsc to false when unspecified', () => {
    const result = configSchema.parse(minimal)

    expect(result.tsx).toBe(true)
    expect(result.rsc).toBe(false)
  })

  test('rejects unknown top-level keys so a typo is not silently ignored', () => {
    expect(configSchema.safeParse({...minimal, alias: {}}).success).toBe(false)
  })

  test('requires the aliases block, since the CLI cannot place files without it', () => {
    const {aliases: _aliases, ...withoutAliases} = minimal

    expect(configSchema.safeParse(withoutAliases).success).toBe(false)
  })

  test('requires a ui alias, which is where components land', () => {
    const aliases = {components: '@/components', utils: '@/lib/utils'}

    expect(configSchema.safeParse({...minimal, aliases}).success).toBe(false)
  })

  test('requires a tailwind css entrypoint to write theme variables into', () => {
    const tailwind = {baseColor: 'neutral'}

    expect(configSchema.safeParse({...minimal, tailwind}).success).toBe(false)
  })

  test('rejects a base color outside the supported palette', () => {
    const tailwind = {css: 'app/globals.css', baseColor: 'burgundy'}

    expect(configSchema.safeParse({...minimal, tailwind}).success).toBe(false)
  })
})
