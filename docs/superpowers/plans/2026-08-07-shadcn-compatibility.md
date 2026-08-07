# shadcn Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit every registry item in shadcn's `registry-item` format at `/s/{name}.json`, so an existing shadcn project can install nat-ui components with `npx shadcn add` and never learn that the nat-ui CLI exists.

**Architecture:** One in-memory item list, two serialisations. `toPayload` keeps producing nat-ui's `/r/` documents byte-for-byte unchanged; a new `toShadcnItem` produces the shadcn document beside it. The mapping is a pure function tested in isolation, and the build writes both trees from the same source read.

**Tech Stack:** TypeScript, Zod v4, tsx, Vitest, GitHub Actions.

## Global Constraints

- Prettier: `semi: false`, `singleQuote: true`, `jsxSingleQuote: true`, `bracketSpacing: false`, `trailingComma: "all"`, `arrowParens: "always"`, `printWidth: 100`, `tabWidth: 2`. Write code in this style directly; do not rely on the formatter to fix it.
- `pnpm build` regenerates `r/` and now `s/`, both committed. CI runs `git diff --exit-code -- r s`, so run `pnpm build` and commit the result whenever a component, the `items` array, or the mapping changes.
- Registry item names match `/^[a-z0-9]+(-[a-z0-9]+)*$/`.
- `REGISTRY_SCHEMA_VERSION` stays `'1'`. Do not add keys to `registryItemSchema` or `registryItemPayloadSchema` — they are `z.strictObject` compiled into every published CLI, and a new key breaks installed clients. The shadcn metadata added in Task 1 lives in the registry package, never in `@nat-ui/schema`.
- `/r/` output must not change by a single byte in Tasks 1 through 5. Task 1 has an explicit guard for that; if `git diff -- r` is non-empty after a build in those tasks, something is wrong. (Superseded after Task 5: a final-review fix deliberately changed the button's `destructive` classes, which changes `r/button.json`'s content. The permanent constraint is the narrower one — no key may be added or removed, because that is what published CLIs validate.)
- The published site is `https://nat-ui-delta.vercel.app`. The nat-ui registry is served from `/r`, the shadcn one from `/s`.
- Run `pnpm test`, `pnpm lint`, and `pnpm typecheck` before every commit.

---

### Task 1: Give every item a title and description without changing `/r/`

shadcn's CLI and any registry browser display `title` and `description`. nat-ui's items have neither. They must be added to the authoring list while the served nat-ui documents stay byte-identical, which means `toPayload` can no longer spread the whole item into a strict schema.

**Files:**

- Modify: `packages/registry/src/index.ts`
- Modify: `packages/registry/scripts/build-registry.ts:108-151` (`toPayload`)
- Test: `packages/registry/scripts/build-registry.test.ts`

**Interfaces:**

- Produces: `RegistrySourceItem` — exported from `packages/registry/src/index.ts`, equal to `@nat-ui/schema`'s `RegistryItem` plus required `title: string` and `description: string`. `items` is typed `readonly RegistrySourceItem[]`. Tasks 2 and 3 consume this type.
- Produces: `toPayload(item: RegistrySourceItem, read: (path: string) => string): RegistryItemPayload` — same name and behaviour as today, but it now picks nat-ui's keys explicitly instead of spreading.

- [ ] **Step 1: Write the failing test**

Add to `packages/registry/scripts/build-registry.test.ts`:

```ts
describe('toPayload', () => {
  test('omits the shadcn-only metadata from the nat-ui document', () => {
    // `registryItemPayloadSchema` is a strict object baked into every published
    // CLI. A document carrying `title` fails validation in the field, on a
    // version of the CLI we can no longer change.
    const payload = toPayload(
      {
        name: 'thing',
        type: 'ui',
        title: 'Thing',
        description: 'A thing.',
        files: [{path: 'components/ui/thing.tsx', type: 'ui'}],
      },
      () => 'export const Thing = () => null\n',
    )

    expect(payload).not.toHaveProperty('title')
    expect(payload).not.toHaveProperty('description')
    expect(payload.name).toBe('thing')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/registry/scripts/build-registry.test.ts -t 'omits the shadcn-only metadata'`
