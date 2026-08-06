# Motion Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the shared motion token layer that every future nat-ui component depends on, prove it through a rebuilt `button`, and clear the clone components out of the registry.

**Architecture:** The CLI learns to install `lib` items so a shared, user-owned `motion.ts` can be distributed alongside components. That file defines three springs in physical terms and derives both a JavaScript spring config and a CSS `linear()` easing from the same constants, so CSS-driven and Motion-driven components stay visually identical. `button` consumes it through a new `animation` prop and becomes the first proof the whole approach works.

**Tech Stack:** TypeScript, React 19, Base UI 1.6, Tailwind v4, Zod 4, Vitest 4, tsx, pnpm workspaces, Next.js 16 + Fumadocs for the docs app.

## Global Constraints

- Node `>=22.13`, pnpm `10.34.5`. Never add a dependency outside `pnpm-workspace.yaml`'s `catalog:`.
- Prettier: `semi: false`, `singleQuote: true`, `jsxSingleQuote: true`, `bracketSpacing: false`, `trailingComma: "all"`, `arrowParens: "always"`, `printWidth: 100`, `tabWidth: 2`. Write code in this style directly; do not rely on the formatter to fix it.
- `pnpm build` regenerates `r/`, which is committed. CI runs `git diff --exit-code -- r`, so run `pnpm build` and commit the result whenever a component or the `items` array changes.
- Registry item names match `/^[a-z0-9]+(-[a-z0-9]+)*$/`.
- `REGISTRY_SCHEMA_VERSION` stays `'1'`. Do not add keys to `registryItemSchema` — it is a `z.strictObject` compiled into every published CLI, and a new key breaks installed clients.
- Preset constants are fixed by the spec and must be used verbatim: `smooth` = stiffness 1080 / damping 65, `snappy` = stiffness 1400 / damping 43, `bouncy` = stiffness 5200 / damping 35. Mass is 1 throughout. Default preset is `snappy`. (Revised after Task 5 shipped: the original stiffness/damping pairs preserved the right damping ratios but settled in 658–1575ms, too slow for a fixed-duration CSS transition, so both were scaled up together to hold the ratio — and therefore the feel — fixed while compressing the duration to roughly 400ms.)
- Preset names are exactly `smooth`, `snappy`, `bouncy`, `none`. The prop is named `animation` on every component.
- Presets vary physics only. Never vary travel distance, scale depth, or any other choreography between presets.
- Run `pnpm test`, `pnpm lint`, and `pnpm typecheck` before every commit.

---

### Task 1: Rewrite `@/lib/<name>` imports to the project's lib alias

**Files:**

- Modify: `packages/cli/src/transform/rewrite-imports.ts`
- Test: `packages/cli/src/transform/rewrite-imports.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `RewriteAliases` gains a required `lib: string` field. `rewriteImports(source: string, aliases: RewriteAliases): string` now maps `@/lib/<name>` (for any `<name>` other than `utils`) onto `${aliases.lib}/<name>`. Task 3 supplies `lib`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/cli/src/transform/rewrite-imports.test.ts`. Also update the shared fixture at the top of the file — it currently lacks `lib`, and the new required field would fail typecheck.

Replace line 4:

```ts
const aliases = {ui: '~/ui', utils: '~/helpers/cn', lib: '~/lib'}
```

Update the two existing tests that build their own alias objects so they also carry `lib`:

```ts
test('is a no-op when the project uses the same aliases', () => {
  const source = "import {cn} from '@/lib/utils'\n"

  expect(rewriteImports(source, {ui: '@/components/ui', utils: '@/lib/utils', lib: '@/lib'})).toBe(
    source,
  )
})
```

```ts
test('normalizes a trailing slash on the ui alias', () => {
  const source = "import {buttonVariants} from '@/components/ui/button'\n"
  const trailingSlashAliases = {ui: '~/ui/', utils: '~/helpers/cn', lib: '~/lib'}

  expect(rewriteImports(source, trailingSlashAliases)).toBe(
    "import {buttonVariants} from '~/ui/button'\n",
  )
})

test('normalizes multiple trailing slashes on the ui alias', () => {
  const source = "import {buttonVariants} from '@/components/ui/button'\n"
  const multiSlashAliases = {ui: '~/ui///', utils: '~/helpers/cn', lib: '~/lib'}

  expect(rewriteImports(source, multiSlashAliases)).toBe(
    "import {buttonVariants} from '~/ui/button'\n",
  )
})

test('normalizes a trailing slash on the utils alias', () => {
  const source = "import {cn} from '@/lib/utils'\n"
  const trailingSlashAliases = {ui: '~/ui', utils: '~/helpers/cn/', lib: '~/lib'}

  expect(rewriteImports(source, trailingSlashAliases)).toBe("import {cn} from '~/helpers/cn'\n")
})
```

Then append these new tests inside the same `describe` block:

```ts
test('rewrites a lib import to the configured lib alias', () => {
  const source = "import {SPRINGS} from '@/lib/motion'\n"

  expect(rewriteImports(source, aliases)).toBe("import {SPRINGS} from '~/lib/motion'\n")
})

test('still treats @/lib/utils as the utils alias, not the lib alias', () => {
  const source = "import {cn} from '@/lib/utils'\n"

  expect(rewriteImports(source, aliases)).toBe("import {cn} from '~/helpers/cn'\n")
})

test('rewrites lib and utils imports in the same file', () => {
  const source = [
    "import {cn} from '@/lib/utils'",
    "import {SPRINGS} from '@/lib/motion'",
    '',
  ].join('\n')

  expect(rewriteImports(source, aliases)).toBe(
    ["import {cn} from '~/helpers/cn'", "import {SPRINGS} from '~/lib/motion'", ''].join('\n'),
  )
})

test('normalizes a trailing slash on the lib alias', () => {
  const source = "import {SPRINGS} from '@/lib/motion'\n"
  const trailingSlashAliases = {ui: '~/ui', utils: '~/helpers/cn', lib: '~/lib//'}

  expect(rewriteImports(source, trailingSlashAliases)).toBe(
    "import {SPRINGS} from '~/lib/motion'\n",
  )
})

test('leaves a hooks alias untouched, since nothing installs hook files yet', () => {
  const source = "import {useThing} from '@/hooks/use-thing'\n"

  expect(rewriteImports(source, aliases)).toBe(source)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/transform/rewrite-imports.test.ts`
Expected: FAIL. The new lib tests report the specifier unchanged (`'@/lib/motion'` instead of `'~/lib/motion'`), and TypeScript reports `lib` is not assignable to `RewriteAliases`.

- [ ] **Step 3: Write the implementation**

