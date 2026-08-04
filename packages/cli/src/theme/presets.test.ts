import {describe, expect, test} from 'vitest'
import {PRESET_CHOICES, PRESETS, THEME_TOKENS} from './presets'

describe('presets', () => {
  test('every preset defines the identical token set in both themes', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(Object.keys(preset.light).sort()).toEqual([...THEME_TOKENS].sort())
      expect(Object.keys(preset.dark).sort()).toEqual([...THEME_TOKENS].sort())
    }
  })

  test('no token is left empty', () => {
    for (const preset of Object.values(PRESETS)) {
      for (const value of [...Object.values(preset.light), ...Object.values(preset.dark)]) {
        expect(value.trim()).not.toBe('')
      }
    }
  })

  test('offers neutral first, so it is the prompt default', () => {
    expect(PRESET_CHOICES[0]?.value).toBe('neutral')
    expect(PRESET_CHOICES.map((choice) => choice.value)).toEqual(['neutral', 'slate'])
  })

  test('every choice has a preset behind it', () => {
    for (const choice of PRESET_CHOICES) {
      expect(Object.keys(PRESETS)).toContain(choice.value)
    }
  })
})