Expected: FAIL — `toPayload` spreads `...item`, so `registryItemPayloadSchema.parse` throws on the unrecognised `title` key.

- [ ] **Step 3: Add the type and the metadata**

In `packages/registry/src/index.ts`, replace the `items` declaration:

```ts
import {REGISTRY_SCHEMA_VERSION, type RegistryItem} from '@nat-ui/schema'

/**
 * What an item looks like here, as opposed to what the registry serves. The
 * title and description exist for shadcn's format, which displays them; the
 * nat-ui format has no field for either and must not grow one, so `toPayload`
 * drops them on the way out.
 */
export type RegistrySourceItem = RegistryItem & {
  readonly title: string
  readonly description: string
}

export const items: readonly RegistrySourceItem[] = [
  {
    name: 'motion',
    type: 'lib',
    title: 'Motion',
    description:
      'Spring presets and the easing functions derived from them. Every nat-ui component reads its animation from here.',
    files: [
      {path: 'lib/motion.ts', type: 'lib'},
      {path: 'lib/use-motion.ts', type: 'lib'},
    ],
  },
  {
    name: 'button',
    type: 'ui',
    title: 'Button',
    description:
      'A button whose press is a spring rather than a transition, with smooth, snappy and bouncy presets.',
    dependencies: ['@base-ui/react', 'class-variance-authority'],
    registryDependencies: ['motion'],
    files: [
      {path: 'components/ui/button.tsx', type: 'ui'},
      {path: 'components/ui/button-variants.tsx', type: 'ui'},
    ],
  },
]

export const registry = {schemaVersion: REGISTRY_SCHEMA_VERSION, items} as const
```

- [ ] **Step 4: Make `toPayload` pick rather than spread**

In `packages/registry/scripts/build-registry.ts`, change the import and the signature:

```ts
import {items, type RegistrySourceItem} from '../src/index'
```

Then replace the final `return` of `toPayload` (currently `return registryItemPayloadSchema.parse({schemaVersion: REGISTRY_SCHEMA_VERSION, ...item, files})`) with:

```ts
// Picked one key at a time rather than spread: `item` now carries shadcn's
// title and description, and the payload schema is strict, so a spread would
// fail the build the moment metadata was added.
return registryItemPayloadSchema.parse({
  schemaVersion: REGISTRY_SCHEMA_VERSION,
  name: item.name,
  type: item.type,
  ...(item.dependencies === undefined ? {} : {dependencies: item.dependencies}),
  ...(item.registryDependencies === undefined
    ? {}
    : {registryDependencies: item.registryDependencies}),
  files,
})
```

Change `toPayload`'s parameter type from `item: RegistryItem` to `item: RegistrySourceItem`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/registry/scripts/build-registry.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 6: Prove `/r/` did not move**

Run: `pnpm build && git diff --stat -- r`
Expected: no output whatsoever. Any diff here means the served nat-ui documents changed, which breaks published CLIs — stop and fix before continuing.

- [ ] **Step 7: Commit**

```bash
git add packages/registry/src/index.ts packages/registry/scripts/build-registry.ts packages/registry/scripts/build-registry.test.ts
git commit -m "feat(registry): give items a title and description for the shadcn format"
```

---

### Task 2: Map a nat-ui item to a shadcn registry item

The mapping is pure and is the whole substance of this plan, so it is built and tested with no filesystem or build wiring around it.

**Files:**

- Create: `packages/registry/scripts/shadcn.ts`
- Create: `packages/registry/scripts/shadcn.test.ts`

**Interfaces:**

- Consumes: `RegistrySourceItem` from `packages/registry/src/index.ts` (Task 1); `RegistryItemPayload` from `@nat-ui/schema`.
- Produces, all exported from `packages/registry/scripts/shadcn.ts`:
  - `SHADCN_SCHEMA_URL: string` — `'https://ui.shadcn.com/schema/registry-item.json'`
  - `DEFAULT_SHADCN_BASE_URL: string` — `'https://nat-ui-delta.vercel.app/s'`
  - `shadcnTypeOf(type: RegistryItemType | RegistryItemFileType): 'registry:ui' | 'registry:lib'` — throws on any type the registry cannot install.
  - `toShadcnItem(item: RegistrySourceItem, payload: RegistryItemPayload, baseUrl: string, known: ReadonlySet<string>): ShadcnItem`
  - `type ShadcnItem` — the serialised shape, structurally what is written to `/s/{name}.json`.

