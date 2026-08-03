import * as z from 'zod'

/**
 * Written to the root of a consuming project by `nat-ui init`, and read by
 * every `nat-ui add` afterwards.
 */
export const CONFIG_FILE_NAME = 'components.json'

export const baseColorSchema = z.enum(['neutral', 'gray', 'zinc', 'stone', 'slate'])
export type BaseColor = z.infer<typeof baseColorSchema>

/**
 * There is no `config` path here on purpose. Tailwind v4 is configured from
 * CSS, so the stylesheet is the only thing the CLI needs to find.
 */
export const tailwindConfigSchema = z.strictObject({
  /** Stylesheet that theme variables get written into. */
  css: z.string().min(1),
  baseColor: baseColorSchema,
  cssVariables: z.boolean().default(true),
  prefix: z.string().default(''),
})
export type TailwindConfig = z.infer<typeof tailwindConfigSchema>

/**
 * Import aliases as the project already uses them. Every file the CLI writes
 * has its imports rewritten to match these, which is what lets components drop
 * into an existing layout instead of dictating one.
 */
export const aliasesSchema = z.strictObject({
  components: z.string().min(1),
  utils: z.string().min(1),
  ui: z.string().min(1),
  lib: z.string().min(1).optional(),
  hooks: z.string().min(1).optional(),
})
export type Aliases = z.infer<typeof aliasesSchema>

export const configSchema = z.strictObject({
  $schema: z.string().optional(),
  /** Whether to keep the `"use client"` directive on client components. */
  rsc: z.boolean().default(false),
  tsx: z.boolean().default(true),
  tailwind: tailwindConfigSchema,
  aliases: aliasesSchema,
})
export type Config = z.infer<typeof configSchema>
