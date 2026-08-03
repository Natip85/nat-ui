import {describe, expect, test} from 'vitest'
import {aliasesFor, resolveConfig, type InitAnswers} from './resolve'

const answers: InitAnswers = {
  baseColor: 'neutral',
  css: 'src/app/globals.css',
  aliasPrefix: '@',
  rsc: true,
  tsx: true,
}

describe('aliasesFor', () => {
  test('expands a prefix into the three required aliases', () => {
    expect(aliasesFor('@')).toEqual({
      components: '@/components',
      utils: '@/lib/utils',
      ui: '@/components/ui',
    })
  })

  test('honours a different prefix', () => {
    expect(aliasesFor('~').ui).toBe('~/components/ui')
  })
})

describe('resolveConfig', () => {
  test('maps every answer onto its field', () => {
    const config = resolveConfig(answers)

    expect(config.tailwind.css).toBe('src/app/globals.css')
    expect(config.tailwind.baseColor).toBe('neutral')
    expect(config.rsc).toBe(true)
    expect(config.tsx).toBe(true)
    expect(config.aliases.ui).toBe('@/components/ui')
  })

  test('materialises schema defaults so the file records every decision', () => {
    const config = resolveConfig(answers)

    expect(config.tailwind.cssVariables).toBe(true)
    expect(config.tailwind.prefix).toBe('')
  })

  test('omits the optional aliases nothing needs yet', () => {
    const config = resolveConfig(answers)

    expect(config.aliases.lib).toBeUndefined()
    expect(config.aliases.hooks).toBeUndefined()
  })

  test('throws rather than emitting a config the schema rejects', () => {
    expect(() => resolveConfig({...answers, css: ''})).toThrow()
  })
})