`known` is the set of names this registry defines. A `registryDependencies`
entry naming one of them becomes an absolute nat-ui URL; anything else is a
plain shadcn item and passes through untouched. The spec relies on this — it is
what lets a nat-ui component depend on the user's existing shadcn `input`
rather than nat-ui shipping its own.

- [ ] **Step 1: Write the failing test**

Create `packages/registry/scripts/shadcn.test.ts`:

```ts
import type {RegistryItemPayload} from '@nat-ui/schema'
import {describe, expect, test} from 'vitest'
import type {RegistrySourceItem} from '../src/index'
import {DEFAULT_SHADCN_BASE_URL, SHADCN_SCHEMA_URL, shadcnTypeOf, toShadcnItem} from './shadcn'

const source: RegistrySourceItem = {
  name: 'button',
  type: 'ui',
  title: 'Button',
  description: 'A button.',
  dependencies: ['@base-ui/react'],
  registryDependencies: ['motion'],
  files: [{path: 'components/ui/button.tsx', type: 'ui'}],
}

// Annotated rather than `as const`: `registryItemPayloadSchema` builds `files`
// with `z.array(...)`, so the inferred type has mutable arrays and a readonly
// tuple is not assignable to it.
const payload: RegistryItemPayload = {
  schemaVersion: '1',
  name: 'button',
  type: 'ui',
  dependencies: ['@base-ui/react'],
  registryDependencies: ['motion'],
  files: [{path: 'components/ui/button.tsx', type: 'ui', content: 'export const Button = 1\n'}],
}

const known = new Set(['button', 'motion'])

describe('shadcnTypeOf', () => {
  test('namespaces both installable types', () => {
    expect(shadcnTypeOf('ui')).toBe('registry:ui')
    expect(shadcnTypeOf('lib')).toBe('registry:lib')
  })

  test('refuses a type the registry cannot install', () => {
    expect(() => shadcnTypeOf('block')).toThrow(/block/)
  })
})

describe('toShadcnItem', () => {
  test('carries the schema url, metadata, and file contents', () => {
    const item = toShadcnItem(source, payload, DEFAULT_SHADCN_BASE_URL, known)

    expect(item.$schema).toBe(SHADCN_SCHEMA_URL)
    expect(item.name).toBe('button')
    expect(item.type).toBe('registry:ui')
    expect(item.title).toBe('Button')
    expect(item.description).toBe('A button.')
    expect(item.dependencies).toEqual(['@base-ui/react'])
    expect(item.files).toEqual([
      {
        path: 'components/ui/button.tsx',
        type: 'registry:ui',
        content: 'export const Button = 1\n',
      },
    ])
  })

  test('rewrites our own registry dependencies to absolute urls', () => {
    // Not `@nat-ui/motion`: a namespaced reference only resolves when the user
    // has configured the namespace in components.json, and the install path we
    // expect most people to take is a bare URL with no configuration at all.
    // An absolute URL resolves under both.
    const item = toShadcnItem(source, payload, 'https://example.test/s', known)

    expect(item.registryDependencies).toEqual(['https://example.test/s/motion.json'])
  })

  test('leaves a plain shadcn dependency alone', () => {
    // `input` is shadcn's, not ours. Rewriting it to a nat-ui URL would 404,
    // and this passthrough is what lets a component build on whatever the
    // user's shadcn setup already installed instead of nat-ui shipping a
    // duplicate primitive.
    const dependent: RegistrySourceItem = {...source, registryDependencies: ['motion', 'input']}
    const item = toShadcnItem(dependent, payload, 'https://example.test/s', known)

    expect(item.registryDependencies).toEqual(['https://example.test/s/motion.json', 'input'])
  })

  test('omits absent optional keys rather than emitting empty arrays', () => {
    const bare: RegistrySourceItem = {
      name: 'motion',
      type: 'lib',
      title: 'Motion',
      description: 'Springs.',
      files: [{path: 'lib/motion.ts', type: 'lib'}],
    }
    const barePayload: RegistryItemPayload = {
      schemaVersion: '1',
      name: 'motion',
      type: 'lib',
      files: [{path: 'lib/motion.ts', type: 'lib', content: 'export const x = 1\n'}],
    }

    const item = toShadcnItem(bare, barePayload, DEFAULT_SHADCN_BASE_URL, known)

    expect(item).not.toHaveProperty('dependencies')
    expect(item).not.toHaveProperty('registryDependencies')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/registry/scripts/shadcn.test.ts`
