import {confirm, isCancel, select, text} from '@clack/prompts'
import type {InitAnswers} from '../config/resolve'
import type {DetectedProject} from '../detect/project'
import {PRESET_CHOICES} from '../theme/presets'

export type Asker = (detected: DetectedProject) => Promise<InitAnswers | undefined>

const FIRST_PRESET = PRESET_CHOICES[0]

/**
 * Used by --yes and whenever stdin is not a TTY. The stylesheet is the one value
 * with no conventional fallback, so it throws instead of inventing a path.
 */
export const defaultAnswers = (detected: DetectedProject): InitAnswers => {
  if (detected.css === undefined) {
    throw new Error(
      'Could not find a stylesheet importing tailwindcss. Run without --yes to supply one.',
    )
  }
  if (FIRST_PRESET === undefined) throw new Error('No theme presets are defined.')

  return {
    baseColor: FIRST_PRESET.value,
    css: detected.css,
    aliasPrefix: detected.aliasPrefix,
    rsc: detected.rsc,
    tsx: detected.tsx,
  }
}

/**
 * Clack hands a validator `string | undefined`, since the field can be empty,
 * so the check has to cover both.
 */
const required = (value: string | undefined, message: string): string | undefined =>
  (value ?? '').trim() === '' ? message : undefined

export const ask: Asker = async (detected) => {
  if (FIRST_PRESET === undefined) throw new Error('No theme presets are defined.')

  const baseColor = await select({
    message: 'Which base style would you like to use?',
    options: PRESET_CHOICES.map((choice) => ({label: choice.label, value: choice.value})),
    initialValue: FIRST_PRESET.value,
  })
  if (isCancel(baseColor)) return undefined

  const css = await text({
    message: 'Where is your global CSS file?',
    placeholder: detected.css ?? 'src/app/globals.css',
    initialValue: detected.css ?? '',
    validate: (value) => required(value, 'A stylesheet path is required.'),
  })
  if (isCancel(css)) return undefined

  const aliasPrefix = await text({
    message: 'What import alias prefix do you use?',
    initialValue: detected.aliasPrefix,
    validate: (value) => required(value, 'An alias prefix is required.'),
  })
  if (isCancel(aliasPrefix)) return undefined

  const tsx = await confirm({message: 'Are you using TypeScript?', initialValue: detected.tsx})
  if (isCancel(tsx)) return undefined

  const rsc = await confirm({
    message: 'Are you using React Server Components?',
    initialValue: detected.rsc,
  })
  if (isCancel(rsc)) return undefined

  return {baseColor, css: css.trim(), aliasPrefix: aliasPrefix.trim(), rsc, tsx}
}

export const confirmOverwrite = async (): Promise<boolean> => {
  const answer = await confirm({
    message: 'components.json already exists. Overwrite it?',
    initialValue: false,
  })

  return !isCancel(answer) && answer
}
