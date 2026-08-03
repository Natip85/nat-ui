import {type Config, configSchema} from '@nat-ui/schema'
import type {PresetName} from '../theme/presets'

export interface InitAnswers {
  baseColor: PresetName
  css: string
  aliasPrefix: string
  rsc: boolean
  tsx: boolean
}

export const aliasesFor = (prefix: string): {components: string; utils: string; ui: string} => ({
  components: `${prefix}/components`,
  utils: `${prefix}/lib/utils`,
  ui: `${prefix}/components/ui`,
})

/**
 * Parsing rather than casting is the point: a mistake here surfaces as a
 * validation error instead of an invalid components.json on someone's disk.
 * The parsed result is returned so schema defaults land in the written file.
 */
export const resolveConfig = (answers: InitAnswers): Config =>
  configSchema.parse({
    rsc: answers.rsc,
    tsx: answers.tsx,
    tailwind: {
      css: answers.css,
      baseColor: answers.baseColor,
    },
    aliases: aliasesFor(answers.aliasPrefix),
  })
