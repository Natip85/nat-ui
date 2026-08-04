# Registry, `add`, and the first components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `nat-ui add button` work against a registry served from GitHub raw, and ship `button`, `input`, and `dialog` through it.

**Architecture:** Components are authored as real `.tsx` in `packages/registry` and compiled by a generator into self-contained JSON — metadata plus every file's text — committed under `r/` and served from GitHub raw. The CLI fetches one document per item, resolves `registryDependencies`, rewrites `@/*` imports to the consuming project's aliases, writes files, and installs the union of npm dependencies once. Every transform is a pure function over data; all I/O is injected into the command so no test touches the network or a real registry.

**Tech Stack:** TypeScript, Zod via `@nat-ui/schema`, React 19, Base UI (`@base-ui/react`), `class-variance-authority`, `lucide-react`, Tailwind CSS v4, Vitest with `happy-dom` and `@testing-library/react`.

**Design spec:** `docs/superpowers/specs/2026-08-04-registry-and-add-design.md`

## Global Constraints

- Node floor is `>=22.13`. Global `fetch` is available; no HTTP dependency.
- `@nat-ui/cli` ships with **no runtime dependencies**. Every dependency is a `devDependency` bundled by tsup via `noExternal`.
- Shared dependency versions live in the `catalog:` block of `pnpm-workspace.yaml`. Packages reference them as `"catalog:"`, never a literal range.
- Prettier config is `semi: false`, `singleQuote: true`, `bracketSpacing: false`, `trailingComma: "all"`, `printWidth: 100`, `tabWidth: 2`. Code must match or `pnpm format:check` fails in CI.
- ESLint runs `recommendedTypeChecked` and `stylisticTypeChecked`. Avoid `any` and unchecked assignments from untyped values; parse unknown JSON through a schema.
- `tsconfig.base.json` sets `verbatimModuleSyntax`, so type-only imports must use `import type` or inline `type`.
- `noUncheckedIndexedAccess` is on. Indexing an array yields `T | undefined` and must be narrowed.
- Tests live beside their source as `*.test.ts` (or `*.test.tsx` for component tests).
- CI runs `pnpm build` before `lint`, `typecheck`, and `test`, because packages resolve each other through their published `exports`.
- CI runs on Linux, Windows, and two Node versions. Anything touching paths or newlines must be platform-neutral: normalise with `toPosixPath` or an explicit `replace(/\r\n/g, '\n')`, never assume `/`.
- Everything the generator writes must be byte-identical on every platform, because CI compares its output against what is committed.
- User-facing CLI messages are plain ASCII sentences with no emoji, matching `init`.
- Commit after every task. Never commit with failing tests.

---

## File Structure

Created in `packages/schema/`:

| Path                    | Responsibility                                        |
| ----------------------- | ----------------------------------------------------- |
| `src/schema-version.ts` | `REGISTRY_SCHEMA_VERSION`, split out to break a cycle |

Modified: `src/registry-item.ts` (served payload schemas, name pattern), `src/index.ts`.

Created in `packages/registry/`:

| Path                        | Responsibility                              |
| --------------------------- | ------------------------------------------- |
| `src/ui/button.tsx`         | Button component and `buttonVariants`       |
| `src/ui/input.tsx`          | Input component                             |
| `src/ui/dialog.tsx`         | Dialog parts, shadcn-named                  |
| `scripts/build-registry.ts` | Item declarations plus sources → `r/*.json` |

Modified: `src/index.ts`, `package.json`, `tsconfig.json`.

Created in `packages/cli/`:

| Path                               | Responsibility                                       |
| ---------------------------------- | ---------------------------------------------------- |
| `src/registry/base-url.ts`         | Flag, environment variable, default                  |
| `src/registry/item-name.ts`        | Item name validation before it reaches a URL or path |
| `src/registry/fetch-item.ts`       | One HTTP GET, validated against the payload schema   |
| `src/registry/resolve-graph.ts`    | Transitive dependencies, dedupe, cycle detection     |
| `src/transform/rewrite-imports.ts` | `@/*` specifiers → the project's aliases             |
| `src/transform/use-client.ts`      | Strips the directive when `rsc` is false             |
| `src/config/read.ts`               | `components.json` → validated `Config`               |
| `src/paths/alias.ts`               | Alias plus tsconfig targets → a real directory       |
| `src/commands/add.ts`              | Orchestrates the flow; all I/O injected              |

Modified: `src/index.ts`, `src/commands/init.ts`, `src/prompts/ask.ts`, `src/theme/apply.ts`, `README.md`.

`paths/alias.ts` exists because `init` already encodes these rules as private helpers. Task 11 moves them rather than writing a second copy that can drift.

---

### Task 1: Served payload schemas

The authoring schemas describe what `packages/registry` declares. The served schemas describe what goes on the wire, which additionally carries each file's text and the contract version. This task adds the second set.

`REGISTRY_SCHEMA_VERSION` currently lives in `src/index.ts`, which re-exports `./registry-item`. Having `registry-item.ts` import the constant from `./index` would be a cycle, so the constant moves to its own module first.

**Files:**

- Create: `packages/schema/src/schema-version.ts`
- Modify: `packages/schema/src/index.ts`
- Modify: `packages/schema/src/registry-item.ts`
- Test: `packages/schema/src/registry-item.test.ts` (existing file, add to it)

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `REGISTRY_SCHEMA_VERSION: '1'` — unchanged value, new module, still exported from the package root
  - `REGISTRY_ITEM_NAME_PATTERN: RegExp`
  - `registryItemNameSchema: z.ZodString`
  - `registryItemFilePayloadSchema` / `type RegistryItemFilePayload = {path: string; type: RegistryItemFileType; content: string}`
  - `registryItemPayloadSchema` / `type RegistryItemPayload = {schemaVersion: '1'; name: string; type: RegistryItemType; dependencies?: string[]; registryDependencies?: string[]; files: RegistryItemFilePayload[]}`
  - `registryIndexSchema` / `type RegistryIndex = {schemaVersion: '1'; items: {name: string; type: RegistryItemType}[]}`

- [ ] **Step 1: Write the failing test**

Append to `packages/schema/src/registry-item.test.ts`:

```ts
describe('registryItemNameSchema', () => {
  test('accepts lowercase hyphenated names', () => {
    expect(registryItemNameSchema.safeParse('button').success).toBe(true)
    expect(registryItemNameSchema.safeParse('alert-dialog').success).toBe(true)
    expect(registryItemNameSchema.safeParse('h1').success).toBe(true)
  })

  test('rejects anything that could escape a URL or a path', () => {
    for (const name of ['', '..', '../etc', 'a/b', 'Button', 'a--b', '-a', 'a-', 'a b']) {
      expect(registryItemNameSchema.safeParse(name).success).toBe(false)
    }
  })
})

describe('registryItemPayloadSchema', () => {
  const payload = {
    schemaVersion: '1',
    name: 'button',
    type: 'ui',
    dependencies: ['@base-ui/react'],
    files: [{path: 'ui/button.tsx', type: 'ui', content: 'export const Button = () => null\n'}],
  }

  test('accepts a well-formed payload', () => {
    expect(registryItemPayloadSchema.safeParse(payload).success).toBe(true)
  })

  test('rejects a schema version it does not understand', () => {
    expect(registryItemPayloadSchema.safeParse({...payload, schemaVersion: '2'}).success).toBe(
      false,
    )
  })

  test('requires content on every file', () => {
    const withoutContent = {...payload, files: [{path: 'ui/button.tsx', type: 'ui'}]}

    expect(registryItemPayloadSchema.safeParse(withoutContent).success).toBe(false)
  })

  test('still rejects unsafe paths and unknown keys', () => {
    const escaping = {...payload, files: [{path: '../x.tsx', type: 'ui', content: ''}]}
    const absolute = {...payload, files: [{path: '/x.tsx', type: 'ui', content: ''}]}

    expect(registryItemPayloadSchema.safeParse(escaping).success).toBe(false)
    expect(registryItemPayloadSchema.safeParse(absolute).success).toBe(false)
    expect(registryItemPayloadSchema.safeParse({...payload, extra: 1}).success).toBe(false)
  })

  test('rejects a name the pattern forbids', () => {
    expect(registryItemPayloadSchema.safeParse({...payload, name: '../evil'}).success).toBe(false)
  })
})

describe('registryIndexSchema', () => {
  test('accepts an index and rejects a bad entry', () => {
    const index = {schemaVersion: '1', items: [{name: 'button', type: 'ui'}]}

    expect(registryIndexSchema.safeParse(index).success).toBe(true)
    expect(
      registryIndexSchema.safeParse({schemaVersion: '1', items: [{name: 'button'}]}).success,
    ).toBe(false)
  })
})
```

Extend the file's existing import to include the new names:

```ts
import {
  registryIndexSchema,
  registryItemNameSchema,
  registryItemPayloadSchema,
  registryItemSchema,
} from './registry-item'
```

Keep whatever else that import already pulls in.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/schema/src/registry-item.test.ts`
Expected: FAIL — the new exports do not exist.

- [ ] **Step 3: Move the version constant**

Create `packages/schema/src/schema-version.ts`:

```ts
/**
 * Version of the registry JSON contract itself, not of any package. The CLI
 * checks this when fetching an item so an old CLI can refuse a payload it
 * cannot understand rather than writing corrupt files into someone's project.
 *
 * This lives apart from `index.ts` so `registry-item.ts` can read it without
 * importing the barrel that re-exports `registry-item.ts` back.
 */
export const REGISTRY_SCHEMA_VERSION = '1' as const

export type RegistrySchemaVersion = typeof REGISTRY_SCHEMA_VERSION
```

Replace the top of `packages/schema/src/index.ts` so it re-exports rather than declares, leaving the package's public surface unchanged:

```ts
export * from './schema-version'
export * from './config'
export * from './registry-item'
```

- [ ] **Step 4: Add the served schemas**

Append to `packages/schema/src/registry-item.ts`, and add `import {REGISTRY_SCHEMA_VERSION} from './schema-version'` at the top:

```ts
/**
 * An item name reaches both a URL and a filesystem path, so it is constrained
 * to a shape that cannot traverse either. This is a guard, not a style rule.
 */
export const REGISTRY_ITEM_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const registryItemNameSchema = z.string().regex(REGISTRY_ITEM_NAME_PATTERN, {
  error: 'must be lowercase words separated by single hyphens',
})

/**
 * What the registry serves, as opposed to what it declares. The authoring
 * schemas above describe files that exist on disk next to their declaration;
 * these describe the same files travelling over a network, so they carry their
 * own text and the version of the contract they were written against.
 */
export const registryItemFilePayloadSchema = registryItemFileSchema.extend({
  content: z.string(),
})
export type RegistryItemFilePayload = z.infer<typeof registryItemFilePayloadSchema>

export const registryItemPayloadSchema = registryItemSchema.extend({
  schemaVersion: z.literal(REGISTRY_SCHEMA_VERSION),
  name: registryItemNameSchema,
  files: z.array(registryItemFilePayloadSchema).min(1),
})
export type RegistryItemPayload = z.infer<typeof registryItemPayloadSchema>

export const registryIndexEntrySchema = z.strictObject({
  name: registryItemNameSchema,
  type: registryItemTypeSchema,
})
export type RegistryIndexEntry = z.infer<typeof registryIndexEntrySchema>

