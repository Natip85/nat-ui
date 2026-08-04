import {describe, expect, test} from 'vitest'
import type {DetectedProject} from '../detect/project'
import {defaultAnswers} from './ask'

const detected: DetectedProject = {
  hasPackageJson: true,
  packageJsonParseError: false,
  hasTsconfig: true,
  css: 'src/app/globals.css',
  aliasPrefix: '@',
  aliasTargets: [{prefix: '@', targetDir: 'src'}],
  tsx: true,
  rsc: true,
  packageManager: 'pnpm',
}

describe('defaultAnswers', () => {
  test('takes every detected value', () => {
    expect(defaultAnswers(detected)).toEqual({
      baseColor: 'neutral',
      css: 'src/app/globals.css',
      aliasPrefix: '@',
      rsc: true,
      tsx: true,
    })
  })

  test('defaults the base colour to the first preset', () => {
    expect(defaultAnswers(detected).baseColor).toBe('neutral')
  })

  test('fails loudly when no stylesheet was detected, rather than guessing', () => {
    expect(() => defaultAnswers({...detected, css: undefined})).toThrow(/stylesheet/i)
  })
})
