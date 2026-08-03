# `nat-ui init` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `nat-ui init`, which prepares a project to receive components by writing `components.json`, the `cn` utility, and CSS theme variables, then installing `clsx` and `tailwind-merge`.

**Architecture:** Pure transforms are separated from I/O. Three modules are pure functions over data (package-manager detection, theme application, config resolution) and carry the bulk of the tests. Filesystem inspection and prompting sit at the edges and are injected into the command, so the orchestration can be driven in tests with scripted answers and a stubbed installer.

**Tech Stack:** TypeScript, Zod (via `@nat-ui/schema`), `@clack/prompts`, `util.parseArgs` from the Node standard library, tsup for bundling, Vitest for tests.

**Design spec:** `docs/superpowers/specs/2026-08-03-init-command-design.md`

## Global Constraints

- Node floor is `>=22.13`. `util.parseArgs` and `node:fs/promises` are available; no argument-parsing dependency.
- `@nat-ui/cli` ships with **no runtime dependencies**. Every dependency is a `devDependency` and is bundled by tsup via `noExternal`.
- Shared dependency versions live in the `catalog:` block of `pnpm-workspace.yaml`. Packages reference them as `"catalog:"`, never a literal range.
- Prettier config is `semi: false`, `singleQuote: true`, `bracketSpacing: false`, `trailingComma: "all"`, `printWidth: 100`, `tabWidth: 2`. Code must match or `pnpm format:check` fails in CI.
- ESLint runs `recommendedTypeChecked` and `stylisticTypeChecked`. Avoid `any` and unchecked assignments from untyped values; parse unknown JSON through a schema or narrow it explicitly.
- `tsconfig.base.json` sets `verbatimModuleSyntax`, so type-only imports must use `import type` or inline `type`.
- `noUncheckedIndexedAccess` is on. Indexing an array yields `T | undefined` and must be narrowed.
- Tests live beside their source as `*.test.ts`, matching `packages/schema/src/config.test.ts`.
- CI runs `pnpm build` before `lint`, `typecheck`, and `test`, because packages resolve each other through their published `exports`.
- Commit after every task. Never commit with failing tests.

---

## File Structure

Created under `packages/cli/`:

| Path                            | Responsibility                                                          |
| ------------------------------- | ----------------------------------------------------------------------- |
| `src/detect/package-manager.ts` | Lockfile list and user agent → package manager, and its install command |
| `src/fs/read-text.ts`           | Reading a file or probing a directory without throwing                  |
| `src/detect/project.ts`         | Inspect a directory → detected defaults                                 |
| `src/config/resolve.ts`         | Answers → validated `Config`; owns the `InitAnswers` type               |
| `src/theme/presets.ts`          | The two theme presets as token maps                                     |
| `src/theme/apply.ts`            | Stylesheet text + preset → new stylesheet text                          |
| `src/templates/cn.ts`           | The `cn` utility source, TypeScript and JavaScript                      |
| `src/prompts/ask.ts`            | `@clack/prompts` wrapper plus the non-interactive default path          |
| `src/commands/init.ts`          | Orchestrates the flow; all I/O injected                                 |
| `scripts/generate-notices.ts`   | Build-time third-party notices generation                               |

Modified: `src/index.ts`, `tsup.config.ts`, `package.json`, `tsconfig.json`, and `pnpm-workspace.yaml`. Deleted: `packages/cli/THIRD_PARTY_NOTICES`.

`InitAnswers` lives in `config/resolve.ts` rather than in `prompts/ask.ts` on purpose. `resolve.ts` must stay free of any `@clack/prompts` import so it remains a pure module; the dependency therefore points from the prompt layer to the pure layer, never the other way.

---

### Task 1: Package manager detection

**Files:**

- Create: `packages/cli/src/detect/package-manager.ts`
- Test: `packages/cli/src/detect/package-manager.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `type PackageManager = 'pnpm' | 'yarn' | 'npm' | 'bun'`
  - `detectPackageManager(files: readonly string[], userAgent: string | undefined): PackageManager`
  - `installCommand(pm: PackageManager, packages: readonly string[]): {command: string; args: string[]}`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/detect/package-manager.test.ts`:

```ts
import {describe, expect, test} from 'vitest'
import {detectPackageManager, installCommand} from './package-manager'

describe('detectPackageManager', () => {
  test('recognises each lockfile', () => {
    expect(detectPackageManager(['pnpm-lock.yaml'], undefined)).toBe('pnpm')
    expect(detectPackageManager(['yarn.lock'], undefined)).toBe('yarn')
    expect(detectPackageManager(['package-lock.json'], undefined)).toBe('npm')
    expect(detectPackageManager(['bun.lock'], undefined)).toBe('bun')
  })

  test('prefers pnpm when several lockfiles are present', () => {
    const files = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']

    expect(detectPackageManager(files, undefined)).toBe('pnpm')
  })

  test('falls back to the user agent when no lockfile exists', () => {
    expect(detectPackageManager([], 'yarn/4.9.1 npm/? node/v22.13.0')).toBe('yarn')
  })

  test('prefers a lockfile over the user agent', () => {
    expect(detectPackageManager(['pnpm-lock.yaml'], 'npm/10.9.2 node/v22.13.0')).toBe('pnpm')
  })

  test('falls back to npm when nothing identifies a manager', () => {
    expect(detectPackageManager([], undefined)).toBe('npm')
    expect(detectPackageManager([], 'deno/2.0.0')).toBe('npm')
  })
})

describe('installCommand', () => {
  test('uses add for every manager except npm', () => {
    expect(installCommand('pnpm', ['clsx'])).toEqual({command: 'pnpm', args: ['add', 'clsx']})
    expect(installCommand('yarn', ['clsx'])).toEqual({command: 'yarn', args: ['add', 'clsx']})
    expect(installCommand('bun', ['clsx'])).toEqual({command: 'bun', args: ['add', 'clsx']})
    expect(installCommand('npm', ['clsx'])).toEqual({command: 'npm', args: ['install', 'clsx']})
  })

  test('passes every package through', () => {
    expect(installCommand('pnpm', ['clsx', 'tailwind-merge']).args).toEqual([
      'add',
      'clsx',
      'tailwind-merge',
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/detect/package-manager.test.ts`
Expected: FAIL — cannot resolve `./package-manager`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/cli/src/detect/package-manager.ts`:

```ts
export type PackageManager = 'pnpm' | 'yarn' | 'npm' | 'bun'

/**
 * Ordered, so a project carrying more than one lockfile resolves predictably
 * rather than by directory listing order.
 */
const LOCKFILES: ReadonlyArray<readonly [string, PackageManager]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
  ['bun.lock', 'bun'],
]

const isPackageManager = (value: string): value is PackageManager =>
  value === 'pnpm' || value === 'yarn' || value === 'npm' || value === 'bun'

export const detectPackageManager = (
  files: readonly string[],
  userAgent: string | undefined,
): PackageManager => {
  for (const [lockfile, manager] of LOCKFILES) {
    if (files.includes(lockfile)) return manager
  }

  // npm_config_user_agent looks like "pnpm/10.34.5 npm/? node/v22.13.0".
  const name = userAgent?.split('/')[0]
  if (name !== undefined && isPackageManager(name)) return name

  return 'npm'
}