export const registryIndexSchema = z.strictObject({
  schemaVersion: z.literal(REGISTRY_SCHEMA_VERSION),
  items: z.array(registryIndexEntrySchema),
})
export type RegistryIndex = z.infer<typeof registryIndexSchema>
```

- [ ] **Step 5: Run tests and the full check**

Run: `pnpm vitest run packages/schema`
Expected: PASS.

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all pass. `packages/registry` imports `REGISTRY_SCHEMA_VERSION` from the package root and must still resolve it.

- [ ] **Step 6: Commit**

```bash
git add packages/schema
git commit -m "feat(schema): describe what the registry serves, not just what it declares"
```

---

### Task 2: Map theme tokens into Tailwind's design system

`init` writes `:root { --primary: ... }` and `.dark { ... }`, but Tailwind v4 builds utilities from `@theme` variables. Without a mapping there is no `--color-primary`, so `bg-primary`, `border-input`, and `ring-ring` are not utilities at all and a component styled against them renders unstyled. The first component exposed this; it has to be fixed before any component can be styled.

The fix is Tailwind's documented `@theme inline` form, which points design tokens at variables defined elsewhere so the `.dark` override keeps working.

This is additive. Every existing assertion in `apply.test.ts` uses `toContain`, so none of them break.

**Files:**

- Modify: `packages/cli/src/theme/apply.ts`
- Test: `packages/cli/src/theme/apply.test.ts` (existing file, add to it)

**Interfaces:**

- Consumes: `THEME_TOKENS` from `../theme/presets` (already exported).
- Produces: no new exports. `applyTheme` keeps its signature; the block it writes gains an `@theme inline` section between the `.dark` rule and `THEME_END`.

- [ ] **Step 1: Write the failing test**

Append to `packages/cli/src/theme/apply.test.ts`:

```ts
describe('tailwind theme mapping', () => {
  test('maps every colour token into the design system', () => {
    const result = applyTheme(withImport, PRESETS.neutral)

    expect(result).toContain('@theme inline {')
    expect(result).toContain('--color-background: var(--background);')
    expect(result).toContain('--color-primary: var(--primary);')
    expect(result).toContain('--color-destructive-foreground: var(--destructive-foreground);')
    expect(result).toContain('--color-ring: var(--ring);')
  })

  test('turns the radius token into a scale rather than a colour', () => {
    const result = applyTheme(withImport, PRESETS.neutral)

    expect(result).toContain('--radius-lg: var(--radius);')
    expect(result).toContain('--radius-md: calc(var(--radius) - 2px);')
    expect(result).not.toContain('--color-radius')
  })

  test('keeps the mapping inside the marked block so a re-run replaces it', () => {
    const once = applyTheme(withImport, PRESETS.neutral)
    const twice = applyTheme(once, PRESETS.slate)

    expect(countOf(twice, '@theme inline {')).toBe(1)
    expect(twice.indexOf('@theme inline {')).toBeLessThan(twice.indexOf(THEME_END))
  })
})
```

This reuses `withImport`, `countOf`, and `PRESETS` already present in that file. If `withImport` is defined inside another `describe`, hoist it to module scope rather than duplicating it.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/theme/apply.test.ts`
Expected: FAIL — `@theme inline {` is not in the output.

- [ ] **Step 3: Emit the mapping**

In `packages/cli/src/theme/apply.ts`, change the presets import to bring in the token list as a value:

```ts
import {THEME_TOKENS, type ThemePreset} from './presets'
```

Add above `block`:

```ts
// `--radius` is a length, not a colour, and Tailwind spells its scale
// differently, so it is mapped by hand below rather than in this loop.
const COLOR_TOKENS = THEME_TOKENS.filter((token) => token !== '--radius')

/**
 * Tailwind v4 builds utilities from `@theme` variables, so the raw tokens above
 * produce no `bg-primary` on their own. The `inline` form points a design token
 * at a variable defined elsewhere, which is what keeps the `.dark` override
 * working: the utility resolves through `var(--primary)` at use time instead of
 * being frozen to the light value.
 */
const mapping = (): string =>
  [
    ...COLOR_TOKENS.map((token) => `  --color-${token.slice('--'.length)}: var(${token});`),
    '  --radius-sm: calc(var(--radius) - 4px);',
    '  --radius-md: calc(var(--radius) - 2px);',
    '  --radius-lg: var(--radius);',
    '  --radius-xl: calc(var(--radius) + 4px);',
  ].join('\n')
```

Then extend `block` so the mapping sits inside the markers, before `THEME_END`:

```ts
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
    '',
    '@theme inline {',
    mapping(),
    '}',
    THEME_END,
  ].join('\n')
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/cli`
Expected: PASS, including every pre-existing theme and init test. The mapping is inside the markers, so replacement and CRLF handling are unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/theme
git commit -m "fix(cli): map theme tokens into Tailwind's design system

Raw custom properties produce no utilities in Tailwind v4, so a component
styled with bg-primary rendered unstyled."
```

---

### Task 3: Button, plus the React and DOM test tooling

This is the first React code and the first DOM test in the repository, so the tooling lands here rather than in a task of its own — it has no independently testable deliverable without a component to prove it on.

**A layout decision that matters.** The spec sketched `packages/registry/src/ui/button.tsx`, but components are authored against `@/components/ui/...` and `@/lib/utils`, and the registry's own tsconfig maps `@/*` to `./src/*`. Authoring under `src/ui/` would mean those imports do not resolve inside the registry package, so typechecking would not actually validate what ships. Mirroring a consumer project's layout instead — `src/components/ui/button.tsx` and `src/lib/utils.ts` — makes every authored import resolve identically here and in someone else's project.

`src/lib/utils.ts` is a local stand-in for the file `init` writes. It is never shipped by any item; it exists so the components compile.

**Files:**

- Create: `packages/registry/src/lib/utils.ts`
- Create: `packages/registry/src/components/ui/button.tsx`
- Create: `packages/registry/src/components/ui/button.test.tsx`
- Modify: `packages/registry/package.json`
- Modify: `pnpm-workspace.yaml`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:
  - `buttonVariants(options?: {variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'; size?: 'sm' | 'default' | 'lg' | 'icon'; className?: string}): string`
  - `Button(props: ButtonProps): JSX.Element`
  - `type ButtonProps = Omit<ComponentProps<typeof BaseButton>, 'className'> & VariantProps<typeof buttonVariants> & {className?: string}`
  - Task 5 imports `buttonVariants` from `@/components/ui/button`.

- [ ] **Step 1: Add the dependencies**

Add to the `catalog:` block of `pnpm-workspace.yaml`, keeping it alphabetically ordered like the entries already there:

```yaml
'@base-ui/react': ^1.7.0
'@testing-library/dom': ^10.4.1
'@testing-library/react': ^16.3.2
'@types/react': ^19.2.18
'@types/react-dom': ^19.2.4
'class-variance-authority': ^0.7.1
clsx: ^2.1.1
happy-dom: ^20.11.1
'lucide-react': ^1.28.0
react: ^19.2.8
'react-dom': ^19.2.8
'tailwind-merge': ^3.6.0
```

Replace the `devDependencies` block of `packages/registry/package.json` with:

```json
  "devDependencies": {
    "@base-ui/react": "catalog:",
    "@testing-library/dom": "catalog:",
    "@testing-library/react": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "class-variance-authority": "catalog:",
    "clsx": "catalog:",
    "happy-dom": "catalog:",
    "lucide-react": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:",
    "tailwind-merge": "catalog:",
    "tsx": "catalog:",
    "typescript": "catalog:"
  }
```

Run: `pnpm install`
Expected: succeeds; `packages/registry/node_modules` gains React and Base UI.

- [ ] **Step 2: Write the failing test**

Create `packages/registry/src/components/ui/button.test.tsx`:

```tsx
// @vitest-environment happy-dom
import {cleanup, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, test} from 'vitest'
import {Button, buttonVariants} from './button'

afterEach(cleanup)

describe('buttonVariants', () => {
  test('defaults to the primary variant at the default size', () => {
    const classes = buttonVariants()

    expect(classes).toContain('bg-primary')
    expect(classes).toContain('h-9')
  })

  test('selects the variant and size asked for', () => {
    expect(buttonVariants({variant: 'ghost'})).toContain('hover:bg-accent')
    expect(buttonVariants({variant: 'destructive'})).toContain('bg-destructive')
    expect(buttonVariants({variant: 'link'})).toContain('underline-offset-4')
    expect(buttonVariants({size: 'icon'})).toContain('size-9')
  })

  test('appends caller classes so they can override', () => {
    expect(buttonVariants({className: 'w-full'})).toContain('w-full')
  })
})

describe('Button', () => {
  test('renders a native button carrying its variant classes', () => {
    render(
      <Button variant='destructive' size='lg'>
        Delete
      </Button>,
    )

    const button = screen.getByRole('button', {name: 'Delete'})

    expect(button.tagName).toBe('BUTTON')
    expect(button.className).toContain('bg-destructive')
    expect(button.className).toContain('h-10')
  })

  test('renders as a different element through the render prop', () => {
    render(
      <Button render={<span />} nativeButton={false}>
        Not a button
      </Button>,
    )

    const button = screen.getByRole('button', {name: 'Not a button'})

    expect(button.tagName).toBe('SPAN')
  })

  test('marks itself disabled for assistive technology', () => {
    render(<Button disabled>Off</Button>)

    const button = screen.getByRole('button', {name: 'Off'})

    expect(button).toHaveProperty('disabled', true)
    expect(button.getAttribute('data-disabled')).not.toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run packages/registry`
Expected: FAIL — `./button` does not exist.

- [ ] **Step 4: Write the local `cn` stand-in**

Create `packages/registry/src/lib/utils.ts`. This mirrors what `nat-ui init` writes into a consumer project, so components can be authored against the same import they will have once installed:

```ts
import {type ClassValue, clsx} from 'clsx'
import {twMerge} from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 5: Write the button**

Create `packages/registry/src/components/ui/button.tsx`:

```tsx
import {Button as BaseButton} from '@base-ui/react/button'
import {cva, type VariantProps} from 'class-variance-authority'
import type {ComponentProps} from 'react'
import {cn} from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 rounded-md px-3 text-xs',
        default: 'h-9 px-4 py-2',
        lg: 'h-10 rounded-md px-8',
        icon: 'size-9',
      },
    },
    defaultVariants: {variant: 'default', size: 'default'},
  },
)

/**
 * `className` is narrowed to a string. Base UI also accepts a function of the
 * component's state there, but `cn` composes strings, and no variant here needs
 * state to decide its classes.
 */
export type ButtonProps = Omit<ComponentProps<typeof BaseButton>, 'className'> &
  VariantProps<typeof buttonVariants> & {className?: string}

export function Button({className, variant, size, ...props}: ButtonProps) {
  return <BaseButton className={cn(buttonVariants({variant, size, className}))} {...props} />
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run packages/registry`
Expected: PASS, 6 tests.

If the docblock environment is not honoured and `document is not defined` appears, the file-level comment must be the very first line of the file — Vitest matches `@vitest-environment` anywhere in the source, but keeping it first is the documented form.

- [ ] **Step 7: Verify the whole pipeline**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`
Expected: all pass. `pnpm lint` must report on the new `.tsx` files rather than skipping them — typescript-eslint's shared configs already match `**/*.tsx`, so no ESLint change should be needed. If the new files are silently skipped, add `'**/*.tsx'` to the `files` of the main config block in `eslint.config.ts`.

- [ ] **Step 8: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml packages/registry
git commit -m "feat(registry): add the button component"
```

---

### Task 4: Input

**Files:**

- Create: `packages/registry/src/components/ui/input.tsx`
- Create: `packages/registry/src/components/ui/input.test.tsx`

**Interfaces:**

- Consumes: `cn` from `@/lib/utils` (Task 3).
- Produces:
  - `Input(props: InputProps): JSX.Element`
  - `type InputProps = Omit<ComponentProps<typeof BaseInput>, 'className'> & {className?: string}`

- [ ] **Step 1: Write the failing test**

Create `packages/registry/src/components/ui/input.test.tsx`:

```tsx
// @vitest-environment happy-dom
import {cleanup, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, test} from 'vitest'
import {Input} from './input'

afterEach(cleanup)

describe('Input', () => {
  test('renders a text box with its base classes', () => {
    render(<Input placeholder='Email' />)

    const input = screen.getByPlaceholderText('Email')

    expect(input.tagName).toBe('INPUT')
    expect(input.className).toContain('border-input')
    expect(input.className).toContain('h-9')
  })

  test('reflects the disabled state', () => {
    render(<Input placeholder='Email' disabled />)

    expect(screen.getByPlaceholderText('Email')).toHaveProperty('disabled', true)
  })

  test('passes through the value and type', () => {
    render(<Input type='email' defaultValue='a@b.c' placeholder='Email' />)

    const input = screen.getByPlaceholderText('Email')

    expect(input.getAttribute('type')).toBe('email')
    expect(input).toHaveProperty('value', 'a@b.c')
  })

  test('keeps caller classes alongside its own', () => {
    render(<Input placeholder='Email' className='w-64' />)

    expect(screen.getByPlaceholderText('Email').className).toContain('w-64')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/registry/src/components/ui/input.test.tsx`
Expected: FAIL — `./input` does not exist.

- [ ] **Step 3: Write the input**

Create `packages/registry/src/components/ui/input.tsx`:

```tsx
import {Input as BaseInput} from '@base-ui/react/input'
import type {ComponentProps} from 'react'
import {cn} from '@/lib/utils'

export type InputProps = Omit<ComponentProps<typeof BaseInput>, 'className'> & {
  className?: string
}

/**
 * Base UI's input rather than a bare element, so that nesting it in a
 * `Field.Root` later wires up validation state and labelling with no change
 * here. The `data-[invalid]` styles are what that state drives.
 */
export function Input({className, ...props}: InputProps) {
  return (
    <BaseInput
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[invalid]:border-destructive data-[invalid]:ring-destructive',
        className,
      )}
      {...props}
    />
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/registry`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/registry/src/components/ui/input.tsx packages/registry/src/components/ui/input.test.tsx
git commit -m "feat(registry): add the input component"
```

---

### Task 5: Dialog

Exported names follow shadcn's vocabulary, mapping onto Base UI's parts: `DialogOverlay` is `Dialog.Backdrop` and `DialogContent` wraps `Dialog.Portal`, the overlay, `Dialog.Viewport`, and `Dialog.Popup` into the single element shadcn users expect. `Dialog.Viewport` is the positioning container in Base UI's anatomy and is kept as an internal detail.

This item is the reason the registry needs cross-item dependencies: its close affordance is styled with `buttonVariants`, so it imports from `@/components/ui/button`.

**Files:**

- Create: `packages/registry/src/components/ui/dialog.tsx`
- Create: `packages/registry/src/components/ui/dialog.test.tsx`

**Interfaces:**

- Consumes: `buttonVariants` from `@/components/ui/button` (Task 3), `cn` from `@/lib/utils`.
- Produces: `Dialog`, `DialogTrigger`, `DialogPortal`, `DialogClose`, `DialogOverlay`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`.

- [ ] **Step 1: Write the failing test**

Create `packages/registry/src/components/ui/dialog.test.tsx`:

```tsx
// @vitest-environment happy-dom
import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, test} from 'vitest'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog'