Expected: FAIL — cannot resolve `./shadcn`.

- [ ] **Step 3: Write the implementation**

Create `packages/registry/scripts/shadcn.ts`:

```ts
import type {RegistryItemFileType, RegistryItemPayload, RegistryItemType} from '@nat-ui/schema'
import type {RegistrySourceItem} from '../src/index'

export const SHADCN_SCHEMA_URL = 'https://ui.shadcn.com/schema/registry-item.json'

/**
 * Absolute because it ends up inside the documents themselves. Overridable so
 * CI can serve a build whose cross-references point at its own local server
 * instead of production.
 */
export const DEFAULT_SHADCN_BASE_URL = 'https://nat-ui-delta.vercel.app/s'

/**
 * Throws rather than casts. `toPayload` has already rejected anything that is
 * not `ui` or `lib`, so this is unreachable in the build -- but it is the kind
 * of unreachable that stops being unreachable the day a new type is added, and
 * a silent `registry:ui` on a block would be found by a user, not by us.
 */
export const shadcnTypeOf = (
  type: RegistryItemType | RegistryItemFileType,
): 'registry:ui' | 'registry:lib' => {
  if (type === 'ui') return 'registry:ui'
  if (type === 'lib') return 'registry:lib'

  throw new Error(`Type "${type}" has no shadcn equivalent; only "ui" and "lib" do.`)
}

export interface ShadcnItemFile {
  readonly path: string
  readonly type: 'registry:ui' | 'registry:lib'
  readonly content: string
}

export interface ShadcnItem {
  readonly $schema: string
  readonly name: string
  readonly type: 'registry:ui' | 'registry:lib'
  readonly title: string
  readonly description: string
  readonly dependencies?: readonly string[]
  readonly registryDependencies?: readonly string[]
  readonly files: readonly ShadcnItemFile[]
}

/**
 * The same item, serialised for a CLI we do not own. Contents come from the
 * already-validated nat-ui payload rather than being read again, so the two
 * formats cannot describe different source text.
 */
export const toShadcnItem = (
  item: RegistrySourceItem,
  payload: RegistryItemPayload,
  baseUrl: string,
  known: ReadonlySet<string>,
): ShadcnItem => ({
  $schema: SHADCN_SCHEMA_URL,
  name: item.name,
  type: shadcnTypeOf(item.type),
  title: item.title,
  description: item.description,
  ...(item.dependencies === undefined ? {} : {dependencies: item.dependencies}),
  ...(item.registryDependencies === undefined
    ? {}
    : {
        // Only ours become URLs. A name this registry does not define is a
        // shadcn item the user's own setup resolves, and rewriting it would
        // point at a nat-ui document that does not exist.
        registryDependencies: item.registryDependencies.map((name) =>
          known.has(name) ? `${baseUrl}/${name}.json` : name,
        ),
      }),
  files: payload.files.map((file) => ({
    path: file.path,
    type: shadcnTypeOf(file.type),
    content: file.content,
  })),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/registry/scripts/shadcn.test.ts`
Expected: PASS, 6 tests — two for `shadcnTypeOf` and four for `toShadcnItem`.

- [ ] **Step 5: Commit**

```bash
git add packages/registry/scripts/shadcn.ts packages/registry/scripts/shadcn.test.ts
git commit -m "feat(registry): map nat-ui items to shadcn registry items"
```

---

### Task 3: Write `/s/` alongside `/r/` in the build

**Files:**

- Modify: `packages/registry/scripts/build-registry.ts:243-292`
- Modify: `packages/registry/scripts/build-registry.test.ts`
- Modify: `.gitignore:27`
- Modify: `.prettierignore` — `s/` and `apps/docs/public/s`, mirroring the `r/` entries already there. `JSON.stringify` output is not Prettier-formatted, so `format:check` fails without this.