export const installCommand = (
  pm: PackageManager,
  packages: readonly string[],
): {command: string; args: string[]} => ({
  command: pm,
  args: [pm === 'npm' ? 'install' : 'add', ...packages],
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/detect/package-manager.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/detect/
git commit -m "feat(cli): detect the project's package manager"
```

---

### Task 2: The `cn` utility template

**Files:**

- Create: `packages/cli/src/templates/cn.ts`
- Test: `packages/cli/src/templates/cn.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `cnTemplate(tsx: boolean): string`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/templates/cn.test.ts`:

```ts
import {describe, expect, test} from 'vitest'
import {cnTemplate} from './cn'

describe('cnTemplate', () => {
  test('exports cn and imports both helpers in either language', () => {
    for (const tsx of [true, false]) {
      const source = cnTemplate(tsx)

      expect(source).toContain('export function cn(')
      expect(source).toContain("from 'clsx'")
      expect(source).toContain("from 'tailwind-merge'")
      expect(source.endsWith('\n')).toBe(true)
    }
  })

  test('annotates types only for TypeScript', () => {
    expect(cnTemplate(true)).toContain('ClassValue')
    expect(cnTemplate(false)).not.toContain('ClassValue')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/templates/cn.test.ts`
Expected: FAIL — cannot resolve `./cn`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/cli/src/templates/cn.ts`:

```ts
const TYPESCRIPT = `import {type ClassValue, clsx} from 'clsx'
import {twMerge} from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
`

const JAVASCRIPT = `import {clsx} from 'clsx'
import {twMerge} from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
`

export const cnTemplate = (tsx: boolean): string => (tsx ? TYPESCRIPT : JAVASCRIPT)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/templates/cn.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/templates/
git commit -m "feat(cli): add the cn utility template"
```

---

### Task 3: Theme presets

**Files:**

- Create: `packages/cli/src/theme/presets.ts`
- Test: `packages/cli/src/theme/presets.test.ts`

**Interfaces:**

- Consumes: `BaseColor` from `@nat-ui/schema`.
- Produces:
  - `type ThemePreset = {light: Record<string, string>; dark: Record<string, string>}`
  - `const PRESETS: Record<'neutral' | 'slate', ThemePreset>`
  - `const PRESET_CHOICES: ReadonlyArray<{label: string; value: BaseColor}>` — ordered, first is the default
  - `const THEME_TOKENS: readonly string[]` — the token contract

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/theme/presets.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/theme/presets.test.ts`
Expected: FAIL — cannot resolve `./presets`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/cli/src/theme/presets.ts`:

```ts
import type {BaseColor} from '@nat-ui/schema'

export type ThemePreset = {
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

export const PRESETS = {neutral, slate} satisfies Record<string, ThemePreset>

/** Ordered. The first entry is what the prompt offers by default. */
export const PRESET_CHOICES: ReadonlyArray<{label: string; value: BaseColor}> = [
  {label: 'Neutral', value: 'neutral'},
  {label: 'Slate', value: 'slate'},
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/theme/presets.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/theme/
git commit -m "feat(cli): add neutral and slate theme presets"
```

---

### Task 4: Applying the theme to a stylesheet

**Files:**

- Create: `packages/cli/src/theme/apply.ts`
- Test: `packages/cli/src/theme/apply.test.ts`

**Interfaces:**

- Consumes: `ThemePreset` and `PRESETS` from `./presets`.
- Produces:
  - `const THEME_START = '/* nat-ui theme start */'`
  - `const THEME_END = '/* nat-ui theme end */'`
  - `applyTheme(stylesheet: string, preset: ThemePreset): string` — throws when it finds a
    partial block

A partial block means exactly one of the two markers is present, or they appear in the
wrong order. Falling through and inserting a fresh block in that situation is worse than
failing: the orphaned rules from the previous run stay in the file _below_ the new block,
and since they are equal-specificity selectors appearing later, the stale values win in
the browser. The user would pick a new style, be told it worked, and see no change. So a
partial block is an error the user has to resolve.

Both markers missing is a different case and is not detectable — a stylesheet with no
markers is indistinguishable from one that was never initialized but happens to define its
own `:root` block. That limitation stands. — throws when it finds a
partial block

A partial block means exactly one of the two markers is present, or they appear in the
wrong order. Falling through and inserting a fresh block in that situation is worse than
failing: the orphaned rules from the previous run stay in the file _below_ the new block,
and since they are equal-specificity selectors appearing later, the stale values win in
the browser. The user would pick a new style, be told it worked, and see no change. So a
partial block is an error the user has to resolve.

Both markers missing is a different case and is not detectable — a stylesheet with no
markers is indistinguishable from one that was never initialized but happens to define its
own `:root` block. That limitation stands.

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/theme/apply.test.ts`:

```ts
import {describe, expect, test} from 'vitest'
import {THEME_END, THEME_START, applyTheme} from './apply'
import {PRESETS} from './presets'

const withImport = "@import 'tailwindcss';\n\n.app {\n  color: red;\n}\n"

const countOf = (haystack: string, needle: string): number => haystack.split(needle).length - 1

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('applyTheme', () => {
  test('inserts a marked block after the tailwindcss import', () => {
    const result = applyTheme(withImport, PRESETS.neutral)

    expect(result).toContain(THEME_START)
    expect(result).toContain(THEME_END)
    expect(result.indexOf('tailwindcss')).toBeLessThan(result.indexOf(THEME_START))
  })

  test('keeps the rest of the stylesheet', () => {
    const result = applyTheme(withImport, PRESETS.neutral)

    expect(result).toContain('.app {')
    expect(result).toContain('color: red;')
  })

  test('writes tokens for both themes', () => {
    const result = applyTheme(withImport, PRESETS.neutral)

    expect(result).toContain('--background: oklch(1 0 0);')
    expect(result).toContain(':root')
    expect(result).toContain('.dark')
  })

  test('is idempotent, so re-running never appends a second block', () => {
    const once = applyTheme(withImport, PRESETS.neutral)
    const twice = applyTheme(once, PRESETS.neutral)

    expect(twice).toBe(once)
    expect(countOf(twice, THEME_START)).toBe(1)
  })

  test('replaces an existing block when the preset changes', () => {
    const asNeutral = applyTheme(withImport, PRESETS.neutral)
    const asSlate = applyTheme(asNeutral, PRESETS.slate)

    expect(countOf(asSlate, THEME_START)).toBe(1)
    expect(asSlate).toContain('--foreground: oklch(0.129 0.042 264.695);')
    expect(asSlate).not.toContain('--foreground: oklch(0.145 0 0);')
  })

  test('refuses a stylesheet carrying only the start marker', () => {
    const damaged = applyTheme(withImport, PRESETS.neutral).replace(THEME_START, '')

    expect(() => applyTheme(damaged, PRESETS.slate)).toThrow(/nat-ui theme/)
  })

  test('refuses a stylesheet carrying only the end marker', () => {
    const damaged = applyTheme(withImport, PRESETS.neutral).replace(THEME_END, '')

    expect(() => applyTheme(damaged, PRESETS.slate)).toThrow(/nat-ui theme/)
  })

  test('refuses markers in the wrong order', () => {
    const damaged = `${THEME_END}\n:root {\n}\n${THEME_START}\n`

    expect(() => applyTheme(damaged, PRESETS.neutral)).toThrow(/nat-ui theme/)
  })

  test('names both markers in the error, so the user can find them', () => {
    const damaged = applyTheme(withImport, PRESETS.neutral).replace(THEME_START, '')

    expect(() => applyTheme(damaged, PRESETS.slate)).toThrow(
      new RegExp(`${escapeRegExp(THEME_START)}[\\s\\S]*${escapeRegExp(THEME_END)}`),
    )
  })

  test('prepends when the stylesheet has no tailwindcss import', () => {
    const result = applyTheme('.app {\n  color: red;\n}\n', PRESETS.neutral)

    expect(result.indexOf(THEME_START)).toBe(0)
    expect(result).toContain('.app {')
  })

  test('accepts a double-quoted import too', () => {
    const result = applyTheme('@import "tailwindcss";\n', PRESETS.neutral)

    expect(result.indexOf('tailwindcss')).toBeLessThan(result.indexOf(THEME_START))
  })
})

describe('applyTheme with a partial block', () => {
  const applied = applyTheme(withImport, PRESETS.neutral)

  test('refuses a block whose start marker was removed', () => {
    const damaged = applied.replace(`${THEME_START}\n`, '')

    expect(() => applyTheme(damaged, PRESETS.slate)).toThrow(/theme/i)
  })

  test('refuses a block whose end marker was removed', () => {
    const damaged = applied.replace(THEME_END, '')

    expect(() => applyTheme(damaged, PRESETS.slate)).toThrow(/theme/i)
  })

  test('refuses markers in the wrong order', () => {
    const damaged = `${THEME_END}\n:root {\n  --background: red;\n}\n${THEME_START}\n`

    expect(() => applyTheme(damaged, PRESETS.slate)).toThrow(/theme/i)
  })

  test('names both markers so the user knows what to repair', () => {
    const damaged = applied.replace(`${THEME_START}\n`, '')

    expect(() => applyTheme(damaged, PRESETS.slate)).toThrow(
      new RegExp(`${escapeRegExp(THEME_START)}[\\s\\S]*${escapeRegExp(THEME_END)}`),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/theme/apply.test.ts`
Expected: FAIL — cannot resolve `./apply`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/cli/src/theme/apply.ts`:

```ts
import type {ThemePreset} from './presets'

export const THEME_START = '/* nat-ui theme start */'
export const THEME_END = '/* nat-ui theme end */'

/** Matches `@import 'tailwindcss';` however it is quoted, and the whole line. */
const TAILWIND_IMPORT = /^.*@import\s+['"]tailwindcss['"].*$/m

const declarations = (tokens: Record<string, string>): string =>
  Object.entries(tokens)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')

const block = (preset: ThemePreset): string =>
  [
    THEME_START,
    ':root {',
    declarations(preset.light),
    '}',
    '',
    '.dark {',
    declarations(preset.dark),
    '}',
    THEME_END,
  ].join('\n')

export const applyTheme = (stylesheet: string, preset: ThemePreset): string => {
  const next = block(preset)

  const start = stylesheet.indexOf(THEME_START)
  const end = stylesheet.indexOf(THEME_END)
  const hasStart = start !== -1
  const hasEnd = end !== -1

  // Inserting a fresh block alongside a half-marked one would leave the previous
  // run's rules below the new ones, where they win the cascade and silently
  // override the style the user just picked. Refuse instead.
  if (hasStart !== hasEnd || (hasStart && end < start)) {
    throw new Error(
      `Your stylesheet has an incomplete nat-ui theme block. It needs both ${THEME_START} ` +
        `and ${THEME_END}, in that order. Restore the missing marker or delete the leftover ` +
        `block, then run init again.`,
    )
  }

  if (hasStart && hasEnd) {
    return stylesheet.slice(0, start) + next + stylesheet.slice(end + THEME_END.length)
  }

  const match = TAILWIND_IMPORT.exec(stylesheet)
  if (match?.index === undefined) return `${next}\n\n${stylesheet}`

  const insertAt = match.index + match[0].length

  return `${stylesheet.slice(0, insertAt)}\n\n${next}\n${stylesheet.slice(insertAt)}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/theme/apply.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/theme/
git commit -m "feat(cli): apply theme variables idempotently"
```

---

### Task 5: Config resolution

**Files:**

- Create: `packages/cli/src/config/resolve.ts`
- Test: `packages/cli/src/config/resolve.test.ts`

**Interfaces:**

- Consumes: `configSchema`, `type Config`, `type BaseColor` from `@nat-ui/schema`.
- Produces:
  - `type InitAnswers = {baseColor: BaseColor; css: string; aliasPrefix: string; rsc: boolean; tsx: boolean}`
  - `resolveConfig(answers: InitAnswers): Config`
  - `aliasesFor(prefix: string): {components: string; utils: string; ui: string}`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/config/resolve.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/config/resolve.test.ts`
Expected: FAIL — cannot resolve `./resolve`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/cli/src/config/resolve.ts`:

```ts
import {type BaseColor, type Config, configSchema} from '@nat-ui/schema'

export type InitAnswers = {
  baseColor: BaseColor
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/config/resolve.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/config/
git commit -m "feat(cli): resolve answers into a validated config"
```

---

### Task 6: Project detection

**Files:**

- Create: `packages/cli/src/fs/read-text.ts`
- Test: `packages/cli/src/fs/read-text.test.ts`
- Create: `packages/cli/src/detect/project.ts`
- Test: `packages/cli/src/detect/project.test.ts`

**Interfaces:**

- Consumes: `detectPackageManager`, `type PackageManager` from `./package-manager`.
- Produces from `fs/read-text.ts`, shared with Task 8 so the helper exists once:
  - `readText(path: string): Promise<string | undefined>`
  - `fileExists(path: string): Promise<boolean>`
  - `directoryExists(path: string): Promise<boolean>`
- Produces from `detect/project.ts`:
  - `type DetectedProject = {hasPackageJson: boolean; hasTsconfig: boolean; css: string | undefined; aliasPrefix: string; tsx: boolean; rsc: boolean; packageManager: PackageManager}`
  - `const CSS_CANDIDATES: readonly string[]`
  - `detectProject(cwd: string, env: NodeJS.ProcessEnv): Promise<DetectedProject>`

- [ ] **Step 1: Write the failing test for the filesystem helpers**

Create `packages/cli/src/fs/read-text.test.ts`:

```ts
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {beforeEach, describe, expect, test} from 'vitest'
import {directoryExists, fileExists, readText} from './read-text'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'nat-ui-fs-'))
  await writeFile(join(root, 'file.txt'), 'contents\n', 'utf8')
  await mkdir(join(root, 'dir'))
})

describe('readText', () => {
  test('returns the contents of a file', async () => {
    expect(await readText(join(root, 'file.txt'))).toBe('contents\n')
  })

  test('returns undefined instead of throwing when the path is missing', async () => {
    expect(await readText(join(root, 'nope.txt'))).toBeUndefined()
  })

  test('returns undefined for a directory', async () => {
    expect(await readText(join(root, 'dir'))).toBeUndefined()
  })
})

describe('fileExists', () => {
  test('distinguishes a file from a missing path', async () => {
    expect(await fileExists(join(root, 'file.txt'))).toBe(true)
    expect(await fileExists(join(root, 'nope.txt'))).toBe(false)
  })
})

describe('directoryExists', () => {
  test('distinguishes a directory from a file and from nothing', async () => {
    expect(await directoryExists(join(root, 'dir'))).toBe(true)
    expect(await directoryExists(join(root, 'file.txt'))).toBe(false)
    expect(await directoryExists(join(root, 'nope'))).toBe(false)
  })
})
```

- [ ] **Step 2: Write the filesystem helpers**

Run `pnpm vitest run packages/cli/src/fs/read-text.test.ts` first and confirm it fails on the missing module, then create `packages/cli/src/fs/read-text.ts`:

```ts
import {readFile, readdir} from 'node:fs/promises'

/**
 * Init inspects paths that are routinely absent, so absence is an answer here
 * rather than an exception every caller has to catch.
 */
export const readText = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

export const fileExists = async (path: string): Promise<boolean> =>
  (await readText(path)) !== undefined

export const directoryExists = async (path: string): Promise<boolean> => {
  try {
    await readdir(path)

    return true
  } catch {
    return false
  }
}
```

Expected: PASS, 5 tests.

- [ ] **Step 3: Write the failing test for project detection**

Create `packages/cli/src/detect/project.test.ts`:

```ts
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {beforeEach, describe, expect, test} from 'vitest'
import {detectProject} from './project'

let cwd: string

const write = async (relative: string, contents: string): Promise<void> => {
  const path = join(cwd, relative)
  await mkdir(join(path, '..'), {recursive: true})
  await writeFile(path, contents, 'utf8')
}

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'nat-ui-detect-'))
})

describe('detectProject', () => {
  test('reports a missing package.json', async () => {
    const detected = await detectProject(cwd, {})

    expect(detected.hasPackageJson).toBe(false)
  })

  test('finds a Next.js app-directory project', async () => {
    await write('package.json', JSON.stringify({dependencies: {next: '16.0.0'}}))
    await write('tsconfig.json', JSON.stringify({compilerOptions: {paths: {'@/*': ['./src/*']}}}))
    await write('src/app/globals.css', "@import 'tailwindcss';\n")
    await write('pnpm-lock.yaml', '')

    const detected = await detectProject(cwd, {})

    expect(detected.hasPackageJson).toBe(true)
    expect(detected.css).toBe('src/app/globals.css')
    expect(detected.aliasPrefix).toBe('@')
    expect(detected.tsx).toBe(true)
    expect(detected.rsc).toBe(true)
    expect(detected.packageManager).toBe('pnpm')
  })

  test('finds a Vite-style project and does not claim RSC', async () => {
    await write('package.json', JSON.stringify({dependencies: {react: '19.0.0'}}))
    await write('tsconfig.json', JSON.stringify({compilerOptions: {paths: {'~/*': ['./src/*']}}}))
    await write('src/index.css', '@import "tailwindcss";\n')

    const detected = await detectProject(cwd, {})

    expect(detected.css).toBe('src/index.css')
    expect(detected.aliasPrefix).toBe('~')
    expect(detected.rsc).toBe(false)
  })

  test('treats a project without tsconfig as JavaScript with an @ prefix', async () => {
    await write('package.json', '{}')

    const detected = await detectProject(cwd, {})

    expect(detected.hasTsconfig).toBe(false)
    expect(detected.tsx).toBe(false)
    expect(detected.aliasPrefix).toBe('@')
  })

  test('ignores a stylesheet that does not import tailwind', async () => {
    await write('package.json', '{}')
    await write('app/globals.css', 'body {\n  margin: 0;\n}\n')

    const detected = await detectProject(cwd, {})

    expect(detected.css).toBeUndefined()
  })

  test('does not claim RSC for Next.js without an app directory', async () => {
    await write('package.json', JSON.stringify({dependencies: {next: '16.0.0'}}))
    await write('pages/index.tsx', 'export default function Page() {}\n')

    const detected = await detectProject(cwd, {})

    expect(detected.rsc).toBe(false)
  })

  test('falls back to the user agent for the package manager', async () => {
    await write('package.json', '{}')

    const detected = await detectProject(cwd, {npm_config_user_agent: 'bun/1.2.0'})

    expect(detected.packageManager).toBe('bun')
  })

  test('survives malformed json without throwing', async () => {
    await write('package.json', '{not json')
    await write('tsconfig.json', '{not json')

    const detected = await detectProject(cwd, {})

    expect(detected.hasPackageJson).toBe(true)
    expect(detected.rsc).toBe(false)
    expect(detected.aliasPrefix).toBe('@')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/detect/project.test.ts`
Expected: FAIL — cannot resolve `./project`.

- [ ] **Step 5: Write minimal implementation**

Create `packages/cli/src/detect/project.ts`:

```ts
import {readdir} from 'node:fs/promises'
import {join} from 'node:path'
import {directoryExists, fileExists, readText} from '../fs/read-text'
import {detectPackageManager, type PackageManager} from './package-manager'

export type DetectedProject = {
  hasPackageJson: boolean
  hasTsconfig: boolean
  css: string | undefined
  aliasPrefix: string
  tsx: boolean
  rsc: boolean
  packageManager: PackageManager
}

/** Ordered by how likely each layout is, and checked with a `tailwindcss` import. */
export const CSS_CANDIDATES = [
  'app/globals.css',
  'src/app/globals.css',
  'src/index.css',
  'src/styles/globals.css',
  'styles/globals.css',
] as const

const DEFAULT_ALIAS_PREFIX = '@'

const readJson = async (path: string): Promise<Record<string, unknown> | undefined> => {
  const text = await readText(path)
  if (text === undefined) return undefined

  try {
    const parsed: unknown = JSON.parse(text)

    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

const findStylesheet = async (cwd: string): Promise<string | undefined> => {
  for (const candidate of CSS_CANDIDATES) {
    const contents = await readText(join(cwd, candidate))
    if (contents !== undefined && /@import\s+['"]tailwindcss['"]/.test(contents)) {
      return candidate
    }
  }

  return undefined
}

/** Reads the prefix out of the first `paths` key shaped like `X/*`. */
const findAliasPrefix = (tsconfig: Record<string, unknown> | undefined): string => {
  const paths = asRecord(asRecord(tsconfig?.compilerOptions).paths)
  for (const key of Object.keys(paths)) {
    const prefix = /^(.+)\/\*$/.exec(key)?.[1]
    if (prefix !== undefined) return prefix
  }

  return DEFAULT_ALIAS_PREFIX
}

const usesNext = (pkg: Record<string, unknown> | undefined): boolean =>
  'next' in asRecord(pkg?.dependencies) || 'next' in asRecord(pkg?.devDependencies)

export const detectProject = async (
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<DetectedProject> => {
  const pkg = await readJson(join(cwd, 'package.json'))
  const tsconfig = await readJson(join(cwd, 'tsconfig.json'))

  const hasPackageJson = await fileExists(join(cwd, 'package.json'))
  const hasTsconfig = await fileExists(join(cwd, 'tsconfig.json'))

  const hasAppDir =
    (await directoryExists(join(cwd, 'app'))) || (await directoryExists(join(cwd, 'src/app')))

  const files = await listDirectory(cwd)

  return {
    hasPackageJson,
    hasTsconfig,
    css: await findStylesheet(cwd),
    aliasPrefix: findAliasPrefix(tsconfig),
    tsx: hasTsconfig,
    rsc: usesNext(pkg) && hasAppDir,
    packageManager: detectPackageManager(files, env.npm_config_user_agent),
  }
}

const listDirectory = async (path: string): Promise<string[]> => {
  try {
    return await readdir(path)
  } catch {
    return []
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/detect/project.test.ts`
Expected: PASS, 8 tests.

Note on why `fs/read-text.ts` has both existence helpers: `readText` fails on a directory, so `fileExists` answers only "is there a readable file here". `directoryExists` uses `readdir` and is what the app-directory check needs. Do not collapse them.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/fs/ packages/cli/src/detect/
git commit -m "feat(cli): detect project layout, aliases, and stylesheet"
```

---

### Task 7: Prompts

**Files:**

- Create: `packages/cli/src/prompts/ask.ts`
- Test: `packages/cli/src/prompts/ask.test.ts`
- Modify: `pnpm-workspace.yaml` (add `@clack/prompts` to the catalog)
- Modify: `packages/cli/package.json` (add `@clack/prompts` as a devDependency)
- Modify: `packages/cli/tsup.config.ts` (bundle `@clack/prompts`)

**Interfaces:**

- Consumes: `type DetectedProject` from `../detect/project`, `type InitAnswers` from `../config/resolve`, `PRESET_CHOICES` from `../theme/presets`.
- Produces:
  - `type Asker = (detected: DetectedProject) => Promise<InitAnswers | undefined>` — `undefined` means the user cancelled
  - `defaultAnswers(detected: DetectedProject): InitAnswers` — throws if no stylesheet was detected
  - `ask: Asker` — the interactive implementation
  - `confirmOverwrite(): Promise<boolean>`

- [ ] **Step 1: Add the dependency**

In `pnpm-workspace.yaml`, add to the `catalog:` block in alphabetical order:

```yaml
'@clack/prompts': ^1.7.0
```

In `packages/cli/package.json`, add to `devDependencies` in alphabetical order:

```json
    "@clack/prompts": "catalog:",
```

In `packages/cli/tsup.config.ts`, add it to `noExternal`:

```ts
  noExternal: [/^@nat-ui\//, 'zod', '@clack/prompts'],
```

That last edit belongs here rather than in a later task: the package is a
devDependency, so if the bundler treated it as external, the built CLI would
carry an import that nothing declares. Adding the dependency and bundling it are
one change.

Run: `pnpm install`
Expected: lockfile updates, install succeeds.

- [ ] **Step 2: Write the failing test**

Create `packages/cli/src/prompts/ask.test.ts`:

```ts
import {describe, expect, test} from 'vitest'
import type {DetectedProject} from '../detect/project'
import {defaultAnswers} from './ask'

const detected: DetectedProject = {
  hasPackageJson: true,
  hasTsconfig: true,
  css: 'src/app/globals.css',
  aliasPrefix: '@',
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/prompts/ask.test.ts`
Expected: FAIL — cannot resolve `./ask`.

- [ ] **Step 4: Write minimal implementation**

Create `packages/cli/src/prompts/ask.ts`:

```ts
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
    validate: (value) => (value.trim() === '' ? 'A stylesheet path is required.' : undefined),
  })
  if (isCancel(css)) return undefined

  const aliasPrefix = await text({
    message: 'What import alias prefix do you use?',
    initialValue: detected.aliasPrefix,
    validate: (value) => (value.trim() === '' ? 'An alias prefix is required.' : undefined),
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/prompts/ask.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Verify the bundle carries the dependency rather than importing it**

```bash
pnpm --filter @nat-ui/cli build
node -e "const p=require('./packages/cli/package.json');console.log(p.dependencies)"
grep -c "@clack/prompts" packages/cli/dist/index.js || echo "no bare import, correctly bundled"
```

Expected: `undefined` for `dependencies`, and no bare `@clack/prompts` import left in
the bundle.

- [ ] **Step 7: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml packages/cli/package.json packages/cli/tsup.config.ts packages/cli/src/prompts/
git commit -m "feat(cli): add init prompts with detected defaults"
```

---

### Task 8: The `init` command

**Files:**

- Create: `packages/cli/src/commands/init.ts`
- Test: `packages/cli/src/commands/init.test.ts`

**Interfaces:**

- Consumes: `detectProject`, `installCommand`, `type PackageManager`, `resolveConfig`, `type InitAnswers`, `aliasesFor`, `applyTheme`, `PRESETS`, `cnTemplate`, `type Asker`, `defaultAnswers`.
- Produces:
  - `type InitIo = {cwd: string; env: NodeJS.ProcessEnv; interactive: boolean; ask: Asker; confirmOverwrite: () => Promise<boolean>; install: (pm: PackageManager, packages: readonly string[], cwd: string) => Promise<void>; log: (message: string) => void}`
  - `const INSTALLED_PACKAGES = ['clsx', 'tailwind-merge']`
  - `init(io: InitIo, options: {yes: boolean}): Promise<number>` — resolves to an exit code

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/commands/init.test.ts`:

```ts
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {beforeEach, describe, expect, test} from 'vitest'
import type {PackageManager} from '../detect/package-manager'
import {THEME_START} from '../theme/apply'
import {init, type InitIo} from './init'

let cwd: string
let installs: Array<{pm: PackageManager; packages: readonly string[]}>
let logs: string[]

const write = async (relative: string, contents: string): Promise<void> => {
  const path = join(cwd, relative)
  await mkdir(join(path, '..'), {recursive: true})
  await writeFile(path, contents, 'utf8')
}

const read = (relative: string): Promise<string> => readFile(join(cwd, relative), 'utf8')

const io = (overrides: Partial<InitIo> = {}): InitIo => ({
  cwd,
  env: {},
  interactive: false,
  ask: () => Promise.resolve(undefined),
  confirmOverwrite: () => Promise.resolve(false),
  install: (pm, packages) => {
    installs.push({pm, packages})

    return Promise.resolve()
  },
  log: (message) => logs.push(message),
  ...overrides,
})

const nextProject = async (): Promise<void> => {
  await write('package.json', JSON.stringify({dependencies: {next: '16.0.0'}}))
  await write('tsconfig.json', JSON.stringify({compilerOptions: {paths: {'@/*': ['./src/*']}}}))
  await write('src/app/globals.css', "@import 'tailwindcss';\n")
  await write('pnpm-lock.yaml', '')
  await mkdir(join(cwd, 'src/app'), {recursive: true})
}

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'nat-ui-init-'))
  installs = []
  logs = []
})

describe('init', () => {
  test('writes config, utility, and theme, then installs', async () => {
    await nextProject()

    const code = await init(io(), {yes: true})

    expect(code).toBe(0)

    const config: unknown = JSON.parse(await read('components.json'))
    expect(config).toMatchObject({
      rsc: true,
      tsx: true,
      tailwind: {css: 'src/app/globals.css', baseColor: 'neutral', cssVariables: true, prefix: ''},
      aliases: {ui: '@/components/ui'},
    })

    expect(await read('src/lib/utils.ts')).toContain('export function cn(')
    expect(await read('src/app/globals.css')).toContain(THEME_START)
    expect(installs).toEqual([{pm: 'pnpm', packages: ['clsx', 'tailwind-merge']}])
  })

  test('refuses a directory with no package.json and writes nothing', async () => {
    const code = await init(io(), {yes: true})

    expect(code).toBe(1)
    await expect(read('components.json')).rejects.toThrow()
    expect(installs).toEqual([])
  })

  test('fails before writing when the stylesheet cannot be found', async () => {
    await write('package.json', '{}')

    const code = await init(io(), {yes: true})

    expect(code).toBe(1)
    await expect(read('components.json')).rejects.toThrow()
  })

  test('writes a js utility for a javascript project', async () => {
    await write('package.json', '{}')
    await write('app/globals.css', "@import 'tailwindcss';\n")

    const code = await init(io(), {yes: true})

    expect(code).toBe(0)
    expect(await read('lib/utils.js')).toContain('export function cn(')
    await expect(read('lib/utils.ts')).rejects.toThrow()
  })

  test('declines to overwrite an existing config when not interactive', async () => {
    await nextProject()
    await write('components.json', '{"existing": true}')

    const code = await init(io(), {yes: true})

    expect(code).toBe(0)
    expect(await read('components.json')).toContain('existing')
    expect(installs).toEqual([])
  })

  test('overwrites an existing config when the user confirms', async () => {
    await nextProject()
    await write('components.json', '{"existing": true}')

    const code = await init(
      io({interactive: true, confirmOverwrite: () => Promise.resolve(true)}),
      {
        yes: true,
      },
    )

    expect(code).toBe(0)
    expect(await read('components.json')).not.toContain('existing')
  })

  test('leaves an existing utility file alone', async () => {
    await nextProject()
    await write('src/lib/utils.ts', 'export const mine = 1\n')

    const code = await init(io(), {yes: true})

    expect(code).toBe(0)
    expect(await read('src/lib/utils.ts')).toBe('export const mine = 1\n')
    expect(logs.join('\n')).toMatch(/utils\.ts/)
  })

  test('is idempotent: running twice leaves one theme block', async () => {
    await nextProject()

    await init(io(), {yes: true})
    await init(io({interactive: true, confirmOverwrite: () => Promise.resolve(true)}), {yes: true})

    const css = await read('src/app/globals.css')
    expect(css.split(THEME_START).length - 1).toBe(1)
  })

  test('reports install failure with the command to run by hand', async () => {
    await nextProject()

    const code = await init(io({install: () => Promise.reject(new Error('network down'))}), {
      yes: true,
    })

    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('pnpm add clsx tailwind-merge')
    expect(await read('components.json')).toContain('baseColor')
  })

  test('uses scripted answers when interactive', async () => {
    await nextProject()

    const code = await init(
      io({
        interactive: true,
        ask: () =>
          Promise.resolve({
            baseColor: 'slate' as const,
            css: 'src/app/globals.css',
            aliasPrefix: '~',
            rsc: false,
            tsx: true,
          }),
      }),
      {yes: false},
    )

    expect(code).toBe(0)

    const config: unknown = JSON.parse(await read('components.json'))
    expect(config).toMatchObject({rsc: false, tailwind: {baseColor: 'slate'}})
    expect(await read('src/app/globals.css')).toContain('oklch(0.129 0.042 264.695)')
  })

  test('exits without writing when the user cancels the prompts', async () => {
    await nextProject()

    const code = await init(io({interactive: true}), {yes: false})

    expect(code).toBe(1)
    await expect(read('components.json')).rejects.toThrow()
  })

  test('refuses an incomplete theme block without touching anything', async () => {
    await nextProject()
    await init(io(), {yes: true})
    const applied = await read('src/app/globals.css')
    await write('src/app/globals.css', applied.replace(THEME_START, ''))
    await write('components.json', '{"existing": true}')

    const code = await init(
      io({interactive: true, confirmOverwrite: () => Promise.resolve(true)}),
      {
        yes: true,
      },
    )

    expect(code).toBe(1)
    expect(logs.join('\n')).toMatch(/nat-ui theme/)
    expect(await read('components.json')).toContain('existing')
  })

  test('warns but continues when TypeScript is chosen without a tsconfig', async () => {
    await write('package.json', '{}')
    await write('app/globals.css', "@import 'tailwindcss';\n")

    const code = await init(
      io({
        interactive: true,
        ask: () =>
          Promise.resolve({
            baseColor: 'neutral' as const,
            css: 'app/globals.css',
            aliasPrefix: '@',
            rsc: false,
            tsx: true,
          }),
      }),
      {yes: false},
    )

    expect(code).toBe(0)
    expect(logs.join('\n')).toMatch(/tsconfig/i)
    expect(await read('lib/utils.ts')).toContain('export function cn(')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/commands/init.test.ts`
Expected: FAIL — cannot resolve `./init`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/cli/src/commands/init.ts`:

```ts
import {mkdir, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {CONFIG_FILE_NAME, type Config} from '@nat-ui/schema'
import {aliasesFor, resolveConfig, type InitAnswers} from '../config/resolve'
import {installCommand, type PackageManager} from '../detect/package-manager'
import {detectProject} from '../detect/project'
import {readText} from '../fs/read-text'
import {defaultAnswers, type Asker} from '../prompts/ask'
import {cnTemplate} from '../templates/cn'
import {applyTheme} from '../theme/apply'
import {PRESETS} from '../theme/presets'

export type InitIo = {
  cwd: string
  env: NodeJS.ProcessEnv
  interactive: boolean
  ask: Asker
  confirmOverwrite: () => Promise<boolean>
  install: (pm: PackageManager, packages: readonly string[], cwd: string) => Promise<void>
  log: (message: string) => void
}

export const INSTALLED_PACKAGES = ['clsx', 'tailwind-merge'] as const

/** `@/lib/utils` with prefix `@` and tsconfig paths rooted at src → `src/lib/utils.ts`. */
const utilsPath = (alias: string, prefix: string, underSrc: boolean, tsx: boolean): string => {
  const withoutPrefix = alias.startsWith(`${prefix}/`) ? alias.slice(prefix.length + 1) : alias
  const extension = tsx ? '.ts' : '.js'

  return join(underSrc ? 'src' : '', `${withoutPrefix}${extension}`)
}

export const init = async (io: InitIo, options: {yes: boolean}): Promise<number> => {
  const detected = await detectProject(io.cwd, io.env)

  if (!detected.hasPackageJson) {
    io.log('No package.json found here. Run init from the root of your project.')

    return 1
  }

  const configPath = join(io.cwd, CONFIG_FILE_NAME)
  if ((await readText(configPath)) !== undefined) {
    const overwrite = io.interactive ? await io.confirmOverwrite() : false
    if (!overwrite) {
      io.log(`${CONFIG_FILE_NAME} already exists. Nothing was changed.`)

      return 0
    }
  }

  let answers: InitAnswers
  try {
    const gathered =
      io.interactive && !options.yes ? await io.ask(detected) : defaultAnswers(detected)
    if (gathered === undefined) {
      io.log('Cancelled. Nothing was changed.')

      return 1
    }
    answers = gathered
  } catch (error) {
    io.log(error instanceof Error ? error.message : String(error))

    return 1
  }

  if (answers.tsx && !detected.hasTsconfig) {
    io.log('No tsconfig.json found, so the import alias cannot be verified. Continuing anyway.')
  }

  const stylesheetPath = join(io.cwd, answers.css)
  const stylesheet = await readText(stylesheetPath)
  if (stylesheet === undefined) {
    io.log(`Could not read ${answers.css}. Nothing was changed.`)

    return 1
  }

  // Both of these can fail on bad input, so they run before the first write. Once
  // the config file lands, a later failure would leave a half-configured project.
  let config: Config
  let themed: string
  try {
    config = resolveConfig(answers)
    // Only two of the five base colours the schema allows have a preset. Anything
    // else reaches here only by hand-editing components.json, and falls back to
    // neutral rather than leaving the stylesheet without tokens.
    themed = applyTheme(stylesheet, PRESETS[answers.baseColor === 'slate' ? 'slate' : 'neutral'])
  } catch (error) {
    io.log(error instanceof Error ? error.message : String(error))

    return 1
  }

  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  io.log(`Wrote ${CONFIG_FILE_NAME}`)

  const underSrc = answers.css.startsWith('src/')
  const relativeUtils = utilsPath(
    aliasesFor(answers.aliasPrefix).utils,
    answers.aliasPrefix,
    underSrc,
    answers.tsx,
  )
  const absoluteUtils = join(io.cwd, relativeUtils)

  if ((await readText(absoluteUtils)) === undefined) {
    await mkdir(dirname(absoluteUtils), {recursive: true})
    await writeFile(absoluteUtils, cnTemplate(answers.tsx), 'utf8')
    io.log(`Wrote ${relativeUtils}`)
  } else {
    io.log(`Left ${relativeUtils} alone, since it already exists.`)
  }

  await writeFile(stylesheetPath, themed, 'utf8')
  io.log(`Updated ${answers.css}`)

  const {command, args} = installCommand(detected.packageManager, INSTALLED_PACKAGES)
  try {
    await io.install(detected.packageManager, INSTALLED_PACKAGES, io.cwd)
    io.log(`Installed ${INSTALLED_PACKAGES.join(' and ')}`)
  } catch (error) {
    io.log(error instanceof Error ? error.message : String(error))
    io.log(`Install failed. Run this by hand: ${command} ${args.join(' ')}`)

    return 1
  }

  return 0
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/commands/init.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Run the whole suite and the type checker**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/
git commit -m "feat(cli): implement the init command"
```

---

### Task 9: Wire `init` into the CLI entry point

**Files:**

- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/src/index.test.ts`

**Interfaces:**

- Consumes: `init`, `type InitIo` from `./commands/init`, `ask`, `confirmOverwrite` from `./prompts/ask`.
- Produces: `run(argv: readonly string[]): Promise<number>` — exported so it can be tested without spawning a process.

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/index.test.ts`:

```ts
import {describe, expect, test} from 'vitest'
import {help, run} from './index'

describe('help', () => {
  test('documents both commands and the version flag', () => {
    expect(help).toContain('init')
    expect(help).toContain('add')
    expect(help).toContain('--version')
  })
})

describe('run', () => {
  test('prints help and succeeds with no arguments', async () => {
    const lines: string[] = []

    expect(await run([], (message) => lines.push(message))).toBe(0)
    expect(lines.join('\n')).toContain('Usage')
  })

  test('prints the version for -v and --version', async () => {
    for (const flag of ['-v', '--version']) {
      const lines: string[] = []

      expect(await run([flag], (message) => lines.push(message))).toBe(0)
      expect(lines.join('\n')).toMatch(/^\d+\.\d+\.\d+/)
    }
  })

  test('rejects an unknown command with a non-zero code', async () => {
    const lines: string[] = []

    expect(await run(['nope'], (message) => lines.push(message))).toBe(1)
    expect(lines.join('\n')).toContain('nope')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/index.test.ts`
Expected: FAIL — `run` and `help` are not exported.

- [ ] **Step 3: Rewrite `packages/cli/src/index.ts`**

```ts
#!/usr/bin/env node
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {parseArgs} from 'node:util'
import {init} from './commands/init'
import {ask, confirmOverwrite} from './prompts/ask'

// Resolved at runtime rather than imported, so `../package.json` points at this
// package whether we are running from `src/` or from the bundled `dist/`.
const {version} = createRequire(import.meta.url)('../package.json') as {version: string}

export const help = `
  nat-ui v${version}

  Usage
    $ nat-ui <command> [options]

  Commands
    init    Configure a project to use nat-ui
    add     Add a component to your project

  Options
    --yes           Accept every default without asking
    -v, --version   Print the version
    -h, --help      Show this message
`

type Log = (message: string) => void

export const run = async (argv: readonly string[], log: Log): Promise<number> => {
  const {values, positionals} = parseArgs({
    args: [...argv],
    options: {
      yes: {type: 'boolean', default: false},
      version: {type: 'boolean', short: 'v', default: false},
      help: {type: 'boolean', short: 'h', default: false},
    },
    allowPositionals: true,
    strict: false,
  })

  if (values.version === true) {
    log(version)

    return 0
  }

  const command = positionals[0]

  if (command === undefined || values.help === true) {
    log(help)

    return 0
  }

  if (command === 'init') {
    return init(
      {
        cwd: process.cwd(),
        env: process.env,
        interactive: process.stdin.isTTY === true,
        ask,
        confirmOverwrite,
        install: async (pm, packages, cwd) => {
          const {installCommand} = await import('./detect/package-manager')
          const {spawn} = await import('node:child_process')
          const {command: bin, args} = installCommand(pm, packages)

          await new Promise<void>((resolve, reject) => {
            const child = spawn(bin, args, {
              cwd,
              stdio: 'inherit',
              shell: process.platform === 'win32',
            })
            child.on('error', reject)
            child.on('close', (code) =>
              code === 0 ? resolve() : reject(new Error(`${bin} exited with code ${String(code)}`)),
            )
          })
        },
        log,
      },
      {yes: values.yes === true},
    )
  }

  log(`Unknown command: ${command}\n${help}`)

  return 1
}

// Only run when invoked as the binary. Comparing against argv[1] matters because
// index.test.ts imports this module, and `process.argv[1] !== undefined` would be
// true there too, making the test run the whole CLI on import.
const entry = process.argv[1]
const invokedDirectly = entry !== undefined && import.meta.url === pathToFileURL(entry).href

if (invokedDirectly) {
  run(process.argv.slice(2), (message) => {
    console.log(message)
  })
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/index.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Smoke test the built binary**

Run: `pnpm --filter @nat-ui/cli build && node packages/cli/dist/index.js --help && node packages/cli/dist/index.js -v`
Expected: help text including `--yes`, then the version.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/src/index.test.ts
git commit -m "feat(cli): dispatch init from the entry point"
```

---

### Task 10: Generate third-party notices at build time

**Files:**

- Create: `packages/cli/scripts/generate-notices.ts`
- Modify: `packages/cli/tsup.config.ts`
- Modify: `packages/cli/package.json` (drop `THIRD_PARTY_NOTICES` from `files`)
- Modify: `packages/cli/tsconfig.json` (include `scripts`)
- Delete: `packages/cli/THIRD_PARTY_NOTICES`

**Interfaces:**

- Consumes: the tsup metafile written to `dist/`.
- Produces: `dist/THIRD_PARTY_NOTICES` on every build.

- [ ] **Step 1: Enable the metafile and the hook**

`noExternal` already lists `@clack/prompts` from Task 7; the two additions here are
`metafile` and `onSuccess`. Rewrite `packages/cli/tsup.config.ts`:

```ts
import {defineConfig} from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  // Published as a binary run via `dlx`, so bundle every dependency in and keep
  // the install as small as possible. No consumer ever imports from here.
  //
  // Bundling is why nothing below appears in `dependencies`. It also means a
  // change to @nat-ui/schema changes what this package ships, so schema
  // releases need an accompanying changeset here.
  noExternal: [/^@nat-ui\//, 'zod', '@clack/prompts'],
  dts: false,
  clean: true,
  minify: true,
  // Read after the build to work out whose licenses have to ship.
  metafile: true,
  onSuccess: 'tsx scripts/generate-notices.ts',
})
```

- [ ] **Step 2: Write the failing check**

There is nothing to unit test here; the deliverable is verified by building. Run:

`pnpm --filter @nat-ui/cli build && cat packages/cli/dist/THIRD_PARTY_NOTICES`
Expected: FAIL — `tsx: scripts/generate-notices.ts` does not exist.

- [ ] **Step 3: Write the generator**

Create `packages/cli/scripts/generate-notices.ts`:

```ts
import {readFile, readdir, writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'

const require = createRequire(import.meta.url)
const DIST = new URL('../dist/', import.meta.url)

const LICENSE_NAMES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'license']

/** `../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/index.js` → `zod`. */
const packageNameFrom = (path: string): string | undefined => {
  const after = path.split('node_modules/').pop()
  if (after === undefined) return undefined

  const segments = after.split('/')
  const scoped = segments[0]?.startsWith('@')

  return scoped ? segments.slice(0, 2).join('/') : segments[0]
}

const readMetafile = async (): Promise<{inputs: Record<string, unknown>}> => {
  const files = await readdir(DIST)
  const name = files.find((file) => file.startsWith('metafile-'))
  if (name === undefined) throw new Error('No tsup metafile found in dist/.')

  const parsed: unknown = JSON.parse(await readFile(new URL(name, DIST), 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || !('inputs' in parsed)) {
    throw new Error('Unexpected metafile shape.')
  }

  return parsed as {inputs: Record<string, unknown>}
}

const noticeFor = async (name: string): Promise<string> => {
  const manifestPath = require.resolve(`${name}/package.json`)
  const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))
  const license =
    typeof manifest === 'object' && manifest !== null && 'license' in manifest
      ? String((manifest as {license: unknown}).license)
      : 'unknown'

  const directory = dirname(manifestPath)
  for (const candidate of LICENSE_NAMES) {
    try {
      const text = await readFile(join(directory, candidate), 'utf8')

      return `${name}\n\n${text.trim()}\n`
    } catch {
      continue
    }
  }

  return `${name}\n\nLicensed under ${license}. No license file was published with this package.\n`
}

const main = async (): Promise<void> => {
  const {inputs} = await readMetafile()

  const names = [
    ...new Set(
      Object.keys(inputs)
        .filter((path) => path.includes('node_modules/'))
        .map(packageNameFrom)
        .filter((name): name is string => name !== undefined && !name.startsWith('@nat-ui/')),
    ),
  ].sort()

  const notices = await Promise.all(names.map(noticeFor))

  const header = `THIRD PARTY NOTICES

This package is distributed as a single bundled file. The software listed below
is compiled into dist/index.js, and each license notice is reproduced as that
license requires.

This file is generated at build time from the bundle itself, so it cannot drift
from what actually ships.
`

  const separator = `\n${'-'.repeat(80)}\n\n`

  await writeFile(
    new URL('THIRD_PARTY_NOTICES', DIST),
    [header, ...notices].join(separator),
    'utf8',
  )

  console.log(`Wrote dist/THIRD_PARTY_NOTICES for ${String(names.length)} packages.`)
}

await main()
```

- [ ] **Step 4: Remove what the generator replaces**

Delete the committed file and its `files` entry.

```bash
git rm packages/cli/THIRD_PARTY_NOTICES
```

In `packages/cli/package.json`, change `files` back to:

```json
  "files": [
    "dist"
  ],
```

In `packages/cli/tsconfig.json`, add the script to `include`:

```json
  "include": ["src/**/*.ts", "scripts/**/*.ts", "tsup.config.ts"]
```

- [ ] **Step 5: Verify the notices are generated and shipped**

Run:

```bash
pnpm --filter @nat-ui/cli build
grep -c "Colin McDonnell" packages/cli/dist/THIRD_PARTY_NOTICES
cd packages/cli && npm pack --dry-run 2>&1 | grep -E "THIRD_PARTY|total files"
```

Expected: the grep finds zod's copyright, and the tarball lists `dist/THIRD_PARTY_NOTICES`.

- [ ] **Step 6: Confirm the metafile does not ship**

Run: `cd packages/cli && npm pack --dry-run 2>&1 | grep metafile || echo "metafile not packed"`
Expected: `metafile not packed`. If it is packed, add `"!dist/metafile-*.json"` to `files`.

- [ ] **Step 7: Full verification**

Run: `pnpm build && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/ pnpm-lock.yaml
git commit -m "build(cli): generate third-party notices from the bundle"
```

---

### Task 11: Document `init` and add a changeset

**Files:**

- Modify: `README.md`
- Create: `.changeset/<generated-name>.md`

- [ ] **Step 1: Update the README usage section**

In `README.md`, replace the `Usage` section body with:

````markdown
```bash
pnpm dlx @nat-ui/cli@latest init
pnpm dlx @nat-ui/cli@latest add button
```

`init` asks where your stylesheet and import aliases live, writes
`components.json` recording those answers, creates a `cn` helper at your `utils`
alias, writes theme variables into your stylesheet, and installs `clsx` and
`tailwind-merge`. Pass `--yes` to accept every detected default without being
asked.

Every later `add` reads that config and rewrites imports to match your project's
aliases, so the files land where you already keep things.
````

- [ ] **Step 2: Add a changeset**

Run: `pnpm changeset`

Select `@nat-ui/cli`, choose **minor**, and use this summary:

```
Add the init command, which writes components.json, the cn utility, and theme variables, then installs clsx and tailwind-merge.
```

- [ ] **Step 3: Verify formatting**

Run: `pnpm format:check`
Expected: PASS. If it fails, run `pnpm format`.

- [ ] **Step 4: Commit**

```bash
git add README.md .changeset/
git commit -m "docs: describe what init does"
```

- [ ] **Step 5: Open the pull request**

```bash
git push -u origin HEAD
gh pr create --base main --title "Add the init command" --body "Implements docs/superpowers/specs/2026-08-03-init-command-design.md"
```

Expected: CI green on Node 22.13 and 24.

---

## Notes for the implementer

**Running a single test file:** `pnpm vitest run <path>`. The root `vitest.config.ts` already sets a 30 second timeout because these tests scaffold projects on disk.

**Why `resolveConfig` parses instead of casting:** `configSchema` is a `strictObject`, so an unexpected key throws rather than being silently dropped. Parsing also materializes defaults, which is deliberate — see the spec.

**Why I/O is injected into `init`:** the command touches the filesystem, spawns a package manager, and prompts. Passing those in as `InitIo` is what lets the tests in Task 8 run the real orchestration against a temp directory with a stubbed installer and scripted answers, without mocking modules.

**The `underSrc` heuristic in Task 8:** whether the utility belongs at `lib/utils.ts` or `src/lib/utils.ts` is inferred from whether the detected stylesheet lives under `src/`. This is a heuristic, and the honest limitation is that a project keeping its stylesheet outside `src` but its code inside would get it wrong. Reading `compilerOptions.paths` targets would be more precise and is a reasonable follow-up; it is out of scope here.
