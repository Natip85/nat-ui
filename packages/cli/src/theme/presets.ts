import type {BaseColor} from '@nat-ui/schema'

export interface ThemePreset {
  light: Record<string, string>
  dark: Record<string, string>
}

/**
 * The contract a component may rely on. Every preset defines all of these in
 * both themes, so a component styled against them works under any choice.
 */
export const THEME_TOKENS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--border',
  '--input',
  '--ring',
  '--radius',
] as const

const neutral: ThemePreset = {
  light: {
    '--background': 'oklch(1 0 0)',
    '--foreground': 'oklch(0.145 0 0)',
    '--card': 'oklch(1 0 0)',
    '--card-foreground': 'oklch(0.145 0 0)',
    '--popover': 'oklch(1 0 0)',
    '--popover-foreground': 'oklch(0.145 0 0)',
    '--primary': 'oklch(0.205 0 0)',
    '--primary-foreground': 'oklch(0.985 0 0)',
    '--secondary': 'oklch(0.97 0 0)',
    '--secondary-foreground': 'oklch(0.205 0 0)',
    '--muted': 'oklch(0.97 0 0)',
    '--muted-foreground': 'oklch(0.556 0 0)',
    '--accent': 'oklch(0.97 0 0)',
    '--accent-foreground': 'oklch(0.205 0 0)',
    '--destructive': 'oklch(0.577 0.245 27.325)',
    '--destructive-foreground': 'oklch(0.985 0 0)',
    '--border': 'oklch(0.922 0 0)',
    '--input': 'oklch(0.922 0 0)',
    '--ring': 'oklch(0.708 0 0)',
    '--radius': '0.625rem',
  },
  dark: {
    '--background': 'oklch(0.145 0 0)',
    '--foreground': 'oklch(0.985 0 0)',
    '--card': 'oklch(0.205 0 0)',
    '--card-foreground': 'oklch(0.985 0 0)',
    '--popover': 'oklch(0.205 0 0)',
    '--popover-foreground': 'oklch(0.985 0 0)',
    '--primary': 'oklch(0.922 0 0)',
    '--primary-foreground': 'oklch(0.205 0 0)',
    '--secondary': 'oklch(0.269 0 0)',
    '--secondary-foreground': 'oklch(0.985 0 0)',
    '--muted': 'oklch(0.269 0 0)',
    '--muted-foreground': 'oklch(0.708 0 0)',
    '--accent': 'oklch(0.269 0 0)',
    '--accent-foreground': 'oklch(0.985 0 0)',
    '--destructive': 'oklch(0.704 0.191 22.216)',
    '--destructive-foreground': 'oklch(0.985 0 0)',
    '--border': 'oklch(1 0 0 / 10%)',
    '--input': 'oklch(1 0 0 / 15%)',
    '--ring': 'oklch(0.556 0 0)',
    '--radius': '0.625rem',
  },
}

const slate: ThemePreset = {
  light: {
    '--background': 'oklch(1 0 0)',
    '--foreground': 'oklch(0.129 0.042 264.695)',
    '--card': 'oklch(1 0 0)',
    '--card-foreground': 'oklch(0.129 0.042 264.695)',
    '--popover': 'oklch(1 0 0)',
    '--popover-foreground': 'oklch(0.129 0.042 264.695)',
    '--primary': 'oklch(0.208 0.042 265.755)',
    '--primary-foreground': 'oklch(0.984 0.003 247.858)',
    '--secondary': 'oklch(0.968 0.007 247.896)',
    '--secondary-foreground': 'oklch(0.208 0.042 265.755)',
    '--muted': 'oklch(0.968 0.007 247.896)',
    '--muted-foreground': 'oklch(0.554 0.046 257.417)',
    '--accent': 'oklch(0.968 0.007 247.896)',
    '--accent-foreground': 'oklch(0.208 0.042 265.755)',
    '--destructive': 'oklch(0.577 0.245 27.325)',
    '--destructive-foreground': 'oklch(0.984 0.003 247.858)',
    '--border': 'oklch(0.929 0.013 255.508)',
    '--input': 'oklch(0.929 0.013 255.508)',
    '--ring': 'oklch(0.704 0.04 256.788)',
    '--radius': '0.625rem',
  },
  dark: {
    '--background': 'oklch(0.129 0.042 264.695)',
    '--foreground': 'oklch(0.984 0.003 247.858)',
    '--card': 'oklch(0.208 0.042 265.755)',
    '--card-foreground': 'oklch(0.984 0.003 247.858)',
    '--popover': 'oklch(0.208 0.042 265.755)',
    '--popover-foreground': 'oklch(0.984 0.003 247.858)',
    '--primary': 'oklch(0.929 0.013 255.508)',
    '--primary-foreground': 'oklch(0.208 0.042 265.755)',
    '--secondary': 'oklch(0.279 0.041 260.031)',
    '--secondary-foreground': 'oklch(0.984 0.003 247.858)',
    '--muted': 'oklch(0.279 0.041 260.031)',
    '--muted-foreground': 'oklch(0.704 0.04 256.788)',
    '--accent': 'oklch(0.279 0.041 260.031)',
    '--accent-foreground': 'oklch(0.984 0.003 247.858)',
    '--destructive': 'oklch(0.704 0.191 22.216)',
    '--destructive-foreground': 'oklch(0.984 0.003 247.858)',
    '--border': 'oklch(1 0 0 / 10%)',
    '--input': 'oklch(1 0 0 / 15%)',
    '--ring': 'oklch(0.551 0.027 264.364)',
    '--radius': '0.625rem',
  },
}

// `Partial<Record<BaseColor, …>>` rather than `Record<string, …>`: it forces every
// key to be a value the schema accepts, while leaving the inferred key type as the
// two names that actually have presets.
export const PRESETS = {neutral, slate} satisfies Partial<Record<BaseColor, ThemePreset>>

/**
 * The base colours init can actually apply. Narrower than `BaseColor` on purpose,
 * so no answer can name a style with no CSS behind it and leave `components.json`
 * disagreeing with the stylesheet next to it.
 */
export type PresetName = keyof typeof PRESETS

/** Ordered. The first entry is what the prompt offers by default. */
export const PRESET_CHOICES: readonly {label: string; value: PresetName}[] = [
  {label: 'Neutral', value: 'neutral'},
  {label: 'Slate', value: 'slate'},
]