**Interfaces:**

- Consumes: `toShadcnItem`, `DEFAULT_SHADCN_BASE_URL` (Task 2); `items`, `RegistrySourceItem` (Task 1).
- Produces: `shadcnOutputDirectories(packageRoot: string): string[]` exported from `build-registry.ts`, mirroring the existing `outputDirectories`.
- Produces: committed `s/button.json` and `s/motion.json` at the repository root, plus generated `apps/docs/public/s/` served at `/s/{name}.json`.

- [ ] **Step 1: Write the failing test**

Add to `packages/registry/scripts/build-registry.test.ts`:

```ts
describe('shadcnOutputDirectories', () => {
  test('writes the committed tree and the served one', () => {
    const [committed, served] = shadcnOutputDirectories('/repo/packages/registry')

    expect(committed).toBe(join('/repo', 's'))
    expect(served).toBe(join('/repo', 'apps', 'docs', 'public', 's'))
  })
})
```

Import `shadcnOutputDirectories` alongside the existing imports, and `join` from `node:path` if the file does not already import it.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/registry/scripts/build-registry.test.ts -t 'writes the committed tree'`
Expected: FAIL — `shadcnOutputDirectories` is not exported.

- [ ] **Step 3: Add the directories and the emit**

In `packages/registry/scripts/build-registry.ts`, add the import:

```ts
import {DEFAULT_SHADCN_BASE_URL, toShadcnItem} from './shadcn'
```

Add beside `outputDirectories`:

```ts
/**
 * Committed for the same reason `r/` is — a guard can only compare bytes it can
 * see — and generated into the docs app, which is what actually serves them.
 */
export const shadcnOutputDirectories = (packageRoot: string): string[] => [
  join(packageRoot, '..', '..', 's'),
  join(packageRoot, '..', '..', 'apps', 'docs', 'public', 's'),
]
```

In `main`, after the existing `documents` map is built, add:

```ts
// Overridable so the shadcn smoke test can install from a local server: the
// cross-references live inside the documents, so a build serving localhost
// has to say localhost.
const shadcnBaseUrl = process.env.NAT_UI_SHADCN_BASE_URL ?? DEFAULT_SHADCN_BASE_URL
const known = new Set(items.map((item) => item.name))
// Looked up by name rather than by index. `payloads` happens to be in the
// same order as a re-sorted `items` today, and pairing them positionally
// would silently mis-associate every document the day either sort changes.
const payloadsByName = new Map(payloads.map((payload) => [payload.name, payload] as const))
const shadcnDocuments = new Map<string, string>(
  [...items].sort(byName).map((item): [string, string] => {
    const payload = payloadsByName.get(item.name)
    if (payload === undefined) throw new Error(`No payload was built for "${item.name}".`)

    return [`${item.name}.json`, serialize(toShadcnItem(item, payload, shadcnBaseUrl, known))]
  }),
)
```

Then, after the existing write loop, add a second one:

```ts
for (const outputDir of shadcnOutputDirectories(packageRoot)) {
  await rm(outputDir, {recursive: true, force: true})
  await mkdir(outputDir, {recursive: true})

  for (const [name, document] of shadcnDocuments) {
    await writeFile(join(outputDir, name), document)
  }
}
```

Update the final log line to mention both:

```ts
console.log(`Wrote ${String(payloads.length)} registry item(s) to r/ and s/.`)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/registry/scripts/build-registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Ignore the generated copy**

In `.gitignore`, below the existing `apps/docs/public/r/` entry:

```
apps/docs/public/s/
```

- [ ] **Step 6: Build and inspect the output**

Run: `pnpm build && cat s/button.json`
Expected: a document beginning `"$schema": "https://ui.shadcn.com/schema/registry-item.json"`, with `"type": "registry:ui"`, a `title`, a `description`, and `"registryDependencies": ["https://nat-ui-delta.vercel.app/s/motion.json"]`.

Run: `git status --short s apps/docs/public`
Expected: `s/button.json` and `s/motion.json` untracked; nothing under `apps/docs/public`.

Run: `git diff --stat -- r`
Expected: empty. `/r/` still must not move.

- [ ] **Step 7: Commit**