Replace the contents of `packages/cli/src/transform/rewrite-imports.ts` above `rewriteImports` with:

```ts
export interface RewriteAliases {
  readonly ui: string
  readonly utils: string
  readonly lib: string
}

/**
 * Matching is keyword-driven: `\bfrom` and `\bimport` reach commented-out
 * imports and example imports in doc comments, not only live statements.
 * Ordinary string literals are left alone. Comment rewriting is tolerated
 * deliberately -- only comment text changes, and rewriting an example to the
 * project's alias is more useful than leaving `@/`; avoiding it would require
 * tokenizing the source.
 */
const SPECIFIER = /(\bfrom\s*|\bimport\s*)(['"])(@\/[^'"]*)\2/g

const UI_PREFIX = '@/components/ui/'
const LIB_PREFIX = '@/lib/'

const stripTrailingSlashes = (path: string): string => path.replace(/\/+$/, '')

const joinAlias = (alias: string, rest: string): string => `${stripTrailingSlashes(alias)}/${rest}`

/**
 * `@/lib/utils` is checked before the `@/lib/` prefix on purpose. It is the one
 * lib file the project already owns before any component is added, so it has
 * its own configured alias rather than living wherever `lib` points.
 */
const rewriteSpecifier = (specifier: string, aliases: RewriteAliases): string | undefined => {
  if (specifier === '@/lib/utils') return stripTrailingSlashes(aliases.utils)
  if (specifier.startsWith(UI_PREFIX))
    return joinAlias(aliases.ui, specifier.slice(UI_PREFIX.length))
  if (specifier.startsWith(LIB_PREFIX))
    return joinAlias(aliases.lib, specifier.slice(LIB_PREFIX.length))

  // The generator refuses to publish any other `@/` shape, so reaching here
  // means a hand-edited document. Leaving it be is better than guessing.
  return undefined
}
```

Leave `rewriteImports` itself unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/transform/rewrite-imports.test.ts`
Expected: PASS.

Then run `pnpm typecheck`. Expected: FAIL in `packages/cli/src/commands/add.ts`, which calls `rewriteImports` without `lib`. That is Task 3's job. To keep this task independently green, add the field at the call site now as a temporary equal-to-utils value; Task 3 replaces it with the resolved alias.

In `packages/cli/src/commands/add.ts`, change the `rewriteImports` call (around line 133):

```ts
const rewritten = rewriteImports(file.content, {
  ui: config.aliases.ui,
  utils: config.aliases.utils,
  lib: config.aliases.lib ?? config.aliases.utils,
})
```

Run `pnpm typecheck` again. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/transform/rewrite-imports.ts packages/cli/src/transform/rewrite-imports.test.ts packages/cli/src/commands/add.ts
git commit -m "feat(cli): rewrite @/lib imports to the project's lib alias"
```

---

### Task 2: Let the registry build emit `lib` items

**Files:**

- Modify: `packages/registry/scripts/build-registry.ts:33` (the `SUPPORTED_ALIAS` regex) and `packages/registry/scripts/build-registry.ts:99-140` (`toPayload`)
- Test: `packages/registry/scripts/build-registry.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `toPayload(item, read)` accepts items and files of type `'ui'` or `'lib'` and rejects `'hook'`, `'block'`, `'style'`, and `'component'`. `unsupportedAliasImports(source)` no longer flags `@/lib/<name>`. Task 5 relies on both to publish the `motion` item.

- [ ] **Step 1: Write the failing tests**

Append to `packages/registry/scripts/build-registry.test.ts`:

```ts
describe('lib items', () => {
  const libItem: RegistryItem = {
    name: 'motion',
    type: 'lib',
    files: [{path: 'lib/motion.ts', type: 'lib'}],
  }

  test('publishes a lib item', () => {
    const payload = toPayload(libItem, () => 'export const SPRINGS = {}\n')

    expect(payload.type).toBe('lib')
    expect(payload.files[0]?.type).toBe('lib')
    expect(payload.files[0]?.content).toBe('export const SPRINGS = {}\n')
  })

  test('refuses an item type the CLI cannot install', () => {
    const hookItem: RegistryItem = {
      name: 'use-thing',
      type: 'hook',
      files: [{path: 'hooks/use-thing.ts', type: 'hook'}],
    }

    expect(() => toPayload(hookItem, () => '')).toThrow(/only "ui" and "lib" can be installed/)
  })

  test('refuses a file type the CLI cannot install', () => {
    const mixed: RegistryItem = {
      name: 'thing',
      type: 'ui',
      files: [{path: 'components/thing.tsx', type: 'component'}],
    }

    expect(() => toPayload(mixed, () => '')).toThrow(/only "ui" and "lib" can be installed/)
  })

  test('accepts a component importing a lib file other than utils', () => {
    expect(unsupportedAliasImports("import {SPRINGS} from '@/lib/motion'\n")).toEqual([])
  })

  test('still accepts the utils import', () => {
    expect(unsupportedAliasImports("import {cn} from '@/lib/utils'\n")).toEqual([])
  })

  test('still refuses an alias shape the CLI cannot rewrite', () => {
    expect(unsupportedAliasImports("import {useThing} from '@/hooks/use-thing'\n")).toEqual([
      '@/hooks/use-thing',
    ])
  })
})
```

If `RegistryItem` is not already imported in this test file, add it:

```ts
import type {RegistryItem} from '@nat-ui/schema'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/registry/scripts/build-registry.test.ts`
Expected: FAIL with `Item "motion" is type "lib", but only "ui" can be installed.` and with `unsupportedAliasImports` returning `['@/lib/motion']`.

- [ ] **Step 3: Write the implementation**

In `packages/registry/scripts/build-registry.ts`, replace line 33:

```ts
/** The shapes `add` knows how to rewrite. Anything else would ship broken. */
const SUPPORTED_ALIAS = /^@\/(?:lib\/[a-z0-9-]+|components\/ui\/[a-z0-9-]+)$/
```

Then replace the opening of `toPayload` (the two type guards) with:

```ts
/**
 * `hook`, `block`, and `style` are in the schema for later. Publishing one now
 * would produce a document `add` refuses, so the build stops here instead.
 */
const INSTALLABLE_ITEM_TYPES = new Set<RegistryItemType>(['ui', 'lib'])
const INSTALLABLE_FILE_TYPES = new Set<RegistryItemFileType>(['ui', 'lib'])