afterEach(cleanup)

const example = (props: {defaultOpen?: boolean; showCloseButton?: boolean} = {}) => (
  <Dialog defaultOpen={props.defaultOpen}>
    <DialogTrigger>Open</DialogTrigger>
    <DialogContent showCloseButton={props.showCloseButton}>
      <DialogHeader>
        <DialogTitle>Delete project</DialogTitle>
        <DialogDescription>This cannot be undone.</DialogDescription>
      </DialogHeader>
      <DialogFooter>Footer</DialogFooter>
    </DialogContent>
  </Dialog>
)

describe('Dialog', () => {
  test('stays closed until the trigger is pressed', () => {
    render(example())

    expect(screen.queryByText('Delete project')).toBeNull()

    fireEvent.click(screen.getByRole('button', {name: 'Open'}))

    expect(screen.getByText('Delete project')).not.toBeNull()
    expect(screen.getByText('This cannot be undone.')).not.toBeNull()
  })

  test('labels itself with its title', () => {
    render(example({defaultOpen: true}))

    const dialog = screen.getByRole('dialog')

    expect(dialog.getAttribute('aria-labelledby')).not.toBeNull()
    expect(dialog.getAttribute('aria-describedby')).not.toBeNull()
  })

  test('offers a close control styled as a ghost icon button', () => {
    render(example({defaultOpen: true}))

    const close = screen.getByRole('button', {name: 'Close'})

    expect(close.className).toContain('hover:bg-accent')
  })

  test('omits the close control when asked', () => {
    render(example({defaultOpen: true, showCloseButton: false}))

    expect(screen.queryByRole('button', {name: 'Close'})).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/registry/src/components/ui/dialog.test.tsx`
Expected: FAIL — `./dialog` does not exist.

- [ ] **Step 3: Write the dialog**

Create `packages/registry/src/components/ui/dialog.tsx`:

```tsx
'use client'

import {Dialog as BaseDialog} from '@base-ui/react/dialog'
import {XIcon} from 'lucide-react'
import type {ComponentProps} from 'react'
import {buttonVariants} from '@/components/ui/button'
import {cn} from '@/lib/utils'

export const Dialog = BaseDialog.Root
export const DialogTrigger = BaseDialog.Trigger
export const DialogPortal = BaseDialog.Portal
export const DialogClose = BaseDialog.Close

type Styleable<T> = Omit<T, 'className'> & {className?: string}

export function DialogOverlay({
  className,
  ...props
}: Styleable<ComponentProps<typeof BaseDialog.Backdrop>>) {
  return (
    <BaseDialog.Backdrop
      className={cn(
        'fixed inset-0 z-50 bg-black/50 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
        className,
      )}
      {...props}
    />
  )
}

export type DialogContentProps = Styleable<ComponentProps<typeof BaseDialog.Popup>> & {
  showCloseButton?: boolean
}

/**
 * Portal, overlay, viewport, and popup in one element, which is the shape
 * people expect from `DialogContent`. `Dialog.Viewport` is Base UI's
 * positioning container and stays an internal detail.
 */
export function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <BaseDialog.Viewport className='fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4'>
        <BaseDialog.Popup
          className={cn(
            'relative w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg transition-all duration-200 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton ? (
            <BaseDialog.Close
              aria-label='Close'
              className={cn(
                buttonVariants({variant: 'ghost', size: 'icon'}),
                'absolute right-3 top-3 size-7',
              )}
            >
              <XIcon />
            </BaseDialog.Close>
          ) : null}
        </BaseDialog.Popup>
      </BaseDialog.Viewport>
    </DialogPortal>
  )
}

export function DialogHeader({className, ...props}: ComponentProps<'div'>) {
  return (
    <div className={cn('flex flex-col gap-1.5 text-center sm:text-left', className)} {...props} />
  )
}

export function DialogFooter({className, ...props}: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  )
}

export function DialogTitle({
  className,
  ...props
}: Styleable<ComponentProps<typeof BaseDialog.Title>>) {
  return (
    <BaseDialog.Title
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: Styleable<ComponentProps<typeof BaseDialog.Description>>) {
  return (
    <BaseDialog.Description className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/registry`
Expected: PASS, 14 tests.

If `getByRole('dialog')` finds nothing, the popup is rendering into a portal outside the container Testing Library queries — `screen` queries `document.body`, which is where Base UI's portal mounts by default, so this should resolve without configuration.

- [ ] **Step 5: Verify the whole pipeline**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/registry/src/components/ui/dialog.tsx packages/registry/src/components/ui/dialog.test.tsx
git commit -m "feat(registry): add the dialog component"
```

---

### Task 6: Declare the items and generate the registry

The generator is split into pure functions plus a thin `main`, so everything interesting is tested without touching disk.

It enforces two invariants the CLI depends on. Only `ui` items and files may be served, because `add` refuses anything else. And every `@/` import in a component must be one of the two shapes the rewriter understands, so the repository cannot ship a component whose imports would survive unrewritten into someone's project.

**Files:**

- Modify: `packages/registry/src/index.ts`
- Create: `packages/registry/scripts/build-registry.ts`
- Create: `packages/registry/scripts/build-registry.test.ts`

**Interfaces:**

- Consumes: `RegistryItem`, `RegistryItemPayload`, `RegistryIndex`, `registryItemPayloadSchema`, `registryIndexSchema`, `REGISTRY_SCHEMA_VERSION` from `@nat-ui/schema` (Task 1).
- Produces:
  - `items: readonly RegistryItem[]` from `packages/registry/src/index.ts`
  - `normalizeNewlines(text: string): string`
  - `importSpecifiers(source: string): string[]`
  - `unsupportedAliasImports(source: string): string[]`
  - `toPayload(item: RegistryItem, read: (path: string) => string): RegistryItemPayload`
  - `toIndex(items: readonly RegistryItem[]): RegistryIndex`
  - `serialize(value: unknown): string`
  - On disk: `r/button.json`, `r/dialog.json`, `r/input.json`, `r/index.json`

- [ ] **Step 1: Write the failing test**

Create `packages/registry/scripts/build-registry.test.ts`:

```ts
import type {RegistryItem} from '@nat-ui/schema'
import {describe, expect, test} from 'vitest'
import {
  importSpecifiers,
  normalizeNewlines,
  serialize,
  toIndex,
  toPayload,
  unsupportedAliasImports,
} from './build-registry'

const button: RegistryItem = {
  name: 'button',
  type: 'ui',
  dependencies: ['@base-ui/react'],
  files: [{path: 'components/ui/button.tsx', type: 'ui'}],
}

const reading =
  (contents: string) =>
  (_path: string): string =>
    contents

describe('normalizeNewlines', () => {
  test('turns CRLF into LF so output is identical on every platform', () => {
    expect(normalizeNewlines('a\r\nb\r\n')).toBe('a\nb\n')
    expect(normalizeNewlines('a\nb\n')).toBe('a\nb\n')
  })
})

describe('importSpecifiers', () => {
  test('finds import, side-effect import, and re-export specifiers', () => {
    const source = [
      "import {cn} from '@/lib/utils'",
      "import '@/styles.css'",
      "export {x} from './x'",
      'const notAnImport = "@/lib/nope"',
    ].join('\n')

    const found = importSpecifiers(source)

    expect(found).toContain('@/lib/utils')
    expect(found).toContain('@/styles.css')
    expect(found).toContain('./x')
    expect(found).not.toContain('@/lib/nope')
  })
})

describe('unsupportedAliasImports', () => {
  test('accepts the shapes the CLI can rewrite', () => {
    const source = [
      "import {cn} from '@/lib/utils'",
      "import {buttonVariants} from '@/components/ui/button'",
      "import {Dialog} from '@base-ui/react/dialog'",
    ].join('\n')

    expect(unsupportedAliasImports(source)).toEqual([])
  })

  test('reports an alias import the CLI would leave broken', () => {
    const source = "import {thing} from '@/hooks/use-thing'"

    expect(unsupportedAliasImports(source)).toEqual(['@/hooks/use-thing'])
  })
})

describe('toPayload', () => {
  test('embeds the file contents and the schema version', () => {
    const payload = toPayload(button, reading("import {cn} from '@/lib/utils'\n"))

    expect(payload.schemaVersion).toBe('1')
    expect(payload.name).toBe('button')
    expect(payload.files[0]?.content).toBe("import {cn} from '@/lib/utils'\n")
  })

  test('normalises newlines in embedded content', () => {
    const payload = toPayload(button, reading('a\r\nb\r\n'))

    expect(payload.files[0]?.content).toBe('a\nb\n')
  })

  test('refuses an item the CLI could not install', () => {
    const asLib: RegistryItem = {...button, type: 'lib'}
    const fileAsLib: RegistryItem = {
      ...button,
      files: [{path: 'lib/thing.ts', type: 'lib'}],
    }

    expect(() => toPayload(asLib, reading(''))).toThrow(/only "ui"/)
    expect(() => toPayload(fileAsLib, reading(''))).toThrow(/only "ui"/)
  })

  test('refuses an import the rewriter does not understand', () => {
    expect(() => toPayload(button, reading("import x from '@/hooks/use-x'\n"))).toThrow(
      /@\/hooks\/use-x/,
    )
  })
})

describe('toIndex', () => {
  test('lists every item sorted by name', () => {
    const index = toIndex([
      {...button, name: 'input'},
      {...button, name: 'button'},
      {...button, name: 'dialog'},
    ])

    expect(index.items.map((entry) => entry.name)).toEqual(['button', 'dialog', 'input'])
    expect(index.schemaVersion).toBe('1')
  })
})

describe('serialize', () => {
  test('writes two-space JSON with a trailing newline', () => {
    expect(serialize({a: 1})).toBe('{\n  "a": 1\n}\n')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/registry/scripts/build-registry.test.ts`
Expected: FAIL — `./build-registry` does not exist.

- [ ] **Step 3: Declare the items**

Replace `packages/registry/src/index.ts`:

```ts
import {REGISTRY_SCHEMA_VERSION, type RegistryItem} from '@nat-ui/schema'

/**
 * Component sources live under `src/` and are authored against the `@/*` alias.
 * The CLI rewrites that alias to whatever the consuming project configured, so
 * these files are never imported directly from here.
 *
 * `path` is relative to `src/`. Only its basename decides the filename in a
 * consuming project; the directory part is this repository's structure.
 */
export const items: readonly RegistryItem[] = [
  {
    name: 'button',
    type: 'ui',
    dependencies: ['@base-ui/react', 'class-variance-authority'],
    files: [{path: 'components/ui/button.tsx', type: 'ui'}],
  },
  {
    name: 'dialog',
    type: 'ui',
    dependencies: ['@base-ui/react', 'lucide-react'],
    registryDependencies: ['button'],
    files: [{path: 'components/ui/dialog.tsx', type: 'ui'}],
  },
  {
    name: 'input',
    type: 'ui',
    dependencies: ['@base-ui/react'],
    files: [{path: 'components/ui/input.tsx', type: 'ui'}],
  },
]

export const registry = {schemaVersion: REGISTRY_SCHEMA_VERSION, items} as const
```

- [ ] **Step 4: Write the generator**

Create `packages/registry/scripts/build-registry.ts`:

```ts
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {
  REGISTRY_SCHEMA_VERSION,
  type RegistryIndex,
  type RegistryItem,
  type RegistryItemPayload,
  registryIndexSchema,
  registryItemPayloadSchema,
} from '@nat-ui/schema'
import {items} from '../src/index'

/**
 * Everything emitted here is compared byte-for-byte against what is committed,
 * so a Windows checkout must not produce different bytes to a Linux one.
 */
export const normalizeNewlines = (text: string): string => text.replace(/\r\n/g, '\n')

const SPECIFIER = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g

export const importSpecifiers = (source: string): string[] => {
  const found: string[] = []
  for (const match of source.matchAll(SPECIFIER)) {
    const value = match[1] ?? match[2]
    if (value !== undefined) found.push(value)
  }

  return found
}

/** The two shapes `add` knows how to rewrite. Anything else would ship broken. */
const SUPPORTED_ALIAS = /^@\/(?:lib\/utils|components\/ui\/[a-z0-9-]+)$/

export const unsupportedAliasImports = (source: string): string[] =>
  importSpecifiers(source).filter(
    (specifier) => specifier.startsWith('@/') && !SUPPORTED_ALIAS.test(specifier),
  )

export const toPayload = (
  item: RegistryItem,
  read: (path: string) => string,
): RegistryItemPayload => {
  if (item.type !== 'ui') {
    throw new Error(`Item "${item.name}" is type "${item.type}", but only "ui" can be installed.`)
  }

  const files = item.files.map((file) => {
    if (file.type !== 'ui') {
      throw new Error(
        `File "${file.path}" in "${item.name}" is type "${file.type}", but only "ui" can be installed.`,
      )
    }

    const content = normalizeNewlines(read(file.path))
    const unsupported = unsupportedAliasImports(content)
    if (unsupported.length > 0) {
      throw new Error(
        `File "${file.path}" imports ${unsupported.join(', ')}, which the CLI cannot rewrite.`,
      )
    }

    return {...file, content}
  })

  return registryItemPayloadSchema.parse({schemaVersion: REGISTRY_SCHEMA_VERSION, ...item, files})
}

// Sorted by code unit rather than locale, so the order cannot vary by machine.
const byName = (a: {name: string}, b: {name: string}): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0

export const toIndex = (all: readonly RegistryItem[]): RegistryIndex =>
  registryIndexSchema.parse({
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    items: all.map(({name, type}) => ({name, type})).sort(byName),
  })

export const serialize = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

const main = async (): Promise<void> => {
  const here = dirname(fileURLToPath(import.meta.url))
  const packageRoot = join(here, '..')
  const sourceRoot = join(packageRoot, 'src')
  const outputDir = join(packageRoot, '..', '..', 'r')

  const contents = new Map<string, string>()
  for (const item of items) {
    for (const file of item.files) {
      contents.set(file.path, await readFile(join(sourceRoot, file.path), 'utf8'))
    }
  }

  const read = (path: string): string => {
    const content = contents.get(path)
    if (content === undefined) throw new Error(`No source was read for "${path}".`)

    return content
  }

  const payloads = [...items].sort(byName).map((item) => toPayload(item, read))

  // Removed rather than overwritten, so deleting an item also deletes its
  // document instead of leaving a file nothing points at.
  await rm(outputDir, {recursive: true, force: true})
  await mkdir(outputDir, {recursive: true})

  for (const payload of payloads) {
    await writeFile(join(outputDir, `${payload.name}.json`), serialize(payload))
  }
  await writeFile(join(outputDir, 'index.json'), serialize(toIndex(items)))

  console.log(`Wrote ${String(payloads.length)} registry item(s) to r/.`)
}

// Only run when invoked as a script, so the tests above can import the pure
// functions without generating anything.
if (
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
) {
  await main()
}
```

The entry-point guard mirrors `packages/cli/src/is-entry-point.ts`. If it proves unreliable when run through `tsx`, replace the condition with `import.meta.url === pathToFileURL(process.argv[1] ?? '').href` and import `pathToFileURL` from `node:url`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/registry/scripts/build-registry.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Generate the registry for the first time**

Run: `pnpm --filter @nat-ui/registry exec tsx scripts/build-registry.ts`
Expected: `Wrote 3 registry item(s) to r/.`

Run: `ls r && node -e "const i=require('./r/button.json');console.log(i.name,i.files[0].path,i.files[0].content.length>0)"`
Expected: `button.json dialog.json index.json input.json`, then `button components/ui/button.tsx true`.

- [ ] **Step 7: Commit**

```bash
git add packages/registry r
git commit -m "feat(registry): generate self-contained registry documents"
```

---

### Task 7: Wire the generator into the build and guard it in CI

Committing generated output is only safe if it cannot go stale. CI already runs `pnpm build`; making the generator part of that build means a drift check is one `git diff` away.

**Files:**

- Modify: `packages/registry/package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.prettierignore`

**Interfaces:**

- Consumes: the generator from Task 6.
- Produces: `pnpm build` regenerates `r/`; CI fails when the result differs from what is committed.

- [ ] **Step 1: Add the build script**

In `packages/registry/package.json`, replace the `scripts` block:

```json
  "scripts": {
    "build": "tsx scripts/build-registry.ts",
    "typecheck": "tsc --noEmit"
  },
```

`pnpm --recursive build` orders packages by workspace dependency, and `@nat-ui/registry` depends on `@nat-ui/schema`, so the schema is built first and its declarations exist.

- [ ] **Step 2: Verify the build regenerates cleanly**

Run: `pnpm build && git status --porcelain -- r`
Expected: the build reports `Wrote 3 registry item(s) to r/.` and `git status` prints nothing, proving the committed output already matches.

- [ ] **Step 3: Prove the guard catches drift**

Run:

```bash
printf '\n' >> r/button.json && git diff --exit-code -- r; echo "exit=$?"
```

Expected: a diff is printed and `exit=1`.

Then restore it:

```bash
git checkout -- r && git diff --exit-code -- r; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 4: Add the CI step**

In `.github/workflows/ci.yml`, in the `verify` job, insert a step immediately after the existing `- run: pnpm build` step and before `- run: pnpm format:check`:

```yaml
# r/ is generated by the build above and committed so GitHub raw can serve
# it. Regenerating and finding a diff means someone changed a component
# without rebuilding, which would leave the published registry describing
# code that no longer exists.
- run: git diff --exit-code -- r
```

- [ ] **Step 5: Keep Prettier off the generated output**

The generator writes two-space JSON with a trailing newline, which matches Prettier's own JSON style, but the embedded `content` strings are long single lines and there is no reason to let a formatter and a generator both claim ownership of these files. Append to `.prettierignore`:

```
r/
```

Run: `pnpm format:check`
Expected: PASS.

- [ ] **Step 6: Verify the whole pipeline**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && git status --porcelain`
Expected: all pass and a clean tree.

- [ ] **Step 7: Commit**

```bash
git add packages/registry/package.json .github/workflows/ci.yml .prettierignore
git commit -m "ci: regenerate the registry in the build and fail on drift"
```

---

### Task 8: The registry client

Three small pieces: where the registry lives, whether a name is safe to put in a URL, and fetching one document.

**Files:**

- Create: `packages/cli/src/registry/base-url.ts`
- Create: `packages/cli/src/registry/base-url.test.ts`
- Create: `packages/cli/src/registry/item-name.ts`
- Create: `packages/cli/src/registry/item-name.test.ts`
- Create: `packages/cli/src/registry/fetch-item.ts`
- Create: `packages/cli/src/registry/fetch-item.test.ts`

**Interfaces:**

- Consumes: `registryItemPayloadSchema`, `registryIndexSchema`, `registryItemNameSchema`, `RegistryItemPayload`, `RegistryIndex` from `@nat-ui/schema` (Task 1).
- Produces:
  - `DEFAULT_REGISTRY_URL: string`
  - `resolveBaseUrl(flag: string | undefined, env: NodeJS.ProcessEnv): string`
  - `assertValidItemName(name: string): void` — throws on anything unsafe
  - `type FetchJson = (url: string) => Promise<{status: number; body: string}>`
  - `httpFetchJson: FetchJson`
  - `fetchItem(baseUrl: string, name: string, fetchJson: FetchJson): Promise<RegistryItemPayload>`
  - `fetchIndex(baseUrl: string, fetchJson: FetchJson): Promise<RegistryIndex>`
  - Task 9 calls `fetchItem`; Task 12 calls all of these.

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/src/registry/base-url.test.ts`:

```ts
import {describe, expect, test} from 'vitest'
import {DEFAULT_REGISTRY_URL, resolveBaseUrl} from './base-url'

describe('resolveBaseUrl', () => {
  test('falls back to the built-in default', () => {
    expect(resolveBaseUrl(undefined, {})).toBe(DEFAULT_REGISTRY_URL)
  })

  test('prefers the environment variable over the default', () => {
    expect(resolveBaseUrl(undefined, {NAT_UI_REGISTRY_URL: 'https://example.test/r'})).toBe(
      'https://example.test/r',
    )
  })

  test('prefers the flag over everything', () => {
    const env = {NAT_UI_REGISTRY_URL: 'https://env.test/r'}

    expect(resolveBaseUrl('https://flag.test/r', env)).toBe('https://flag.test/r')
  })

  test('ignores a blank override rather than producing an empty base', () => {
    expect(resolveBaseUrl('', {})).toBe(DEFAULT_REGISTRY_URL)
    expect(resolveBaseUrl(undefined, {NAT_UI_REGISTRY_URL: '  '})).toBe(DEFAULT_REGISTRY_URL)
  })

  test('drops a trailing slash so joining a name never doubles it', () => {
    expect(resolveBaseUrl('https://example.test/r/', {})).toBe('https://example.test/r')
  })
})
```

Create `packages/cli/src/registry/item-name.test.ts`:

```ts
import {describe, expect, test} from 'vitest'
import {assertValidItemName} from './item-name'

describe('assertValidItemName', () => {
  test('accepts lowercase hyphenated names', () => {
    expect(() => {
      assertValidItemName('button')
    }).not.toThrow()
    expect(() => {
      assertValidItemName('alert-dialog')
    }).not.toThrow()
  })

  test('rejects anything that could escape a URL or a path', () => {
    for (const name of ['', '..', '../etc/passwd', 'a/b', 'Button', 'https://x', 'a b']) {
      expect(() => {
        assertValidItemName(name)
      }).toThrow(/not a valid component name/)
    }
  })
})
```

Create `packages/cli/src/registry/fetch-item.test.ts`:

```ts
import {describe, expect, test} from 'vitest'
import {fetchIndex, fetchItem, type FetchJson} from './fetch-item'

const payload = {
  schemaVersion: '1',
  name: 'button',
  type: 'ui',
  dependencies: ['@base-ui/react'],
  files: [{path: 'components/ui/button.tsx', type: 'ui', content: 'export const Button = 1\n'}],
}

const serving = (byUrl: Record<string, {status: number; body: string}>): FetchJson => {
  return (url) => {
    const response = byUrl[url] ?? {status: 404, body: 'Not Found'}

    return Promise.resolve(response)
  }
}

describe('fetchItem', () => {
  test('requests the item document and validates it', async () => {
    const fetchJson = serving({
      'https://r.test/button.json': {status: 200, body: JSON.stringify(payload)},
    })

    const item = await fetchItem('https://r.test', 'button', fetchJson)

    expect(item.name).toBe('button')
    expect(item.files[0]?.content).toBe('export const Button = 1\n')
  })

  test('reports a missing item distinctly from any other failure', async () => {
    await expect(fetchItem('https://r.test', 'nope', serving({}))).rejects.toThrow(
      /No component named "nope"/,
    )
  })

  test('reports the status code for other failures', async () => {
    const fetchJson = serving({'https://r.test/button.json': {status: 500, body: 'boom'}})

    await expect(fetchItem('https://r.test', 'button', fetchJson)).rejects.toThrow(/500/)
  })

  test('rejects a payload written against a newer contract', async () => {
    const fetchJson = serving({
      'https://r.test/button.json': {
        status: 200,
        body: JSON.stringify({...payload, schemaVersion: '2'}),
      },
    })

    await expect(fetchItem('https://r.test', 'button', fetchJson)).rejects.toThrow(/upgrade/i)
  })

  test('rejects a body that is not JSON', async () => {
    const fetchJson = serving({'https://r.test/button.json': {status: 200, body: '<html>'}})

    await expect(fetchItem('https://r.test', 'button', fetchJson)).rejects.toThrow(/not valid JSON/)
  })

  test('refuses an unsafe name before building a URL', async () => {
    await expect(fetchItem('https://r.test', '../secrets', serving({}))).rejects.toThrow(
      /not a valid component name/,
    )
  })
})

describe('fetchIndex', () => {
  test('returns the list of available items', async () => {
    const fetchJson = serving({
      'https://r.test/index.json': {
        status: 200,
        body: JSON.stringify({schemaVersion: '1', items: [{name: 'button', type: 'ui'}]}),
      },
    })

    const index = await fetchIndex('https://r.test', fetchJson)

    expect(index.items.map((entry) => entry.name)).toEqual(['button'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/registry`
Expected: FAIL — none of the three modules exist.

- [ ] **Step 3: Write the base URL resolver**

Create `packages/cli/src/registry/base-url.ts`:

```ts
/**
 * Served straight from the repository so the registry needs no infrastructure.
 * The documentation site can take this over later by changing this default, or
 * anyone can point elsewhere with `--registry`, without a change to `add`.
 */
export const DEFAULT_REGISTRY_URL = 'https://raw.githubusercontent.com/Natip85/nat-ui/main/r'

const trimmed = (value: string | undefined): string | undefined => {
  const next = value?.trim()

  return next === undefined || next === '' ? undefined : next.replace(/\/+$/, '')
}

/** Flag beats environment beats default. */
export const resolveBaseUrl = (flag: string | undefined, env: NodeJS.ProcessEnv): string =>
  trimmed(flag) ?? trimmed(env.NAT_UI_REGISTRY_URL) ?? DEFAULT_REGISTRY_URL
```

- [ ] **Step 4: Write the name guard**

Create `packages/cli/src/registry/item-name.ts`:

```ts
import {registryItemNameSchema} from '@nat-ui/schema'

/**
 * A name is interpolated into a URL and, by way of the item it names, into a
 * filesystem path. Checking the shape here means neither is ever built from
 * something that could traverse out of where it belongs.
 */
export const assertValidItemName = (name: string): void => {
  if (!registryItemNameSchema.safeParse(name).success) {
    throw new Error(
      `"${name}" is not a valid component name. Names are lowercase words separated by single hyphens, like "alert-dialog".`,
    )
  }
}
```

- [ ] **Step 5: Write the fetcher**

Create `packages/cli/src/registry/fetch-item.ts`:

```ts
import {
  REGISTRY_SCHEMA_VERSION,
  type RegistryIndex,
  type RegistryItemPayload,
  registryIndexSchema,
  registryItemPayloadSchema,
} from '@nat-ui/schema'
import {assertValidItemName} from './item-name'

/**
 * Narrower than `fetch` on purpose: the command only needs a status and a body,
 * and a two-field shape is trivial to substitute in tests.
 */
export type FetchJson = (url: string) => Promise<{status: number; body: string}>

export const httpFetchJson: FetchJson = async (url) => {
  const response = await fetch(url)

  return {status: response.status, body: await response.text()}
}

const parseJson = (body: string, url: string): unknown => {
  try {
    return JSON.parse(body)
  } catch {
    throw new Error(`The response from ${url} was not valid JSON.`)
  }
}

export const fetchItem = async (
  baseUrl: string,
  name: string,
  fetchJson: FetchJson,
): Promise<RegistryItemPayload> => {
  assertValidItemName(name)

  const url = `${baseUrl}/${name}.json`
  const {status, body} = await fetchJson(url)

  if (status === 404) {
    throw new Error(`No component named "${name}" exists in the registry.`)
  }
  if (status < 200 || status >= 300) {
    throw new Error(`The registry returned ${String(status)} for ${url}.`)
  }

  const parsed = registryItemPayloadSchema.safeParse(parseJson(body, url))
  if (!parsed.success) {
    throw new Error(
      `The registry document for "${name}" is not one this version understands. Upgrade the CLI (expected schema version ${REGISTRY_SCHEMA_VERSION}).`,
    )
  }

  return parsed.data
}

export const fetchIndex = async (baseUrl: string, fetchJson: FetchJson): Promise<RegistryIndex> => {
  const url = `${baseUrl}/index.json`
  const {status, body} = await fetchJson(url)

  if (status < 200 || status >= 300) {
    throw new Error(`The registry returned ${String(status)} for ${url}.`)
  }

  const parsed = registryIndexSchema.safeParse(parseJson(body, url))
  if (!parsed.success) {
    throw new Error(`The registry index is not one this version understands. Upgrade the CLI.`)
  }

  return parsed.data
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/registry`
Expected: PASS, 14 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/registry
git commit -m "feat(cli): add the registry client"
```

---

### Task 9: Resolve the dependency graph

`dialog` depends on `button`, so naming one item can mean installing several. Resolution is depth-first so dependencies are written before the components that import them, deduplicated so a shared dependency is fetched once, and cycle-aware so a mistake in the registry surfaces as a message rather than a hang.

**Files:**

- Create: `packages/cli/src/registry/resolve-graph.ts`
- Create: `packages/cli/src/registry/resolve-graph.test.ts`

**Interfaces:**

- Consumes: `RegistryItemPayload` from `@nat-ui/schema` (Task 1).
- Produces: `resolveItems(names: readonly string[], load: (name: string) => Promise<RegistryItemPayload>): Promise<RegistryItemPayload[]>`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/registry/resolve-graph.test.ts`:

```ts
import type {RegistryItemPayload} from '@nat-ui/schema'
import {describe, expect, test} from 'vitest'
import {resolveItems} from './resolve-graph'

const item = (name: string, registryDependencies: string[] = []): RegistryItemPayload => ({
  schemaVersion: '1',
  name,
  type: 'ui',
  registryDependencies,
  files: [{path: `components/ui/${name}.tsx`, type: 'ui', content: ''}],
})

const loaderFor = (items: readonly RegistryItemPayload[], calls: string[]) => {
  return (name: string): Promise<RegistryItemPayload> => {
    calls.push(name)
    const found = items.find((candidate) => candidate.name === name)
    if (found === undefined) return Promise.reject(new Error(`missing ${name}`))

    return Promise.resolve(found)
  }
}

describe('resolveItems', () => {
  test('returns a single item with no dependencies', async () => {
    const calls: string[] = []
    const resolved = await resolveItems(['button'], loaderFor([item('button')], calls))

    expect(resolved.map((entry) => entry.name)).toEqual(['button'])
  })

  test('puts dependencies before the items that need them', async () => {
    const calls: string[] = []
    const items = [item('dialog', ['button']), item('button')]

    const resolved = await resolveItems(['dialog'], loaderFor(items, calls))

    expect(resolved.map((entry) => entry.name)).toEqual(['button', 'dialog'])
  })

  test('resolves transitively', async () => {
    const calls: string[] = []
    const items = [item('a', ['b']), item('b', ['c']), item('c')]

    const resolved = await resolveItems(['a'], loaderFor(items, calls))

    expect(resolved.map((entry) => entry.name)).toEqual(['c', 'b', 'a'])
  })

  test('fetches a shared dependency once', async () => {
    const calls: string[] = []
    const items = [item('dialog', ['button']), item('sheet', ['button']), item('button')]

    const resolved = await resolveItems(['dialog', 'sheet'], loaderFor(items, calls))

    expect(calls.filter((name) => name === 'button')).toHaveLength(1)
    expect(resolved.map((entry) => entry.name)).toEqual(['button', 'dialog', 'sheet'])
  })

  test('does not repeat an item named twice', async () => {
    const calls: string[] = []
    const resolved = await resolveItems(['button', 'button'], loaderFor([item('button')], calls))

    expect(resolved.map((entry) => entry.name)).toEqual(['button'])
  })

  test('reports a cycle instead of looping forever', async () => {
    const calls: string[] = []
    const items = [item('a', ['b']), item('b', ['a'])]

    await expect(resolveItems(['a'], loaderFor(items, calls))).rejects.toThrow(/cycle: a -> b -> a/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/registry/resolve-graph.test.ts`
Expected: FAIL — `./resolve-graph` does not exist.

- [ ] **Step 3: Write the resolver**

Create `packages/cli/src/registry/resolve-graph.ts`:

```ts
import type {RegistryItemPayload} from '@nat-ui/schema'

/**
 * Depth-first, post-order: an item is appended only once everything it depends
 * on has been. Writing in that order means a component's imports already exist
 * on disk by the time it lands.
 */
export const resolveItems = async (
  names: readonly string[],
  load: (name: string) => Promise<RegistryItemPayload>,
): Promise<RegistryItemPayload[]> => {
  const resolved: RegistryItemPayload[] = []
  const done = new Set<string>()
  const visiting = new Set<string>()

  const visit = async (name: string, trail: readonly string[]): Promise<void> => {
    if (done.has(name)) return
    if (visiting.has(name)) {
      throw new Error(`Registry items form a cycle: ${[...trail, name].join(' -> ')}`)
    }

    visiting.add(name)
    const item = await load(name)
    for (const dependency of item.registryDependencies ?? []) {
      await visit(dependency, [...trail, name])
    }
    visiting.delete(name)

    done.add(name)
    resolved.push(item)
  }

  for (const name of names) {
    await visit(name, [])
  }

  return resolved
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/registry`
Expected: PASS, 20 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/registry/resolve-graph.ts packages/cli/src/registry/resolve-graph.test.ts
git commit -m "feat(cli): resolve registry dependencies transitively"
```

---

### Task 10: Transform component source for the target project

Two pure string transforms. Components are authored against `@/components/ui/...` and `@/lib/utils`; a project that uses `~/` or puts its components elsewhere needs those specifiers rewritten. And `dialog` carries `"use client"`, which is meaningless noise in a project that is not using React Server Components.

**Files:**

- Create: `packages/cli/src/transform/rewrite-imports.ts`
- Create: `packages/cli/src/transform/rewrite-imports.test.ts`
- Create: `packages/cli/src/transform/use-client.ts`
- Create: `packages/cli/src/transform/use-client.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `interface RewriteAliases {readonly ui: string; readonly utils: string}`
  - `rewriteImports(source: string, aliases: RewriteAliases): string`
  - `applyClientDirective(source: string, rsc: boolean): string`

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/src/transform/rewrite-imports.test.ts`:

```ts
import {describe, expect, test} from 'vitest'
import {rewriteImports} from './rewrite-imports'

const aliases = {ui: '~/ui', utils: '~/helpers/cn'}

describe('rewriteImports', () => {
  test('rewrites the utils import to the configured alias', () => {
    const source = "import {cn} from '@/lib/utils'\n"

    expect(rewriteImports(source, aliases)).toBe("import {cn} from '~/helpers/cn'\n")
  })

  test('rewrites a sibling component import to the ui alias', () => {
    const source = "import {buttonVariants} from '@/components/ui/button'\n"

    expect(rewriteImports(source, aliases)).toBe("import {buttonVariants} from '~/ui/button'\n")
  })

  test('rewrites re-exports too', () => {
    const source = "export {Button} from '@/components/ui/button'\n"

    expect(rewriteImports(source, aliases)).toBe("export {Button} from '~/ui/button'\n")
  })

  test('preserves double quotes', () => {
    expect(rewriteImports('import {cn} from "@/lib/utils"', aliases)).toBe(
      'import {cn} from "~/helpers/cn"',
    )
  })

  test('leaves package imports alone', () => {
    const source = "import {Dialog} from '@base-ui/react/dialog'\nimport {X} from 'lucide-react'\n"

    expect(rewriteImports(source, aliases)).toBe(source)
  })

  test('leaves a string that merely looks like a specifier alone', () => {
    const source = "const doc = '@/lib/utils'\n"

    expect(rewriteImports(source, aliases)).toBe(source)
  })

  test('rewrites every occurrence in a file', () => {
    const source = [
      "import {cn} from '@/lib/utils'",
      "import {buttonVariants} from '@/components/ui/button'",
      '',
    ].join('\n')

    const result = rewriteImports(source, aliases)

    expect(result).toContain("'~/helpers/cn'")
    expect(result).toContain("'~/ui/button'")
    expect(result).not.toContain('@/')
  })

  test('is a no-op when the project uses the same aliases', () => {
    const source = "import {cn} from '@/lib/utils'\n"

    expect(rewriteImports(source, {ui: '@/components/ui', utils: '@/lib/utils'})).toBe(source)
  })
})
```

Create `packages/cli/src/transform/use-client.test.ts`:

```ts
import {describe, expect, test} from 'vitest'
import {applyClientDirective} from './use-client'

const withDirective = "'use client'\n\nimport {a} from 'b'\n"

describe('applyClientDirective', () => {
  test('keeps the directive for a React Server Components project', () => {
    expect(applyClientDirective(withDirective, true)).toBe(withDirective)
  })

  test('removes the directive and its blank line otherwise', () => {
    expect(applyClientDirective(withDirective, false)).toBe("import {a} from 'b'\n")
  })

  test('handles double quotes and a semicolon', () => {
    expect(applyClientDirective('"use client";\n\nconst a = 1\n', false)).toBe('const a = 1\n')
  })

  test('leaves a file without a directive untouched', () => {
    const source = "import {a} from 'b'\n"

    expect(applyClientDirective(source, false)).toBe(source)
    expect(applyClientDirective(source, true)).toBe(source)
  })

  test('only strips a directive at the top of the file', () => {
    const source = "const a = 1\n'use client'\n"

    expect(applyClientDirective(source, false)).toBe(source)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/transform`
Expected: FAIL — neither module exists.

- [ ] **Step 3: Write the import rewriter**

Create `packages/cli/src/transform/rewrite-imports.ts`:

```ts
export interface RewriteAliases {
  readonly ui: string
  readonly utils: string
}

/**
 * Only specifiers introduced by `from` or a bare `import` are matched, so a
 * string in the body that happens to look like a module path is left alone.
 */
const SPECIFIER = /(\bfrom\s*|\bimport\s*)(['"])(@\/[^'"]*)\2/g

const UI_PREFIX = '@/components/ui/'

const rewriteSpecifier = (specifier: string, aliases: RewriteAliases): string | undefined => {
  if (specifier === '@/lib/utils') return aliases.utils
  if (specifier.startsWith(UI_PREFIX)) return `${aliases.ui}/${specifier.slice(UI_PREFIX.length)}`

  // The generator refuses to publish any other `@/` shape, so reaching here
  // means a hand-edited document. Leaving it be is better than guessing.
  return undefined
}

/**
 * Rebuilt by hand rather than with a `replace` callback, whose parameters are
 * untyped and would need unsafe casts to satisfy the lint rules.
 */
export const rewriteImports = (source: string, aliases: RewriteAliases): string => {
  let result = ''
  let lastIndex = 0

  for (const match of source.matchAll(SPECIFIER)) {
    const [whole, keyword, quote, specifier] = match
    if (keyword === undefined || quote === undefined || specifier === undefined) continue

    const next = rewriteSpecifier(specifier, aliases)
    if (next === undefined) continue

    result += source.slice(lastIndex, match.index) + keyword + quote + next + quote
    lastIndex = match.index + whole.length
  }

  return result + source.slice(lastIndex)
}
```

- [ ] **Step 4: Write the directive transform**

Create `packages/cli/src/transform/use-client.ts`:

```ts
/** Anchored, so only a directive in the position React honours is removed. */
const DIRECTIVE = /^\s*(['"])use client\1\s*;?[ \t]*\r?\n(?:\r?\n)?/

/**
 * The directive is meaningful only where server components exist. Left in a
 * plain React or Vite app it is inert, but it reads as a claim about the
 * project's architecture that isn't true.
 */
export const applyClientDirective = (source: string, rsc: boolean): string =>
  rsc ? source : source.replace(DIRECTIVE, '')
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/transform`
Expected: PASS, 13 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/transform
git commit -m "feat(cli): rewrite component imports and the client directive"
```

---

### Task 11: Read the config and locate the alias on disk

`add` needs two things `init` already knows how to work out: how to read `components.json`, and how to turn `aliases.ui` into a real directory. The second currently lives in `init.ts` as two private helpers. They move to a shared module rather than being copied, so the two commands cannot disagree about where a file belongs.

**Files:**

- Create: `packages/cli/src/config/read.ts`
- Create: `packages/cli/src/config/read.test.ts`
- Create: `packages/cli/src/paths/alias.ts`
- Create: `packages/cli/src/paths/alias.test.ts`
- Modify: `packages/cli/src/commands/init.ts:36-48` and `:128-146`

**Interfaces:**

- Consumes: `readText` from `../fs/read-text`, `targetDirForPrefix` and `AliasMapping` from `../detect/project`, `configSchema`, `Config`, `CONFIG_FILE_NAME` from `@nat-ui/schema`.
- Produces:
  - `type ConfigResult = {status: 'missing'} | {status: 'invalid'; message: string} | {status: 'ok'; config: Config}`
  - `readConfig(cwd: string): Promise<ConfigResult>`
  - `isWithinRoot(root: string, target: string): boolean`
  - `aliasPrefixOf(alias: string): string`
  - `aliasToPath(alias: string, prefix: string, baseDir: string): string`
  - `aliasBaseDir(cwd: string, aliasTargets: readonly AliasMapping[], prefix: string, cssPath: string): string`

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/src/paths/alias.test.ts`:

```ts
import {join} from 'node:path'
import {describe, expect, test} from 'vitest'
import {aliasBaseDir, aliasPrefixOf, aliasToPath, isWithinRoot} from './alias'

describe('isWithinRoot', () => {
  test('accepts a path inside the root', () => {
    expect(isWithinRoot('/p', join('/p', 'src', 'a.css'))).toBe(true)
  })

  test('rejects a path that climbs out', () => {
    expect(isWithinRoot('/p', join('/p', '..', 'a.css'))).toBe(false)
  })

  test('does not mistake a directory beginning with dots for an escape', () => {
    expect(isWithinRoot('/p', join('/p', '..styles', 'a.css'))).toBe(true)
  })
})

describe('aliasPrefixOf', () => {
  test('takes everything before the first slash', () => {
    expect(aliasPrefixOf('@/components/ui')).toBe('@')
    expect(aliasPrefixOf('~/ui')).toBe('~')
  })

  test('returns the whole alias when there is no slash', () => {
    expect(aliasPrefixOf('@')).toBe('@')
  })
})

describe('aliasToPath', () => {
  test('strips the prefix and joins onto the base directory', () => {
    expect(aliasToPath('@/components/ui', '@', 'src')).toBe(join('src', 'components', 'ui'))
  })

  test('handles an empty base directory', () => {
    expect(aliasToPath('@/lib/utils', '@', '')).toBe(join('lib', 'utils'))
  })

  test('leaves an alias that does not carry the prefix alone', () => {
    expect(aliasToPath('components/ui', '@', 'src')).toBe(join('src', 'components', 'ui'))
  })
})

describe('aliasBaseDir', () => {
  test("prefers tsconfig's target for the prefix", () => {
    const targets = [{prefix: '@', target: 'src'}]

    expect(aliasBaseDir('/p', targets, '@', 'app/globals.css')).toBe('src')
  })

  test('guesses from the stylesheet when nothing maps the prefix', () => {
    expect(aliasBaseDir('/p', [], '@', 'src/app/globals.css')).toBe('src')
    expect(aliasBaseDir('/p', [], '@', 'app/globals.css')).toBe('')
  })

  test('discards a target that points outside the project', () => {
    const targets = [{prefix: '@', target: join('..', 'elsewhere')}]

    expect(aliasBaseDir('/p', targets, '@', 'src/app/globals.css')).toBe('src')
  })
})
```

If `AliasMapping` has fields other than `prefix` and `target`, adjust the literals above to match the interface in `src/detect/project.ts:8` — do not change the interface.

Create `packages/cli/src/config/read.test.ts`:

```ts
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {CONFIG_FILE_NAME} from '@nat-ui/schema'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import {readConfig} from './read'

let cwd = ''

const valid = {
  $schema: 'https://nat-ui.dev/schema.json',
  style: 'default',
  rsc: true,
  tsx: true,
  tailwind: {css: 'src/app/globals.css', baseColor: 'neutral'},
  aliases: {components: '@/components', utils: '@/lib/utils', ui: '@/components/ui'},
}

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'nat-ui-read-'))
})

afterEach(async () => {
  await rm(cwd, {recursive: true, force: true})
})

describe('readConfig', () => {
  test('reports a missing file distinctly', async () => {
    expect(await readConfig(cwd)).toEqual({status: 'missing'})
  })

  test('parses a valid config', async () => {
    await writeFile(join(cwd, CONFIG_FILE_NAME), JSON.stringify(valid))

    const result = await readConfig(cwd)

    expect(result.status).toBe('ok')
    expect(result.status === 'ok' && result.config.aliases.ui).toBe('@/components/ui')
  })

  test('reports malformed JSON', async () => {
    await writeFile(join(cwd, CONFIG_FILE_NAME), '{nope')

    const result = await readConfig(cwd)

    expect(result.status).toBe('invalid')
    expect(result.status === 'invalid' && result.message).toMatch(/not valid JSON/)
  })

  test('reports a config that does not match the schema', async () => {
    const {aliases: _aliases, ...withoutAliases} = valid
    await writeFile(join(cwd, CONFIG_FILE_NAME), JSON.stringify(withoutAliases))

    const result = await readConfig(cwd)

    expect(result.status).toBe('invalid')
    expect(result.status === 'invalid' && result.message).toMatch(/aliases/)
  })
})
```

If `configSchema` requires fields the `valid` literal above omits, copy the exact shape `init` writes — run `pnpm --filter @nat-ui/cli exec node -e "..."` or read `packages/schema/src/config.ts` — rather than loosening the schema.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/paths packages/cli/src/config`
Expected: FAIL — neither new module exists.

- [ ] **Step 3: Write the alias helpers**

Create `packages/cli/src/paths/alias.ts`, moving the two helpers out of `init.ts` verbatim and generalising `utilsPath` so it no longer knows about file extensions:

```ts
import {isAbsolute, join, relative, sep} from 'node:path'
import {type AliasMapping, targetDirForPrefix} from '../detect/project'

/**
 * Judged purely on the path given -- never on where it resolves on disk -- so a
 * stylesheet that is itself a symlink pointing outside the project (a real
 * monorepo pattern) is still accepted. Only a path that already reads outside
 * the project root, like `../../elsewhere.css`, is refused.
 *
 * Checks for a leading `..` *segment* rather than just the characters `..`, so a
 * legitimately in-root name that merely starts with two dots -- `..styles/globals.css`,
 * naming a real directory called `..styles` -- is not mistaken for an escape.
 */
export const isWithinRoot = (root: string, target: string): boolean => {
  const rel = relative(root, target)

  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)
}

/** `@/components/ui` -> `@`. */
export const aliasPrefixOf = (alias: string): string => {
  const slash = alias.indexOf('/')

  return slash === -1 ? alias : alias.slice(0, slash)
}

/** `@/components/ui` with prefix `@` and a paths target rooted at `src` -> `src/components/ui`. */
export const aliasToPath = (alias: string, prefix: string, baseDir: string): string => {
  const withoutPrefix = alias.startsWith(`${prefix}/`) ? alias.slice(prefix.length + 1) : alias

  return join(baseDir, withoutPrefix)
}

/**
 * Prefer where tsconfig's `paths` says the alias actually resolves, falling
 * back to a guess from the stylesheet's location when there's nothing more
 * reliable to go on, or when the `paths` target turns out to point outside the
 * project (a hint, not a user instruction, so it's discarded rather than
 * trusted enough to write there).
 */
export const aliasBaseDir = (
  cwd: string,
  aliasTargets: readonly AliasMapping[],
  prefix: string,
  cssPath: string,
): string => {
  const fallback = cssPath.startsWith('src/') ? 'src' : ''
  const target = targetDirForPrefix(aliasTargets, prefix)

  return target !== undefined && isWithinRoot(cwd, join(cwd, target)) ? target : fallback
}
```

- [ ] **Step 4: Write the config reader**

Create `packages/cli/src/config/read.ts`:

```ts
import {join} from 'node:path'
import {CONFIG_FILE_NAME, type Config, configSchema} from '@nat-ui/schema'
import {readText} from '../fs/read-text'

/**
 * Missing and malformed are separated because they call for different advice:
 * one means "run init", the other means "fix this file".
 */
export type ConfigResult =
  {status: 'missing'} | {status: 'invalid'; message: string} | {status: 'ok'; config: Config}

export const readConfig = async (cwd: string): Promise<ConfigResult> => {
  const text = await readText(join(cwd, CONFIG_FILE_NAME))
  if (text === undefined) return {status: 'missing'}

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {status: 'invalid', message: `${CONFIG_FILE_NAME} is not valid JSON. Fix it and retry.`}
  }

  const result = configSchema.safeParse(parsed)
  if (!result.success) {
    const issue = result.error.issues[0]
    const where =
      issue === undefined ? '' : ` (${issue.path.join('.') || 'root'}: ${issue.message})`

    return {status: 'invalid', message: `${CONFIG_FILE_NAME} is not a valid config${where}.`}
  }

  return {status: 'ok', config: result.data}
}
```

If the schema's export is named something other than `configSchema`, use whatever `packages/schema/src/config.ts` exports.

- [ ] **Step 5: Point `init` at the shared helpers**

In `packages/cli/src/commands/init.ts`, delete the private `isWithinRoot` (lines 36-40) and `utilsPath` (lines 42-48). Add to the imports:

```ts
import {aliasBaseDir, aliasToPath, isWithinRoot} from '../paths/alias'
```

Drop `targetDirForPrefix` from the `../detect/project` import, and drop `isAbsolute`, `relative`, and `sep` from the `node:path` import, keeping `dirname` and `join`.

Replace the block that computes the utility's location (lines 134-145) with:

```ts
const utilsBaseDir = aliasBaseDir(io.cwd, detected.aliasTargets, answers.aliasPrefix, answers.css)
const extension = answers.tsx ? '.ts' : '.js'
const relativeUtils = `${aliasToPath(aliasesFor(answers.aliasPrefix).utils, answers.aliasPrefix, utilsBaseDir)}${extension}`
```

- [ ] **Step 6: Run the whole suite**

Run: `pnpm vitest run packages/cli`
Expected: PASS. Every existing `init` test must still pass unchanged — this is a move, not a behaviour change. If an init test fails, the extraction altered behaviour; fix the extraction rather than the test.

- [ ] **Step 7: Verify the whole pipeline**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/config packages/cli/src/paths packages/cli/src/commands/init.ts
git commit -m "refactor(cli): share config reading and alias resolution with add"
```

---

### Task 12: The `add` command

Everything fallible happens before the first write: names are validated, the config is read, every item is fetched and validated, and the whole graph is resolved. Only then does anything touch the project.

**Files:**

- Create: `packages/cli/src/commands/add.ts`
- Create: `packages/cli/src/commands/add.test.ts`
- Modify: `packages/cli/src/prompts/ask.ts`

**Interfaces:**

- Consumes: everything produced by Tasks 8 through 11, plus `detectProject`, `toPosixPath`, `installCommand`, `PackageManager`, `atomicWriteFile`, `readText`.
- Produces:
  - `interface AddIo` — `cwd`, `env`, `interactive`, `fetchJson`, `confirmOverwrite`, `install`, `log`
  - `interface AddOptions` — `names`, `yes`, `overwrite`, `registry`
  - `add(io: AddIo, options: AddOptions): Promise<number>`
  - `confirmOverwriteFiles(paths: readonly string[]): Promise<boolean>` in `prompts/ask.ts`
  - Task 13 wires both into `src/index.ts`.

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/commands/add.test.ts`:

```ts
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {CONFIG_FILE_NAME} from '@nat-ui/schema'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import type {FetchJson} from '../registry/fetch-item'
import {add, type AddIo} from './add'

let cwd = ''

const config = {
  $schema: 'https://nat-ui.dev/schema.json',
  style: 'default',
  rsc: true,
  tsx: true,
  tailwind: {css: 'src/app/globals.css', baseColor: 'neutral'},
  aliases: {components: '@/components', utils: '@/lib/utils', ui: '@/components/ui'},
}

const buttonSource = "import {cn} from '@/lib/utils'\n\nexport const Button = () => null\n"
const dialogSource = [
  "'use client'",
  '',
  "import {buttonVariants} from '@/components/ui/button'",
  '',
  'export const Dialog = () => null',
  '',
].join('\n')

const documents: Record<string, unknown> = {
  button: {
    schemaVersion: '1',
    name: 'button',
    type: 'ui',
    dependencies: ['@base-ui/react', 'class-variance-authority'],
    files: [{path: 'components/ui/button.tsx', type: 'ui', content: buttonSource}],
  },
  dialog: {
    schemaVersion: '1',
    name: 'dialog',
    type: 'ui',
    dependencies: ['@base-ui/react', 'lucide-react'],
    registryDependencies: ['button'],
    files: [{path: 'components/ui/dialog.tsx', type: 'ui', content: dialogSource}],
  },
}

const fetchJson: FetchJson = (url) => {
  const name = /\/([^/]+)\.json$/.exec(url)?.[1]
  if (name === 'index') {
    return Promise.resolve({
      status: 200,
      body: JSON.stringify({
        schemaVersion: '1',
        items: [
          {name: 'button', type: 'ui'},
          {name: 'dialog', type: 'ui'},
        ],
      }),
    })
  }
  const document = name === undefined ? undefined : documents[name]
  if (document === undefined) return Promise.resolve({status: 404, body: 'Not Found'})

  return Promise.resolve({status: 200, body: JSON.stringify(document)})
}

const makeIo = (overrides: Partial<AddIo> = {}): AddIo & {logs: string[]} => {
  const logs: string[] = []

  return {
    cwd,
    env: {},
    interactive: false,
    fetchJson,
    confirmOverwrite: () => Promise.resolve(false),
    install: () => Promise.resolve(),
    log: (message) => logs.push(message),
    logs,
    ...overrides,
  }
}

const options = (over: Partial<Parameters<typeof add>[1]> = {}) => ({
  names: ['button'],
  yes: false,
  overwrite: false,
  registry: 'https://r.test',
  ...over,
})

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'nat-ui-add-'))
  await writeFile(join(cwd, 'package.json'), JSON.stringify({name: 'demo'}))
  await writeFile(join(cwd, CONFIG_FILE_NAME), JSON.stringify(config))
})

afterEach(async () => {
  await rm(cwd, {recursive: true, force: true})
})

const read = (relative: string) => readFile(join(cwd, relative), 'utf8')

describe('add', () => {
  test('writes the component and installs its dependencies', async () => {
    const install = vi.fn(() => Promise.resolve())
    const io = makeIo({install})

    const code = await add(io, options())

    expect(code).toBe(0)
    expect(await read('src/components/ui/button.tsx')).toBe(buttonSource)
    expect(install).toHaveBeenCalledTimes(1)
    expect(install.mock.calls[0]?.[1]).toEqual(['@base-ui/react', 'class-variance-authority'])
  })

  test('installs registry dependencies before the item that needs them', async () => {
    const io = makeIo()

    const code = await add(io, options({names: ['dialog']}))

    expect(code).toBe(0)
    expect(await read('src/components/ui/button.tsx')).toBeTruthy()
    const written = io.logs.filter((line) => line.startsWith('Wrote '))
    expect(written[0]).toContain('button.tsx')
    expect(written[1]).toContain('dialog.tsx')
  })

  test('installs the union of dependencies exactly once', async () => {
    const install = vi.fn(() => Promise.resolve())

    await add(makeIo({install}), options({names: ['dialog']}))

    expect(install).toHaveBeenCalledTimes(1)
    expect(install.mock.calls[0]?.[1]).toEqual([
      '@base-ui/react',
      'class-variance-authority',
      'lucide-react',
    ])
  })

  test('rewrites imports to the project aliases', async () => {
    await writeFile(
      join(cwd, CONFIG_FILE_NAME),
      JSON.stringify({
        ...config,
        aliases: {components: '~/parts', utils: '~/helpers/cn', ui: '~/parts/ui'},
      }),
    )

    await add(makeIo(), options({names: ['dialog']}))

    // No tsconfig in the fixture, so the base directory is guessed from the
    // stylesheet path, which is under src/.
    const dialog = await read('src/parts/ui/dialog.tsx')

    expect(dialog).toContain("from '~/parts/ui/button'")
    expect(dialog).not.toContain('@/components/ui/button')
  })

  test('keeps the client directive for a server components project', async () => {
    await add(makeIo(), options({names: ['dialog']}))

    expect(await read('src/components/ui/dialog.tsx')).toContain("'use client'")
  })

  test('strips the client directive when the project has no server components', async () => {
    await writeFile(join(cwd, CONFIG_FILE_NAME), JSON.stringify({...config, rsc: false}))

    await add(makeIo(), options({names: ['dialog']}))

    expect(await read('src/components/ui/dialog.tsx')).not.toContain('use client')
  })

  test('leaves an existing file alone when it cannot ask', async () => {
    await mkdir(join(cwd, 'src/components/ui'), {recursive: true})
    await writeFile(join(cwd, 'src/components/ui/button.tsx'), 'mine\n')

    const io = makeIo()
    const code = await add(io, options())

    expect(code).toBe(0)
    expect(await read('src/components/ui/button.tsx')).toBe('mine\n')
    expect(io.logs.join('\n')).toMatch(/already exists/)
  })

  test('overwrites when --overwrite is passed', async () => {
    await mkdir(join(cwd, 'src/components/ui'), {recursive: true})
    await writeFile(join(cwd, 'src/components/ui/button.tsx'), 'mine\n')

    const code = await add(makeIo(), options({overwrite: true}))

    expect(code).toBe(0)
    expect(await read('src/components/ui/button.tsx')).toBe(buttonSource)
  })

  test('asks once, naming every affected file', async () => {
    await mkdir(join(cwd, 'src/components/ui'), {recursive: true})
    await writeFile(join(cwd, 'src/components/ui/button.tsx'), 'mine\n')
    await writeFile(join(cwd, 'src/components/ui/dialog.tsx'), 'mine\n')

    const confirmOverwrite = vi.fn(() => Promise.resolve(true))
    await add(makeIo({interactive: true, confirmOverwrite}), options({names: ['dialog']}))

    expect(confirmOverwrite).toHaveBeenCalledTimes(1)
    expect(confirmOverwrite.mock.calls[0]?.[0]).toHaveLength(2)
  })

  test('--overwrite wins over --yes', async () => {
    await mkdir(join(cwd, 'src/components/ui'), {recursive: true})
    await writeFile(join(cwd, 'src/components/ui/button.tsx'), 'mine\n')

    const confirmOverwrite = vi.fn(() => Promise.resolve(false))
    await add(makeIo({interactive: true, confirmOverwrite}), options({overwrite: true, yes: true}))

    expect(confirmOverwrite).not.toHaveBeenCalled()
    expect(await read('src/components/ui/button.tsx')).toBe(buttonSource)
  })

  test('refuses to run without a config', async () => {
    await rm(join(cwd, CONFIG_FILE_NAME))

    const io = makeIo()
    const code = await add(io, options())

    expect(code).toBe(1)
    expect(io.logs.join('\n')).toMatch(/nat-ui init/)
  })

  test('refuses a JavaScript project', async () => {
    await writeFile(join(cwd, CONFIG_FILE_NAME), JSON.stringify({...config, tsx: false}))

    const io = makeIo()
    const code = await add(io, options())

    expect(code).toBe(1)
    expect(io.logs.join('\n')).toMatch(/TypeScript/)
  })

  test('lists what is available when the item is unknown', async () => {
    const io = makeIo()
    const code = await add(io, options({names: ['carousel']}))

    expect(code).toBe(1)
    expect(io.logs.join('\n')).toMatch(/carousel/)
    expect(io.logs.join('\n')).toMatch(/button, dialog/)
  })

  test('lists what is available when nothing is named', async () => {
    const io = makeIo()
    const code = await add(io, options({names: []}))

    expect(code).toBe(1)
    expect(io.logs.join('\n')).toMatch(/button, dialog/)
  })

  test('rejects an unsafe name without fetching anything', async () => {
    const spy = vi.fn(fetchJson)
    const io = makeIo({fetchJson: spy})

    const code = await add(io, options({names: ['../../etc/passwd']}))

    expect(code).toBe(1)
    expect(spy).not.toHaveBeenCalled()
  })

  test('writes nothing when one of several items cannot be fetched', async () => {
    const io = makeIo()

    const code = await add(io, options({names: ['button', 'carousel']}))

    expect(code).toBe(1)
    await expect(read('src/components/ui/button.tsx')).rejects.toThrow()
  })

  test('reports a failed install with the command to run by hand', async () => {
    const io = makeIo({install: () => Promise.reject(new Error('offline'))})

    const code = await add(io, options())

    expect(code).toBe(1)
    expect(io.logs.join('\n')).toMatch(/Run this by hand/)
    // The files still landed; only the install failed.
    expect(await read('src/components/ui/button.tsx')).toBe(buttonSource)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/commands/add.test.ts`
Expected: FAIL — `./add` does not exist.

- [ ] **Step 3: Add the overwrite prompt**

Append to `packages/cli/src/prompts/ask.ts`:

```ts
/**
 * One prompt for the whole set rather than one per file: the answer is the same
 * decision either way, and asking repeatedly turns a choice into a chore.
 */
export const confirmOverwriteFiles = async (paths: readonly string[]): Promise<boolean> => {
  const answer = await confirm({
    message: `These files already exist: ${paths.join(', ')}. Overwrite them?`,
    initialValue: false,
  })

  return !isCancel(answer) && answer
}
```

- [ ] **Step 4: Write the command**

Create `packages/cli/src/commands/add.ts`:

```ts
import {mkdir} from 'node:fs/promises'
import {basename, dirname, join} from 'node:path'
import type {RegistryItemPayload} from '@nat-ui/schema'
import {readConfig} from '../config/read'
import {installCommand, type PackageManager} from '../detect/package-manager'
import {detectProject, toPosixPath} from '../detect/project'
import {atomicWriteFile} from '../fs/atomic-write'
import {readText} from '../fs/read-text'
import {aliasBaseDir, aliasPrefixOf, aliasToPath} from '../paths/alias'
import {resolveBaseUrl} from '../registry/base-url'
import {fetchIndex, fetchItem, type FetchJson} from '../registry/fetch-item'
import {assertValidItemName} from '../registry/item-name'
import {resolveItems} from '../registry/resolve-graph'
import {rewriteImports} from '../transform/rewrite-imports'
import {applyClientDirective} from '../transform/use-client'

export interface AddIo {
  cwd: string
  env: NodeJS.ProcessEnv
  interactive: boolean
  fetchJson: FetchJson
  confirmOverwrite: (paths: readonly string[]) => Promise<boolean>
  install: (pm: PackageManager, packages: readonly string[], cwd: string) => Promise<void>
  log: (message: string) => void
}

export interface AddOptions {
  names: readonly string[]
  yes: boolean
  overwrite: boolean
  registry: string | undefined
}

interface PlannedFile {
  relative: string
  absolute: string
  content: string
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** Best-effort: the index is a nicety, so failing to read it must not mask the real error. */
const withAvailable = async (baseUrl: string, io: AddIo, message: string): Promise<string> => {
  try {
    const index = await fetchIndex(baseUrl, io.fetchJson)
    const names = index.items.map((entry) => entry.name).join(', ')

    return names === '' ? message : `${message} Available components: ${names}.`
  } catch {
    return message
  }
}

export const add = async (io: AddIo, options: AddOptions): Promise<number> => {
  const baseUrl = resolveBaseUrl(options.registry, io.env)

  if (options.names.length === 0) {
    io.log(await withAvailable(baseUrl, io, 'Name at least one component to add.'))

    return 1
  }

  try {
    for (const name of options.names) assertValidItemName(name)
  } catch (error) {
    io.log(messageOf(error))

    return 1
  }

  const found = await readConfig(io.cwd)
  if (found.status === 'missing') {
    io.log('No components.json here. Run "nat-ui init" first.')

    return 1
  }
  if (found.status === 'invalid') {
    io.log(found.message)

    return 1
  }

  const config = found.config
  if (!config.tsx) {
    io.log(
      'This project is configured for JavaScript. add can only write TypeScript components for now.',
    )

    return 1
  }

  // Everything that can fail happens here, before a single file is touched.
  let items: RegistryItemPayload[]
  try {
    items = await resolveItems(options.names, (name) => fetchItem(baseUrl, name, io.fetchJson))
  } catch (error) {
    io.log(await withAvailable(baseUrl, io, messageOf(error)))

    return 1
  }

  const detected = await detectProject(io.cwd, io.env)
  const prefix = aliasPrefixOf(config.aliases.ui)
  const baseDir = aliasBaseDir(io.cwd, detected.aliasTargets, prefix, config.tailwind.css)
  const uiDir = aliasToPath(config.aliases.ui, prefix, baseDir)

  const planned: PlannedFile[] = []
  for (const item of items) {
    for (const file of item.files) {
      if (file.type !== 'ui') {
        io.log(`"${item.name}" contains a "${file.type}" file, which this version cannot install.`)

        return 1
      }

      // Only the basename matters: the directory in the document is the
      // registry's own layout, not a structure to reproduce in someone's app.
      const relative = join(uiDir, basename(toPosixPath(file.path)))
      const rewritten = rewriteImports(file.content, {
        ui: config.aliases.ui,
        utils: config.aliases.utils,
      })

      planned.push({
        relative: toPosixPath(relative),
        absolute: join(io.cwd, relative),
        content: applyClientDirective(rewritten, config.rsc),
      })
    }
  }

  const existing: string[] = []
  for (const file of planned) {
    if ((await readText(file.absolute)) !== undefined) existing.push(file.relative)
  }

  // `--overwrite` is an instruction; `--yes` only means "accept defaults", and
  // the default here is to leave someone's edits alone. So the flag wins.
  let overwrite = options.overwrite
  if (!overwrite && existing.length > 0) {
    overwrite = io.interactive && !options.yes ? await io.confirmOverwrite(existing) : false
  }

  for (const file of planned) {
    if (!overwrite && existing.includes(file.relative)) {
      io.log(`Left ${file.relative} alone, since it already exists.`)
      continue
    }

    await mkdir(dirname(file.absolute), {recursive: true})
    await atomicWriteFile(file.absolute, file.content)
    io.log(`Wrote ${file.relative}`)
  }

  const packages = [...new Set(items.flatMap((item) => item.dependencies ?? []))].sort()
  if (packages.length > 0) {
    const {command, args} = installCommand(detected.packageManager, packages)
    try {
      await io.install(detected.packageManager, packages, io.cwd)
      io.log(`Installed ${packages.join(', ')}`)
    } catch (error) {
      io.log(messageOf(error))
      io.log(`Install failed. Run this by hand: ${command} ${args.join(' ')}`)

      return 1
    }
  }

  return 0
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/commands/add.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 6: Verify the whole pipeline**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/add.ts packages/cli/src/commands/add.test.ts packages/cli/src/prompts/ask.ts
git commit -m "feat(cli): add the add command"
```

---

### Task 13: Expose `add` on the command line

Until this task the command exists but nothing can reach it. `src/index.ts` currently answers `Unknown command: add` and the help text deliberately omits it; both change here, along with the README and a changeset.

**Files:**

- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/index.test.ts`
- Modify: `README.md`
- Create: `.changeset/add-command.md`

**Interfaces:**

- Consumes: `add`, `AddIo` (Task 12), `confirmOverwriteFiles` (Task 12), `httpFetchJson` (Task 8).
- Produces: `nat-ui add <component...> [--yes] [--overwrite] [--registry <url>]`.

- [ ] **Step 1: Write the failing test**

Read `packages/cli/src/index.test.ts` first. It contains a test asserting the help text does **not** mention `add`, and one asserting `add` is an unknown command. Both encode the old state and must be replaced, not worked around.

Replace those two tests with:

```ts
test('advertises the add command', () => {
  expect(help).toContain('add')
  expect(help).toContain('--overwrite')
  expect(help).toContain('--registry')
})

test('still rejects a command that does not exist', async () => {
  const logs: string[] = []
  const code = await run(['nope'], {log: (message: string) => logs.push(message)})

  expect(code).toBe(1)
  expect(logs.join('\n')).toContain('Unknown command: nope')
})

test('passes the parsed flags through to add', async () => {
  const logs: string[] = []
  const code = await run(['add', '--registry', 'https://r.test'], {
    log: (message: string) => logs.push(message),
  })

  // No components.json in the process cwd, so it stops before any network call.
  expect(code).toBe(1)
})
```

Match the existing helpers in that file — if it invokes the entry point through something other than a `run(argv, overrides)` shape, use whatever it already uses rather than introducing a second convention.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/index.test.ts`
Expected: FAIL — the help text has no `add`.

- [ ] **Step 3: Update the help text**

In `packages/cli/src/index.ts`:

```ts
export const help = `
  nat-ui v${version}

  Usage
    $ nat-ui <command> [options]

  Commands
    init                 Configure a project to use nat-ui
    add <component...>   Add components to your project

  Options
    -y, --yes            Accept every default without asking
        --overwrite      Replace files that already exist
        --registry <url> Use a different registry
    -v, --version        Print the version
    -h, --help           Show this message
`
```

- [ ] **Step 4: Parse the new flags and dispatch**

Add `overwrite: {type: 'boolean', default: false}` and `registry: {type: 'string'}` to the `parseArgs` options object, alongside the existing `yes`.

Add these imports:

```ts
import {add} from './commands/add'
import {confirmOverwriteFiles} from './prompts/ask'
import {httpFetchJson} from './registry/fetch-item'
```

`init` accepts neither new flag, so say so rather than silently ignoring them. In the `init` branch, before it runs:

```ts
if (values.overwrite === true || values.registry !== undefined) {
  log(`init takes neither --overwrite nor --registry.\n${help}`)

  return 1
}
```

Then add the `add` branch immediately after the `init` branch, mirroring how `init` builds its I/O object:

```ts
if (command === 'add') {
  return add(
    {
      cwd: process.cwd(),
      env: process.env,
      interactive: process.stdin.isTTY === true,
      fetchJson: httpFetchJson,
      confirmOverwrite: confirmOverwriteFiles,
      install,
      log,
    },
    {
      names: positionals.slice(1),
      yes: values.yes ?? false,
      overwrite: values.overwrite ?? false,
      registry: values.registry,
    },
  )
}
```

`init` currently rejects extra positionals. `add` consumes them as component names, so make sure that guard is scoped to the `init` branch and not applied before the dispatch.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/cli`
Expected: PASS.

- [ ] **Step 6: Update the README**

In `README.md`, replace the sentence saying `add` and the components are being built next. Add a usage section after the `init` one:

````markdown
### Adding components

```bash
npx @nat-ui/cli add button
```

Components are copied into the directory your `components.json` names, with
imports rewritten to your aliases. Naming a component pulls in whatever it
depends on, so `add dialog` also writes `button`.

```bash
npx @nat-ui/cli add button input dialog
npx @nat-ui/cli add dialog --overwrite
```

Available components: `button`, `input`, `dialog`.

`add` writes TypeScript. A project configured with `"tsx": false` is not
supported yet.

If you ran `init` with 0.1.0, run it again before adding components: the theme
block it wrote does not map the tokens into Tailwind's design system, so
components styled against them render unstyled. Re-running replaces the block in
place.
````

Also update the repository layout section if it describes `packages/registry` as empty, and remove the line assigning registry hosting to `apps/docs` — the registry is served from `r/` at the repository root for now.

- [ ] **Step 7: Add a changeset**

Create `.changeset/add-command.md`:

```markdown
---
'@nat-ui/cli': minor
---

Add the `add` command, which copies components from the registry into your
project, rewrites their imports to your aliases, and installs what they need.
The first components are `button`, `input`, and `dialog`.

`init` now also maps its theme tokens into Tailwind's design system with
`@theme inline`. Without that mapping, utilities like `bg-primary` do not exist
in Tailwind v4 and components render unstyled. Re-run `init` to update the
block in place.
```

- [ ] **Step 8: Verify the whole pipeline**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`
Expected: all pass.

- [ ] **Step 9: Smoke-test the built CLI end to end**

The registry is not published to `main` yet, so point the CLI at the local files over HTTP:

```bash
cd /tmp && rm -rf nat-ui-smoke && mkdir nat-ui-smoke && cd nat-ui-smoke
npm init -y >/dev/null && mkdir -p src/app
printf "@import 'tailwindcss';\n" > src/app/globals.css
printf '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}\n' > tsconfig.json
node <REPO>/packages/cli/dist/index.js init --yes
npx --yes serve -l 8787 <REPO>/r &
node <REPO>/packages/cli/dist/index.js add dialog --registry http://localhost:8787
```

Replace `<REPO>` with the absolute path to this repository.

Expected: `init` writes `components.json`, `src/lib/utils.ts`, and a theme block containing `@theme inline`. `add dialog` then writes `src/components/ui/button.tsx` and `src/components/ui/dialog.tsx` in that order and installs `@base-ui/react`, `class-variance-authority`, and `lucide-react`.

Check the result:

```bash
grep -n "use client" src/components/ui/dialog.tsx
grep -rn "@/components/ui/button" src/components/ui/dialog.tsx
```

Expected: the directive is present (the default config has `rsc: true`), and the import reads `@/components/ui/button` because this project's aliases match the authored ones. Then stop the server with `kill %1` and remove `/tmp/nat-ui-smoke`.

- [ ] **Step 10: Commit**

```bash
git add packages/cli README.md .changeset
git commit -m "feat(cli): expose add on the command line"
```

---

## After the plan

The registry documents under `r/` only become reachable once this branch merges to `main`, because the default base URL points at `main`. Until then, `--registry` or `NAT_UI_REGISTRY_URL` is the only way to exercise `add` against real documents.

Release order matters: merge first so GitHub raw serves `r/`, then publish `@nat-ui/cli@0.2.0`. Publishing first would ship a CLI whose default registry 404s.

Still outstanding after this work, and deliberately not in it: npm trusted publishing with a GitHub Actions release workflow, and the documentation site that eventually takes over registry hosting by changing `DEFAULT_REGISTRY_URL`.