```bash
git add .gitignore packages/registry/scripts/build-registry.ts packages/registry/scripts/build-registry.test.ts s
git commit -m "feat(registry): serve the shadcn format at /s"
```

---

### Task 4: Guard the output and prove a real shadcn install works

A unit test proves the mapping is what we intended; only shadcn's own CLI proves it is what shadcn accepts. This task adds both the byte guard and an end-to-end install.

**Files:**

- Modify: `.github/workflows/ci.yml:66` (the `r` guard)
- Modify: `.github/workflows/ci.yml:111-170` (a new job beside `smoke-build`)

**Interfaces:**

- Consumes: the `NAT_UI_SHADCN_BASE_URL` environment variable read in Task 3.

- [ ] **Step 1: Extend the byte guard**

In `.github/workflows/ci.yml`, change the existing guard line from `- run: git diff --exit-code -- r` to:

```yaml
- run: git diff --exit-code -- r s
```

Update the comment directly above it to mention both trees:

```yaml
# r/ and s/ are generated by the build above and committed so GitHub raw
# can serve them, and so a reviewer sees what the registry will publish.
# Regenerating without rebuilding would leave the published registries
# describing components that no longer exist.
```

- [ ] **Step 2: Add the shadcn smoke job**

Append to `.github/workflows/ci.yml`, at the same indentation as `smoke-build`:

```yaml
smoke-shadcn:
  runs-on: ubuntu-latest

  steps:
    - uses: actions/checkout@v7
      with:
        persist-credentials: false

    - uses: pnpm/action-setup@v6

    - uses: actions/setup-node@v7
      with:
        node-version: '24'
        cache: pnpm

    - run: pnpm install --frozen-lockfile

    # Rebuilt against the local server, because a component's
    # registryDependencies are absolute URLs baked into the document. A
    # default build would send shadcn to production for `motion` and this job
    # would pass without ever testing the motion item it just built.
    - run: pnpm build
      env:
        NAT_UI_SHADCN_BASE_URL: http://localhost:8420

    - run: |
        npx --yes serve s --listen 8420 > "$RUNNER_TEMP/serve.log" 2>&1 < /dev/null &
        npx --yes wait-on http://localhost:8420/button.json --timeout 30000 ||
          { cat "$RUNNER_TEMP/serve.log"; exit 1; }

    - run: pnpm --package=create-next-app@latest dlx create-next-app consumer
        --ts --tailwind --app --no-eslint --no-src-dir
        --import-alias "@/*" --use-pnpm --yes
      working-directory: ${{ runner.temp }}

    # shadcn's own init, not nat-ui's. The whole point of this job is the path
    # taken by someone who has never heard of the nat-ui CLI.
    - run: pnpm dlx shadcn@latest init -b base -p nova --yes
      working-directory: ${{ runner.temp }}/consumer

    - run: pnpm dlx shadcn@latest add http://localhost:8420/button.json --yes
      working-directory: ${{ runner.temp }}/consumer

    # Both files of the item, and the lib item it depends on, must have
    # arrived. shadcn resolving the item but silently skipping its
    # registryDependencies is the failure this catches.
    - run: |
        test -f components/ui/button.tsx
        test -f components/ui/button-variants.tsx
        test -f lib/motion.ts
        test -f lib/use-motion.ts
      working-directory: ${{ runner.temp }}/consumer

    - run: |
        cat <<'EOF' > app/page.tsx
        import {Button} from '@/components/ui/button'

        export default function Home() {
          return <Button animation='bouncy'>Press</Button>
        }
        EOF
      working-directory: ${{ runner.temp }}/consumer

    - run: pnpm build
      working-directory: ${{ runner.temp }}/consumer
```

- [ ] **Step 3: Verify the workflow parses**

Run: `npx --yes yaml-lint .github/workflows/ci.yml` (or `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"`)
Expected: no errors.

- [ ] **Step 4: Rehearse the install locally before trusting CI**

```bash
NAT_UI_SHADCN_BASE_URL=http://localhost:8420 pnpm build
npx --yes serve s --listen 8420 &
cd "$(mktemp -d)"
pnpm --package=create-next-app@latest dlx create-next-app consumer --ts --tailwind --app --no-eslint --no-src-dir --import-alias "@/*" --use-pnpm --yes
cd consumer
pnpm dlx shadcn@latest init -b base -p nova --yes
pnpm dlx shadcn@latest add http://localhost:8420/button.json --yes
ls components/ui lib
```