export const toPayload = (
  item: RegistryItem,
  read: (path: string) => string,
): RegistryItemPayload => {
  if (!INSTALLABLE_ITEM_TYPES.has(item.type)) {
    throw new Error(
      `Item "${item.name}" is type "${item.type}", but only "ui" and "lib" can be installed.`,
    )
  }

  const files = item.files.map((file) => {
    if (!INSTALLABLE_FILE_TYPES.has(file.type)) {
      throw new Error(
        `File "${file.path}" in "${item.name}" is type "${file.type}", but only "ui" and "lib" can be installed.`,
      )
    }
```

Leave the rest of the `files.map` body and the closing `registryItemPayloadSchema.parse(...)` unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/registry/scripts/build-registry.test.ts`
Expected: PASS.

Any pre-existing test asserting the old message `only "ui" can be installed` must be updated to the new wording. Search for it:

Run: `rg 'only "ui" can be installed' packages`
Expected: no matches outside the file you just edited.

- [ ] **Step 5: Commit**

```bash
git add packages/registry/scripts/build-registry.ts packages/registry/scripts/build-registry.test.ts
git commit -m "feat(registry): allow lib items and @/lib imports in published documents"
```

---

### Task 3: Install `lib` files into the project's lib directory

**Files:**

- Modify: `packages/cli/src/paths/alias.ts`
- Modify: `packages/cli/src/commands/add.ts:104-144`
- Test: `packages/cli/src/paths/alias.test.ts`
- Test: `packages/cli/src/commands/add.test.ts`

**Interfaces:**

- Consumes: `RewriteAliases.lib` from Task 1; `lib` payloads from Task 2.
- Produces: `aliasDirOf(alias: string): string` in `packages/cli/src/paths/alias.ts`, returning the directory portion of an alias (`'@/lib/utils'` → `'@/lib'`). `add` writes `type: 'lib'` files into the directory named by `config.aliases.lib`, falling back to `aliasDirOf(config.aliases.utils)`.

- [ ] **Step 1: Write the failing test for `aliasDirOf`**

Append to `packages/cli/src/paths/alias.test.ts`:

```ts
describe('aliasDirOf', () => {
  test('returns the directory an aliased file sits in', () => {
    expect(aliasDirOf('@/lib/utils')).toBe('@/lib')
  })

  test('handles a nested alias', () => {
    expect(aliasDirOf('~/src/helpers/cn')).toBe('~/src/helpers')
  })

  test('ignores trailing slashes', () => {
    expect(aliasDirOf('@/lib/utils//')).toBe('@/lib')
  })

  test('returns the alias itself when there is no directory part', () => {
    expect(aliasDirOf('utils')).toBe('utils')
  })
})
```

Add `aliasDirOf` to the file's existing import from `./alias`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/paths/alias.test.ts`
Expected: FAIL with `aliasDirOf is not a function`.

- [ ] **Step 3: Implement `aliasDirOf`**

Append to `packages/cli/src/paths/alias.ts`:

```ts
/**
 * `@/lib/utils` → `@/lib`. Used to place lib files when a project's
 * `components.json` predates the `lib` alias: every config carries `utils`, and
 * the directory it names is where a second lib file belongs.
 */
export const aliasDirOf = (alias: string): string => {
  const stripped = alias.replace(/\/+$/, '')
  const slash = stripped.lastIndexOf('/')

  return slash === -1 ? stripped : stripped.slice(0, slash)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/paths/alias.test.ts`
Expected: PASS.

- [ ] **Step 5: Add fixtures for a lib item and an unplaceable file**

`packages/cli/src/commands/add.test.ts` already has everything needed: a module-level `cwd` recreated in `beforeEach`, a `config` object written to `components.json`, a `documents` record served by a fake `fetchJson`, and the helpers `makeIo(overrides?)`, `options(over?)`, and `read(relative)`. Use those — do not introduce new ones.

Note the existing `config` sets `tailwind.css` to `src/app/globals.css` and the temp project has no `tsconfig.json`, so every alias resolves under `src/`. That is why the paths below all start with `src/`.

Add next to `buttonSource` near the top of the file:

```ts
const motionSource = 'export const SPRINGS = {}\n'
const springySource = "import {SPRINGS} from '@/lib/motion'\n"
```

Add three entries to the `documents` record:

```ts
  motion: {
    schemaVersion: '1',
    name: 'motion',
    type: 'lib',
    files: [{path: 'lib/motion.ts', type: 'lib', content: motionSource}],
  },
  springy: {
    schemaVersion: '1',
    name: 'springy',
    type: 'ui',
    registryDependencies: ['motion'],
    files: [{path: 'components/ui/springy.tsx', type: 'ui', content: springySource}],
  },
  page: {
    schemaVersion: '1',
    name: 'page',
    type: 'ui',
    files: [{path: 'components/page.tsx', type: 'component', content: 'PAGE\n'}],
  },
```

- [ ] **Step 6: Rewrite the test that asserted lib files were refused**

The `mixed` document carries one `ui` file and one `lib` file, and this test currently asserts `add` rejects it:

```ts
test('refuses unsupported file types without writing anything', async () => {
  const io = makeIo()
  const code = await add(io, options({names: ['mixed']}))

  expect(code).toBe(1)
  expect(io.logs.join('\n')).toMatch(/lib/)
  await expect(read('src/components/ui/button.tsx')).rejects.toThrow()
  await expect(read('src/components/ui/mixed.tsx')).rejects.toThrow()
})
```

That is precisely the behaviour this task changes, so replace it with two tests — one asserting the new behaviour, one keeping the old guarantee for a file type that genuinely cannot be placed:

```ts
test('places each file of a mixed item by its type', async () => {
  const io = makeIo()

  const code = await add(io, options({names: ['mixed']}))

  expect(code).toBe(0)
  expect(await read('src/components/ui/mixed.tsx')).toBe('export const Mixed = () => null\n')
  expect(await read('src/lib/helper.ts')).toBe('export const helper = () => {}\n')
})

test('refuses a file type it cannot place, without writing anything', async () => {
  const io = makeIo()

  const code = await add(io, options({names: ['page']}))

  expect(code).toBe(1)
  expect(io.logs.join('\n')).toMatch(/component/)
  await expect(read('src/components/ui/page.tsx')).rejects.toThrow()
})
```

- [ ] **Step 7: Write the failing tests for lib placement**

Append inside `describe('add', ...)`:

```ts
test('installs a lib item into the directory holding utils', async () => {
  const io = makeIo()

  const code = await add(io, options({names: ['motion']}))

  expect(code).toBe(0)
  expect(await read('src/lib/motion.ts')).toBe(motionSource)
})

test('installs a lib item into an explicit lib alias when the config has one', async () => {
  await writeFile(
    join(cwd, CONFIG_FILE_NAME),
    JSON.stringify({...config, aliases: {...config.aliases, lib: '@/shared'}}),
  )
  const io = makeIo()

  const code = await add(io, options({names: ['motion']}))

  expect(code).toBe(0)
  expect(await read('src/shared/motion.ts')).toBe(motionSource)
})

test('installs a ui item together with the lib item it depends on', async () => {
  const io = makeIo()

  const code = await add(io, options({names: ['springy']}))

  expect(code).toBe(0)
  expect(await read('src/lib/motion.ts')).toBe(motionSource)
  expect(await read('src/components/ui/springy.tsx')).toBe(springySource)
})

test('rewrites a lib import to a custom lib alias', async () => {
  await writeFile(
    join(cwd, CONFIG_FILE_NAME),
    JSON.stringify({...config, aliases: {...config.aliases, lib: '~/shared'}}),
  )
  const io = makeIo()

  const code = await add(io, options({names: ['springy']}))

  expect(code).toBe(0)
  expect(await read('src/components/ui/springy.tsx')).toBe(
    "import {SPRINGS} from '~/shared/motion'\n",
  )
})
```

- [ ] **Step 8: Run tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/commands/add.test.ts`
Expected: FAIL. The four new tests exit with code 1, logging `The add command only installs ui components; "motion" includes a lib file.`, and `places each file of a mixed item by its type` fails the same way.

- [ ] **Step 9: Implement lib routing in `add`**

In `packages/cli/src/commands/add.ts`, add `aliasDirOf` to the existing import from `../paths/alias`:

```ts
import {aliasBaseDir, aliasDirOf, aliasPrefixOf, aliasToPath, isWithinRoot} from '../paths/alias'
```

Replace lines 104-108 (the `uiDir` computation) with:

```ts
const detected = await detectProject(io.cwd, io.env)

const resolveAliasDir = (alias: string): string => {
  if (isAbsolute(alias)) return alias
  const prefix = aliasPrefixOf(alias)

  return aliasToPath(
    alias,
    prefix,
    aliasBaseDir(io.cwd, detected.aliasTargets, prefix, config.tailwind.css),
  )
}

const uiDir = resolveAliasDir(config.aliases.ui)
// Every config carries `utils`; `lib` is optional and absent from any
// components.json written before lib items existed, so the directory holding
// `utils` is the fallback rather than a hard-coded path.
const libAlias = config.aliases.lib ?? aliasDirOf(config.aliases.utils)
const libDir = resolveAliasDir(libAlias)
```

Delete the now-duplicated `const detected = await detectProject(...)` line that preceded it, and the standalone `const prefix = ...` / `const baseDir = ...` lines.

Then replace the file loop's type guard and destination computation (lines 112-136) with:

```ts
  for (const item of items) {
    for (const file of item.files) {
      if (file.type !== 'ui' && file.type !== 'lib') {
        io.log(
          `The add command only installs ui and lib files; "${item.name}" includes a ${file.type} file.`,
        )

        return 1
      }

      // Only the basename matters: the directory in the document is the
      // registry's own layout, not a structure to reproduce in someone's app.
      const targetDir = file.type === 'ui' ? uiDir : libDir
      const relative = toPosixPath(join(targetDir, basename(toPosixPath(file.path))))
      const priorItem = destinationItems.get(relative)
      if (priorItem !== undefined) {
        io.log(`Adding "${priorItem}" and "${item.name}" would both write to ${relative}.`)

        return 1
      }

      destinationItems.set(relative, item.name)
      const rewritten = rewriteImports(file.content, {
        ui: config.aliases.ui,
        utils: config.aliases.utils,
        lib: libAlias,
      })
```

This replaces the temporary `lib: config.aliases.lib ?? config.aliases.utils` added in Task 1.

Finally, the out-of-root check below the loop names the ui alias in its message. Make it name whichever alias produced the path:

```ts
for (const file of planned) {
  if (!isWithinRoot(io.cwd, file.absolute)) {
    io.log(
      `An alias resolves to ${file.relative} outside the project. Choose aliases inside the project root.`,
    )

    return 1
  }
}
```

If an existing test asserts the old wording, update it to match.

- [ ] **Step 10: Run tests to verify they pass**

Run: `pnpm vitest run packages/cli`
Expected: PASS, all files.

Run: `pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/cli/src/paths/alias.ts packages/cli/src/paths/alias.test.ts packages/cli/src/commands/add.ts packages/cli/src/commands/add.test.ts
git commit -m "feat(cli): install lib files into the project's lib directory"
```

---

### Task 4: Remove `input` and `dialog`

**Files:**

- Delete: `packages/registry/src/components/ui/input.tsx`, `packages/registry/src/components/ui/input.test.tsx`, `packages/registry/src/components/ui/dialog.tsx`, `packages/registry/src/components/ui/dialog.test.tsx`
- Delete: `apps/docs/components/demos/input-demo.tsx`, `input-disabled.tsx`, `input-invalid.tsx`, `dialog-demo.tsx`, `dialog-no-close-button.tsx`
- Delete: `apps/docs/content/components/input.mdx`, `apps/docs/content/components/dialog.mdx`
- Modify: `packages/registry/src/index.ts`
- Modify: `apps/docs/components/demos/registry.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `items` in `packages/registry/src/index.ts` contains only `button`. Tasks 5 and 6 append to that array.

- [ ] **Step 1: Delete the component sources and their tests**

```bash
git rm packages/registry/src/components/ui/input.tsx packages/registry/src/components/ui/input.test.tsx packages/registry/src/components/ui/dialog.tsx packages/registry/src/components/ui/dialog.test.tsx
```

- [ ] **Step 2: Delete the demos and documentation pages**

```bash
git rm apps/docs/components/demos/input-demo.tsx apps/docs/components/demos/input-disabled.tsx apps/docs/components/demos/input-invalid.tsx apps/docs/components/demos/dialog-demo.tsx apps/docs/components/demos/dialog-no-close-button.tsx
git rm apps/docs/content/components/input.mdx apps/docs/content/components/dialog.mdx
```

- [ ] **Step 3: Shrink the registry to `button`**

Replace the `items` array in `packages/registry/src/index.ts` with:

```ts
export const items: readonly RegistryItem[] = [
  {
    name: 'button',
    type: 'ui',
    dependencies: ['@base-ui/react', 'class-variance-authority'],
    files: [{path: 'components/ui/button.tsx', type: 'ui'}],
  },
]
```

- [ ] **Step 4: Remove the deleted demos from the demo map**

In `apps/docs/components/demos/registry.ts`, delete the five imports (`DialogDemo`, `DialogNoCloseButton`, `InputDemo`, `InputDisabled`, `InputInvalid`) and the five matching entries in the `demos` object, leaving only the ten `button-*` entries.

- [ ] **Step 5: Rebuild the registry and run every check**

```bash
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

Expected: `pnpm build` prints `Wrote 1 registry item(s) to r/.`, and `r/input.json` and `r/dialog.json` are deleted by the build (it removes each output directory before writing). All checks PASS, including the docs coverage guard.

- [ ] **Step 6: Commit**

```bash
git add -A packages/registry apps/docs r
git commit -m "feat!: remove input and dialog from the registry

shadcn ships both, neither is a signature primitive, and sheet supersedes
dialog. This breaks nat-ui add input and nat-ui add dialog for published CLI
versions; already-installed copies are unaffected, since they are source files
the project owns."
```

---

### Task 5: The motion token layer

**Files:**

- Create: `packages/registry/src/lib/motion.ts`
- Create: `packages/registry/src/lib/motion.test.ts`
- Modify: `packages/registry/src/index.ts`
- Modify: `packages/registry/package.json` (add a `./lib/motion` export)
- Modify: `apps/docs/coverage.test.ts`

**Interfaces:**

- Consumes: `lib` item support from Tasks 2 and 3.
- Produces, all exported from `packages/registry/src/lib/motion.ts` and installed to the consuming project as `lib/motion.ts`:
  - `type AnimationPreset = 'smooth' | 'snappy' | 'bouncy' | 'none'`
  - `interface Spring {readonly stiffness: number; readonly damping: number; readonly mass: number}`
  - `const SPRINGS: Record<Exclude<AnimationPreset, 'none'>, Spring>`
  - `const DEFAULT_PRESET: AnimationPreset` (value `'snappy'`)
  - `springResponse(spring: Spring): {positions: number[]; durationMs: number}`
  - `toLinearEasing(spring: Spring, points?: number): string`
  - `const EASINGS: Record<AnimationPreset, string>`
  - `const DURATIONS_MS: Record<AnimationPreset, number>`
  - `usePrefersReducedMotion(): boolean`
  - `useResolvedPreset(preset?: AnimationPreset): AnimationPreset`
  - `transitionStyle(preset: AnimationPreset, properties?: string): CSSProperties`

  Task 6 consumes `AnimationPreset`, `DEFAULT_PRESET`, `useResolvedPreset`, and `transitionStyle`.
  Note `transitionStyle` is deliberately **not** named `use*`: it calls no hooks, and naming a
  plain function like one invites `react-hooks` lint rules to treat it as one.

- [ ] **Step 1: Write the failing tests**

Create `packages/registry/src/lib/motion.test.ts`:

```ts
import {describe, expect, test} from 'vitest'
import {
  DEFAULT_PRESET,
  DURATIONS_MS,
  EASINGS,
  SPRINGS,
  springResponse,
  toLinearEasing,
} from './motion'

describe('springResponse', () => {
  test('settles at rest for every preset', () => {
    for (const spring of Object.values(SPRINGS)) {
      const {positions} = springResponse(spring)

      expect(positions.at(-1)).toBeCloseTo(1, 2)
    }
  })

  test('reports a positive duration for every preset', () => {
    for (const spring of Object.values(SPRINGS)) {
      expect(springResponse(spring).durationMs).toBeGreaterThan(0)
    }
  })

  test('smooth never overshoots', () => {
    const {positions} = springResponse(SPRINGS.smooth)

    expect(Math.max(...positions)).toBeLessThanOrEqual(1.001)
  })

  test('snappy overshoots, but only slightly', () => {
    const peak = Math.max(...springResponse(SPRINGS.snappy).positions)

    expect(peak).toBeGreaterThan(1.001)
    expect(peak).toBeLessThan(1.15)
  })

  test('bouncy overshoots noticeably more than snappy', () => {
    const bouncy = Math.max(...springResponse(SPRINGS.bouncy).positions)
    const snappy = Math.max(...springResponse(SPRINGS.snappy).positions)

    expect(bouncy).toBeGreaterThan(snappy)
    expect(bouncy).toBeGreaterThan(1.2)
  })

  test('bouncy crosses the resting position more than once', () => {
    const {positions} = springResponse(SPRINGS.bouncy)
    let crossings = 0
    for (let i = 1; i < positions.length; i++) {
      const before = (positions[i - 1] ?? 0) - 1
      const after = (positions[i] ?? 0) - 1
      if (before < 0 !== after < 0) crossings++
    }

    expect(crossings).toBeGreaterThan(1)
  })
})

describe('toLinearEasing', () => {
  test('emits a linear() function with the requested number of points', () => {
    const easing = toLinearEasing(SPRINGS.snappy, 10)
    const inner = easing.slice('linear('.length, -1)

    expect(easing.startsWith('linear(')).toBe(true)
    expect(easing.endsWith(')')).toBe(true)
    expect(inner.split(', ')).toHaveLength(10)
  })

  test('starts at rest and ends at rest', () => {
    const inner = toLinearEasing(SPRINGS.bouncy, 20).slice('linear('.length, -1)
    const points = inner.split(', ').map(Number)

    expect(points[0]).toBeCloseTo(0, 2)
    expect(points.at(-1)).toBeCloseTo(1, 2)
  })
})

describe('the derived tables', () => {
  test('EASINGS and DURATIONS_MS cover exactly the presets', () => {
    const presets = [...Object.keys(SPRINGS), 'none'].sort()

    expect(Object.keys(EASINGS).sort()).toEqual(presets)
    expect(Object.keys(DURATIONS_MS).sort()).toEqual(presets)
  })

  test('every spring preset derives its easing from its own spring', () => {
    // The whole point of the layer: one constant, two outputs. If these ever
    // diverge, CSS-driven and Motion-driven components stop matching and
    // nothing else would notice.
    for (const [name, spring] of Object.entries(SPRINGS)) {
      expect(EASINGS[name as keyof typeof SPRINGS]).toBe(toLinearEasing(spring))
      expect(DURATIONS_MS[name as keyof typeof SPRINGS]).toBe(springResponse(spring).durationMs)
    }
  })

  test('none is instant', () => {
    expect(DURATIONS_MS.none).toBe(0)
  })

  test('the default preset is snappy', () => {
    expect(DEFAULT_PRESET).toBe('snappy')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/registry/src/lib/motion.test.ts`
Expected: FAIL — cannot resolve `./motion`.

- [ ] **Step 3: Write the implementation**

Create `packages/registry/src/lib/motion.ts`:

```ts
'use client'

import {type CSSProperties, useEffect, useState} from 'react'

/**
 * The shared motion vocabulary. Every nat-ui component takes an `animation`
 * prop naming one of these, so retuning this file retunes the whole library.
 */
export type AnimationPreset = 'smooth' | 'snappy' | 'bouncy' | 'none'

export interface Spring {
  readonly stiffness: number
  readonly damping: number
  readonly mass: number
}

/**
 * The damping ratio -- c / (2·√(k·m)), which sets how far a spring overshoots
 * and how many times it crosses rest -- was chosen by feel against live demos.
 * The absolute stiffness and damping are not: they are scaled up together,
 * ratio held fixed, until each preset settles in roughly 400ms. A live
 * simulation hides a spring's long low-amplitude tail as sub-pixel wobble, but
 * these constants also drive a fixed-duration CSS transition, where that same
 * tail becomes part of the declared length instead of something invisible.
 * Presets vary physics only -- travel distance and scale depth are fixed by
 * each component, so switching preset changes how a thing moves and never
 * what it does.
 */
export const SPRINGS: Record<Exclude<AnimationPreset, 'none'>, Spring> = {
  smooth: {stiffness: 1080, damping: 65, mass: 1},
  snappy: {stiffness: 1400, damping: 43, mass: 1},
  bouncy: {stiffness: 5200, damping: 35, mass: 1},
}

export const DEFAULT_PRESET: AnimationPreset = 'snappy'

const STEP_SECONDS = 1 / 1000
const MAX_SECONDS = 10
const REST_POSITION = 0.001
const REST_VELOCITY = 0.001

/**
 * The unit step response, integrated rather than solved, so an overdamped and
 * an underdamped spring go through the same code path. Positions are sampled
 * every millisecond, starting at 0 and ending once the spring is at rest.
 */
export const springResponse = (spring: Spring): {positions: number[]; durationMs: number} => {
  const positions: number[] = [0]
  let position = 0
  let velocity = 0
  let elapsed = 0

  while (elapsed < MAX_SECONDS) {
    const acceleration =
      (spring.stiffness * (1 - position) - spring.damping * velocity) / spring.mass
    velocity += acceleration * STEP_SECONDS
    position += velocity * STEP_SECONDS
    elapsed += STEP_SECONDS
    positions.push(position)

    if (Math.abs(1 - position) < REST_POSITION && Math.abs(velocity) < REST_VELOCITY) break
  }

  return {positions, durationMs: Math.round(elapsed * 1000)}
}

/**
 * A CSS `linear()` easing sampled from the same integration. `cubic-bezier`
 * cannot express overshoot at all, so approximating with one would guarantee
 * the CSS-driven components drift away from the Motion-driven ones.
 */
export const toLinearEasing = (spring: Spring, points = 64): string => {
  const {positions} = springResponse(spring)
  const samples: string[] = []

  for (let index = 0; index < points; index++) {
    const at = Math.round((index / (points - 1)) * (positions.length - 1))
    samples.push((positions[at] ?? 1).toFixed(4))
  }

  return `linear(${samples.join(', ')})`
}

export const EASINGS: Record<AnimationPreset, string> = {
  smooth: toLinearEasing(SPRINGS.smooth),
  snappy: toLinearEasing(SPRINGS.snappy),
  bouncy: toLinearEasing(SPRINGS.bouncy),
  none: 'linear',
}

export const DURATIONS_MS: Record<AnimationPreset, number> = {
  smooth: springResponse(SPRINGS.smooth).durationMs,
  snappy: springResponse(SPRINGS.snappy).durationMs,
  bouncy: springResponse(SPRINGS.bouncy).durationMs,
  none: 0,
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Read after mount rather than during render, so a server render and the first
 * client render agree. One frame of motion before the preference applies is
 * preferable to a hydration mismatch on every page.
 */
export const usePrefersReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY)
    setReduced(query.matches)

    const onChange = (event: MediaQueryListEvent): void => {
      setReduced(event.matches)
    }
    query.addEventListener('change', onChange)

    return () => {
      query.removeEventListener('change', onChange)
    }
  }, [])

  return reduced
}

/**
 * The single place the reduced-motion preference is honoured. Components call
 * this instead of reading their `animation` prop directly, so no component can
 * forget.
 */
export const useResolvedPreset = (preset: AnimationPreset = DEFAULT_PRESET): AnimationPreset =>
  usePrefersReducedMotion() ? 'none' : preset

/**
 * Inline rather than a stylesheet variable, so a component works the moment it
 * is copied in -- including when it arrives through the shadcn CLI, which never
 * runs nat-ui's init and so never writes theme CSS.
 */
export const transitionStyle = (
  preset: AnimationPreset,
  properties = 'transform',
): CSSProperties => ({
  transitionProperty: properties,
  transitionDuration: `${String(DURATIONS_MS[preset])}ms`,
  transitionTimingFunction: EASINGS[preset],
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/registry/src/lib/motion.test.ts`
Expected: PASS.

- [ ] **Step 5: Publish `motion` as a registry item**

In `packages/registry/src/index.ts`, add the item ahead of `button` (the array is sorted by the build, so position is only for readability):

```ts
export const items: readonly RegistryItem[] = [
  {
    name: 'motion',
    type: 'lib',
    files: [{path: 'lib/motion.ts', type: 'lib'}],
  },
  {
    name: 'button',
    type: 'ui',
    dependencies: ['@base-ui/react', 'class-variance-authority'],
    files: [{path: 'components/ui/button.tsx', type: 'ui'}],
  },
]
```

`motion` declares no `dependencies`: it imports only `react`, which `build-registry` treats as always present.

In `packages/registry/package.json`, add the export so the docs app and the playground can import it:

```json
  "exports": {
    "./registry": "./src/index.ts",
    "./components/ui/*": "./src/components/ui/*.tsx",
    "./lib/motion": "./src/lib/motion.ts",
    "./lib/utils": "./src/lib/utils.ts"
  },
```

- [ ] **Step 6: Exempt non-component items from the docs coverage guard**

The guard requires a page and a `-demo` entry for every registry item. `motion` is a library, not a component, so it has neither.

In `apps/docs/coverage.test.ts`, insert after the `here` constant:

```ts
/**
 * Only `ui` items appear on the site. A `lib` item like `motion` is something
 * components depend on rather than something a page documents; the guides
 * cover it in prose instead.
 */
const components = items.filter((item) => item.type === 'ui')
```

Then replace every remaining use of `items` inside the `describe` block with `components`. There are four: in `documents every registry item`, `documents nothing that is not a registry item`, `registers a demo for every registry item`, and `registers no demo for a component that does not exist`.

- [ ] **Step 7: Rebuild and run every check**

```bash
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

Expected: `pnpm build` prints `Wrote 2 registry item(s) to r/.`, and `r/motion.json` exists with `"type": "lib"`. All checks PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/registry apps/docs/coverage.test.ts r
git commit -m "feat(registry): add the motion token layer

One set of spring constants derives both the JavaScript configs and the CSS
linear() easings, so CSS-driven and Motion-driven components cannot drift
apart. Reduced motion resolves to the none preset in one place."
```

---

### Task 6: Rebuild `button` around the motion language

**Files:**

- Modify: `packages/registry/src/components/ui/button.tsx`
- Modify: `packages/registry/src/components/ui/button.test.tsx`
- Modify: `packages/registry/src/index.ts`
- Create: `apps/docs/components/demos/button-animation.tsx`
- Modify: `apps/docs/components/demos/registry.ts`
- Modify: `apps/docs/content/components/button.mdx`

**Interfaces:**

- Consumes: `AnimationPreset`, `DEFAULT_PRESET`, `useResolvedPreset`, `transitionStyle` from Task 5.
- Produces: `ButtonProps` gains `animation?: AnimationPreset`. `buttonVariants` keeps its existing `variant` and `size` signature unchanged, so every existing demo still compiles.

- [ ] **Step 1: Write the failing tests**

Append to `packages/registry/src/components/ui/button.test.tsx`, matching the render helpers already used there:

```ts
test('applies the default preset when no animation prop is given', () => {
  render(<Button>Press</Button>)
  const button = screen.getByRole('button', {name: 'Press'})

  expect(button.style.transitionTimingFunction).toBe(EASINGS[DEFAULT_PRESET])
  expect(button.style.transitionDuration).toBe(`${String(DURATIONS_MS[DEFAULT_PRESET])}ms`)
})

test('applies the named preset', () => {
  render(<Button animation='bouncy'>Press</Button>)
  const button = screen.getByRole('button', {name: 'Press'})

  expect(button.style.transitionTimingFunction).toBe(EASINGS.bouncy)
})

test('lets a caller override the transition through style', () => {
  render(
    <Button animation='bouncy' style={{transitionDuration: '0ms'}}>
      Press
    </Button>,
  )

  expect(screen.getByRole('button', {name: 'Press'}).style.transitionDuration).toBe('0ms')
})

test('keeps variant and size independent of animation', () => {
  render(
    <Button variant='destructive' size='lg' animation='smooth'>
      Press
    </Button>,
  )
  const button = screen.getByRole('button', {name: 'Press'})

  expect(button.className).toContain('bg-destructive')
  expect(button.style.transitionTimingFunction).toBe(EASINGS.smooth)
})
```

Add to the file's imports:

```ts
import {DEFAULT_PRESET, DURATIONS_MS, EASINGS} from '../../lib/motion'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/registry/src/components/ui/button.test.tsx`
Expected: FAIL — `transitionTimingFunction` is empty, and TypeScript rejects the `animation` prop.

- [ ] **Step 3: Write the implementation**

Replace `packages/registry/src/components/ui/button.tsx`:

```tsx
'use client'

import {Button as BaseButton} from '@base-ui/react/button'
import {cva, type VariantProps} from 'class-variance-authority'
import type {ComponentProps} from 'react'
import {
  type AnimationPreset,
  DEFAULT_PRESET,
  transitionStyle,
  useResolvedPreset,
} from '@/lib/motion'
import {cn} from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium will-change-transform active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
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
  VariantProps<typeof buttonVariants> & {
    className?: string
    /** How the press responds. Independent of `variant` and `size`. */
    animation?: AnimationPreset
  }

export function Button({
  className,
  variant,
  size,
  animation = DEFAULT_PRESET,
  style,
  ...props
}: ButtonProps) {
  const preset = useResolvedPreset(animation)
  // Spread last so a caller's own style wins, the same way `className` does.
  const transition = transitionStyle(preset, 'transform, background-color, color')

  return (
    <BaseButton
      className={cn(buttonVariants({variant, size, className}))}
      style={{...transition, ...style}}
      {...props}
    />
  )
}
```

Note the removal of `transition-colors` from the base class list: the transition is now described entirely by the inline style, and leaving the utility in place would let Tailwind's duration and easing win over the preset.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/registry/src/components/ui/button.test.tsx`
Expected: PASS.

- [ ] **Step 5: Declare the registry dependency**

In `packages/registry/src/index.ts`, add `registryDependencies` to `button` so `nat-ui add button` also installs `motion`:

```ts
  {
    name: 'button',
    type: 'ui',
    dependencies: ['@base-ui/react', 'class-variance-authority'],
    registryDependencies: ['motion'],
    files: [{path: 'components/ui/button.tsx', type: 'ui'}],
  },
```

- [ ] **Step 6: Add the preset demo**

Create `apps/docs/components/demos/button-animation.tsx`:

```tsx
'use client'

import {Button} from '@nat-ui/registry/components/ui/button'

export function ButtonAnimation() {
  return (
    <div className='flex flex-wrap items-center gap-3'>
      <Button animation='smooth'>Smooth</Button>
      <Button animation='snappy'>Snappy</Button>
      <Button animation='bouncy'>Bouncy</Button>
    </div>
  )
}
```

This matches the import specifier every existing demo uses — see `apps/docs/components/demos/button-demo.tsx`. The `'use client'` directive is new for a demo, and is required because `Button` now calls hooks.

Register it in `apps/docs/components/demos/registry.ts` — add the import alongside the others and this entry to the `demos` object:

```ts
  'button-animation': {component: ButtonAnimation, file: 'button-animation.tsx'},
```

- [ ] **Step 7: Document the prop**

In `apps/docs/content/components/button.mdx`, add a section that renders the new demo, and extend the existing props table with an `animation` row (`AnimationPreset`, default `snappy`). The coverage guard fails if the demo is registered but no page renders it.

```mdx
### Animation

Every nat-ui component takes an `animation` prop. It is independent of
`variant` and `size`, so appearance and feel vary separately.

<ComponentPreview name='button-animation' />
```

- [ ] **Step 8: Rebuild and run every check**

```bash
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm build:docs
```

Expected: all PASS. `r/button.json` now lists `"registryDependencies": ["motion"]`.

- [ ] **Step 9: Commit**

```bash
git add packages/registry apps/docs r
git commit -m "feat(button): add the animation prop

Presses respond with the preset's spring, expressed as a CSS linear() easing
so the button carries no motion dependency."
```

---

### Task 7: The playground route

**Files:**

- Create: `apps/docs/app/playground/page.tsx`

**Interfaces:**

- Consumes: `AnimationPreset` and `SPRINGS` from Task 5; `Button` and `buttonVariants` from Task 6.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the page**

Create `apps/docs/app/playground/page.tsx`:

```tsx
'use client'

import {Button} from '@nat-ui/registry/components/ui/button'
import {type AnimationPreset, SPRINGS} from '@nat-ui/registry/lib/motion'
import {useState} from 'react'

const PRESETS: AnimationPreset[] = [...(Object.keys(SPRINGS) as AnimationPreset[]), 'none']
const VARIANTS = ['default', 'secondary', 'destructive', 'outline', 'ghost', 'link'] as const
const SIZES = ['sm', 'default', 'lg', 'icon'] as const

type Variant = (typeof VARIANTS)[number]
type Size = (typeof SIZES)[number]

export default function PlaygroundPage() {
  const [animation, setAnimation] = useState<AnimationPreset>('snappy')
  const [variant, setVariant] = useState<Variant>('default')
  const [size, setSize] = useState<Size>('default')

  return (
    <main className='mx-auto flex max-w-3xl flex-col gap-8 p-8'>
      <div>
        <h1 className='text-2xl font-semibold'>Playground</h1>
        <p className='text-sm opacity-70'>
          Not linked from anywhere. Press things, change the preset, press them again.
        </p>
      </div>

      <div className='flex flex-wrap gap-6'>
        <label className='flex flex-col gap-1 text-sm'>
          Animation
          <select
            className='rounded-md border px-2 py-1'
            value={animation}
            onChange={(event) => {
              setAnimation(event.target.value as AnimationPreset)
            }}
          >
            {PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
          </select>
        </label>

        <label className='flex flex-col gap-1 text-sm'>
          Variant
          <select
            className='rounded-md border px-2 py-1'
            value={variant}
            onChange={(event) => {
              setVariant(event.target.value as Variant)
            }}
          >
            {VARIANTS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className='flex flex-col gap-1 text-sm'>
          Size
          <select
            className='rounded-md border px-2 py-1'
            value={size}
            onChange={(event) => {
              setSize(event.target.value as Size)
            }}
          >
            {SIZES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className='flex min-h-32 items-center justify-center rounded-lg border p-8'>
        <Button animation={animation} variant={variant} size={size}>
          {size === 'icon' ? 'B' : 'Press me'}
        </Button>
      </div>

      <div className='flex flex-col gap-3'>
        <p className='text-sm font-medium'>All three at once</p>
        <div className='flex flex-wrap items-center gap-3'>
          <Button animation='smooth'>Smooth</Button>
          <Button animation='snappy'>Snappy</Button>
          <Button animation='bouncy'>Bouncy</Button>
          <Button animation='none'>None</Button>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify it renders**

```bash
pnpm --filter @nat-ui/docs dev
```

Open `http://localhost:3000/playground`. Press the button with each preset selected and confirm the three differ from each other and that `none` is instant. Stop the dev server.

- [ ] **Step 3: Run every check**

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build:docs
```

Expected: all PASS. The coverage guard ignores this route, since it only reads `content/components`.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/app/playground/page.tsx
git commit -m "feat(docs): add a playground route for comparing animation presets"
```

---

### Task 8: Release the CLI

**Files:**

- Create: `.changeset/<generated-name>.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Prove the CLI installs the new graph end to end**

The smoke build in CI does this on every push, but run it locally first because this is the first release where `add` writes outside the ui directory.

The registry must be served over HTTP. `httpFetchJson` calls `fetch`, which does not support `file://` in Node, so point `--registry` at a local server rather than a path.

In one terminal, from the repository root:

```bash
pnpm build
npx serve r -p 5055
```

In another:

```bash
REPO=$(git -C <path-to-repo> rev-parse --show-toplevel)
cd "$(mktemp -d)"
pnpm create next-app@latest smoke --ts --tailwind --app --no-src-dir --no-eslint --use-pnpm --yes
cd smoke
node "$REPO/packages/cli/dist/index.js" init --yes
node "$REPO/packages/cli/dist/index.js" add button --registry http://localhost:5055
pnpm build
```

Expected: `lib/motion.ts` and `components/ui/button.tsx` are both written, `button.tsx` imports `@/lib/motion`, and the smoke project's `pnpm build` succeeds. Stop the server afterwards.

- [ ] **Step 2: Write the changeset**

Run `pnpm changeset`, select `@nat-ui/cli`, choose **minor**, and use this description:

```markdown
---
'@nat-ui/cli': minor
---

`add` can now install `lib` items, which is what lets components share the
motion token layer. Lib files go to the `lib` alias from `components.json`, or,
for configs written before that alias existed, to the directory holding
`utils`. Imports of `@/lib/<name>` are rewritten alongside `@/lib/utils` and
`@/components/ui/*`.

`input` and `dialog` have been removed from the registry. Copies already
installed are unaffected — they are files your project owns — but
`nat-ui add input` and `nat-ui add dialog` now fail with a not-found error.
```

- [ ] **Step 3: Update the README**

In `README.md`, replace the available-components line:

```markdown
Available components: `button`.
```

And update the quick-start note that follows it, which currently says `add dialog` also writes `button`:

```markdown
`init` configures a project in one pass and writes `components.json`. `add`
reads that config, so components land where you already keep things, with
imports rewritten to your aliases. Naming a component pulls in whatever it
depends on, so `add button` also writes the shared `motion` module.
```

- [ ] **Step 4: Run every check**

```bash
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build:docs
```

Expected: all PASS, and `git diff --exit-code -- r` is clean.

- [ ] **Step 5: Commit**

```bash
git add .changeset README.md
git commit -m "chore: describe the lib-item release"
```

- [ ] **Step 6: Publish**

Follow the release procedure in `README.md` exactly — `pnpm version-packages`, commit, `pnpm --filter @nat-ui/cli run verify-pack`, `pnpm release`, then `git push && git push --tags`.

---

## Done when

- `nat-ui add button` writes `lib/motion.ts` and `components/ui/button.tsx` into a fresh Next.js project, and that project builds.
- `<Button animation='bouncy'>` visibly differs from `<Button animation='smooth'>`, and `prefers-reduced-motion` collapses both to instant.
- `r/` contains exactly `index.json`, `motion.json`, and `button.json`.
- `/playground` renders and the three presets feel distinct.
- `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build:docs` all pass.

## Not in this plan

Deliberately deferred to the plans that follow, per the spec:

- **shadcn-compatible registry output** at `/s/{name}.json`, and the namespace docs.
- **The remaining components** — `switch`, `tabs`, `slider`, `multi-select`, `sortable-list`, `swipeable-item`.
- **The docs and landing rewrite**, including promoting the playground's preset switcher above every component preview.