Expected: `button.tsx`, `button-variants.tsx` under `components/ui`, and `motion.ts`, `use-motion.ts` under `lib`.

If shadcn rejects the document, the error names the offending field — fix `toShadcnItem` in Task 2's file, re-run its unit tests, and rebuild. Do not weaken the unit tests to match a guess.

Afterwards: `kill %1` to stop the server, and rebuild with defaults so the committed `s/` is not left pointing at localhost:

```bash
cd - && pnpm build && git diff --stat -- s
```

Expected: empty.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: guard the shadcn output and install it with shadcn's own CLI"
```

---

### Task 5: Document the shadcn install path, and release

The landing page rewrite belongs to plan 4. This task does the minimum that makes the new path discoverable: the installation page gains it, and the changeset explains it.

**Files:**

- Modify: `apps/docs/content/docs/installation.mdx`
- Create: `.changeset/<two-words-verb>.md`

- [ ] **Step 1: Add the shadcn path to the installation page**

Add a section to `apps/docs/content/docs/installation.mdx`, above the existing nat-ui CLI instructions:

````mdx
## With the shadcn CLI

If you already have a shadcn project, you do not need the nat-ui CLI. Every
component is published in shadcn's registry format as well:

```bash
npx shadcn@latest add https://nat-ui-delta.vercel.app/s/button.json
```

To install by name instead, add the namespace to your `components.json` once:

```json
{
  "registries": {
    "@nat-ui": "https://nat-ui-delta.vercel.app/s/{name}.json"
  }
}
```

```bash
npx shadcn@latest add @nat-ui/button
```

Components arrive as source in your project either way. The nat-ui CLI remains
the better option for a new project, where `init` writing theme tokens and
`components.json` is a service rather than an intrusion.
````

- [ ] **Step 2: Verify the docs build and coverage guard**

Run: `pnpm build:docs`
Expected: builds; no error from the coverage test about an undocumented item.

- [ ] **Step 3: Write the changeset**

Create `.changeset/<two-words-verb>.md`:

```md
---
'@nat-ui/cli': patch
---

Publishes every registry item in shadcn's `registry-item` format at
`/s/{name}.json`, so an existing shadcn project can install nat-ui components
with `npx shadcn add` and never install the nat-ui CLI at all.

The nat-ui format at `/r/{name}.json` is unchanged byte-for-byte — published
CLIs bake that URL into their bundle — and the two formats are serialised from
one in-memory item list, so they cannot drift.

Cross-references between items are absolute URLs rather than namespaced names,
because a namespaced reference only resolves once the user has configured the
namespace in `components.json`, and the install path most people take is a bare
URL with no configuration at all.
```

- [ ] **Step 4: Full gate**

Run: `pnpm build && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check && pnpm build:docs`
Expected: all pass.

Run: `git diff --exit-code -- r s`
Expected: empty — nothing left pointing at localhost from Task 4's rehearsal.

- [ ] **Step 5: Commit**

```bash
git add apps/docs/content/docs/installation.mdx .changeset
git commit -m "docs: document installing nat-ui through the shadcn CLI"
```

---

## Notes for the implementer

**What is deliberately not here.**

There is no `/s/registry.json` index. shadcn resolves both a bare URL and a
namespaced `@nat-ui/name` by fetching the item document directly, so an index
would be a file nothing reads. Add one when something needs to enumerate the
registry, which is plan 4's problem if it is anyone's.

There is no `cssVars` on the motion item, despite the spec mentioning it. The
motion layer currently ships no stylesheet custom properties — `--press-scale`
is written inline per element by `pressStyle`, precisely so a component works
the moment it is copied in, including through a CLI that never runs nat-ui's
`init`. If a future component needs a theme-level variable, `cssVars` is where
it goes.

**The risk worth watching.** shadcn's `registry-item` format is not ours to
control, and Task 4's smoke job is the only thing that will tell us when it
changes. If that job starts failing without a change on our side, read the
error before assuming it is flaky: it is doing exactly its job.
