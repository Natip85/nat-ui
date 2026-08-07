# Reach and `add --all` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shadcn install path visible where people actually arrive, give `@nat-ui/cli` an npm page, and add `nat-ui add --all`.

**Architecture:** Three independent pieces of work that happen to share a release. Nothing here changes the registry, the schemas, or the generated `r/` and `s/` documents.

**Tech Stack:** TypeScript, Node's `parseArgs`, Vitest, Next.js 16, Fumadocs, MDX.

## Why this exists

Plan 2 shipped a second install path — an existing shadcn project can run `npx shadcn@latest add <url>` and never touch the nat-ui CLI. An audit afterwards found the word "shadcn" appears in exactly one page of the site, `/docs/installation`. It is absent from the home page, every component page, the docs index, the CLI page, the navigation, and the README.

The component page is the sharp end. It is where search traffic lands, and its install block currently opens by telling the reader that `@nat-ui/cli init` "has already run in this project" — which for a shadcn user is not merely unhelpful but wrong, and describes exactly the friction plan 2 removed. That is a correctness problem, not a marketing one, which is why it is not waiting for plan 4's landing rewrite.

Two smaller things ride along: `@nat-ui/cli` has no README, so its npm page is blank (`npm view @nat-ui/cli readme` returns `ERROR: No README data found!`), and there is no way to install every component at once.

## Global Constraints

- Prettier: `semi: false`, `singleQuote: true`, `jsxSingleQuote: true`, `bracketSpacing: false`, `trailingComma: "all"`, `arrowParens: "always"`, `printWidth: 100`, `tabWidth: 2`. Write code in this style directly.
- `REGISTRY_SCHEMA_VERSION` stays `'1'`. Do not add keys to `registryItemSchema` or `registryItemPayloadSchema`.
- **Nothing in this plan changes `r/` or `s/`.** `git diff --exit-code -- r s` must be empty in every task. No component source is touched.
- The published site is `https://nat-ui-delta.vercel.app`, available as `siteUrl` from `apps/docs/lib/shared.ts`. The nat-ui registry is at `/r`, the shadcn one at `/s`. Never hardcode the URL in a docs component — import `siteUrl`.
- The CLI package name is available as `cliPackage` from `apps/docs/lib/shared.ts`. Never hardcode `@nat-ui/cli` in a docs component.
- Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm format:check` before every commit. Tasks touching `apps/docs` also run `pnpm build:docs`.

## Decisions already made

- The command is a flag, `nat-ui add --all`, not a positional `add all`. Item names match `/^[a-z0-9]+(-[a-z0-9]+)*$/`, so `all` is a legal registry name and a positional would shadow it permanently. A flag also matches `--yes` and `--overwrite`.
- `--all` installs **every item in the registry, libraries included** — not only `ui` items. `motion` would arrive anyway as a dependency of `button`, but the literal reading is the one that will not surprise anyone, and a library nothing yet depends on still gets installed.

---

### Task 1: `nat-ui add --all`

**Files:**

- Modify: `packages/cli/src/index.ts` — the `help` string, the `parseArgs` options, and the `add` branch
- Modify: `packages/cli/src/commands/add.ts` — the options type and the empty-names guard
- Test: `packages/cli/src/commands/add.test.ts`
- Test: `packages/cli/src/index.test.ts`

**Interfaces:**

- Consumes: `fetchIndex(baseUrl, fetchJson)` from `packages/cli/src/registry/fetch-item.ts`, already imported by `add.ts` and already used at `add.ts:46` to list available names in an error message. It returns a `RegistryIndex`, whose `items` is an array of `{name, type}`.
- Produces: `AddOptions` gains `all: boolean`. `add()` resolves names from the index when `all` is true.

- [ ] **Step 1: Write the failing tests**

Add to `packages/cli/src/commands/add.test.ts`, following the file's existing fixture style for a served registry:

```ts
test('--all installs every item the registry lists', async () => {
  const io = ioServing({
    'https://r.test/index.json': {
      schemaVersion: '1',
      items: [
        {name: 'button', type: 'ui'},
        {name: 'motion', type: 'lib'},
      ],
    },
    'https://r.test/button.json': buttonPayload,
    'https://r.test/motion.json': motionPayload,
  })

  const code = await add(io, {
    names: [],
    all: true,
    yes: true,
    overwrite: false,
    registry: 'https://r.test',
  })

  expect(code).toBe(0)
  expect(io.written()).toContain('components/ui/button.tsx')
  expect(io.written()).toContain('lib/motion.ts')
})

test('--all and a named component together are a usage error', async () => {
  const io = ioServing({})

  const code = await add(io, {
    names: ['button'],
    all: true,
    yes: true,
    overwrite: false,
    registry: 'https://r.test',
  })

  expect(code).toBe(1)
  expect(io.logged()).toMatch(/--all/)
})

test('--all on an empty registry says so rather than succeeding silently', async () => {
  const io = ioServing({
    'https://r.test/index.json': {schemaVersion: '1', items: []},
  })

  const code = await add(io, {
    names: [],
    all: true,
    yes: true,
    overwrite: false,
    registry: 'https://r.test',
  })

  expect(code).toBe(1)
  expect(io.logged()).toMatch(/no components/i)
})
```

Read the existing tests in this file first and match their helper names and fixture shape exactly — the helper names above (`ioServing`, `io.written()`, `io.logged()`, `buttonPayload`, `motionPayload`) are illustrative. Use whatever the file already provides rather than introducing new helpers.

Add to `packages/cli/src/index.test.ts`:

```ts
test('add --all reaches the command with all set', async () => {
  // The flag has to survive parseArgs and arrive as an option, which is the
  // one thing a test of `add` itself cannot cover.
  const lines: string[] = []
  const code = await run(['add', '--all', '--registry', 'https://r.test'], (message) => {
    lines.push(message)
  })

  expect(code).not.toBe(0)
  expect(lines.join('\n')).not.toMatch(/Unknown option/)
})

test('the help text documents --all', () => {
  expect(help).toMatch(/--all/)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/commands/add.test.ts packages/cli/src/index.test.ts`
Expected: FAIL — `all` is not a property of the options type, and `parseArgs` rejects `--all` as an unknown option.

- [ ] **Step 3: Parse the flag**

In `packages/cli/src/index.ts`, add `all` to the `values` type:

```ts
let values: {
  yes: boolean
  overwrite: boolean
  all: boolean
  registry?: string | undefined
  version: boolean
  help: boolean
}
```

Add it to the `parseArgs` options, beside `overwrite`:

```ts
        all: {type: 'boolean', default: false},
```

Pass it through in the `add` branch, beside `overwrite`:

```ts
        all: values.all ?? false,
```

Add the line to the `help` string, between `--overwrite` and `--registry` so the options stay in the order they are explained:

```
        --all            Add every item in the registry, libraries included
```

`init` already refuses `--overwrite` and `--registry`; extend that guard to `--all` so a stray flag is an error rather than silently ignored:

```ts
    if (values.overwrite === true || values.all === true || values.registry !== undefined) {
      log(`init takes none of --overwrite, --all or --registry.\n${help}`)
```

- [ ] **Step 4: Resolve the names**

In `packages/cli/src/commands/add.ts`, add `all: boolean` to the options type beside `names`.

Replace the empty-names guard (currently at `add.ts:58`) so it handles both flags. `--all` and explicit names together are a usage error, because obeying one means ignoring the other and silently picking is worse than refusing:

```ts
if (options.all && options.names.length > 0) {
  io.log('Pass either --all or component names, not both.')

  return 1
}

const requested = options.all
  ? (await fetchIndex(baseUrl, io.fetchJson)).items.map((entry) => entry.name)
  : options.names

if (requested.length === 0) {
  io.log(
    options.all
      ? 'The registry lists no components.'
      : await withAvailable(baseUrl, io, 'Name at least one component to add.'),
  )

  return 1
}
```

Then use `requested` in place of `options.names` for the remaining two uses in this function — the `assertValidItemName` loop (`add.ts:65`) and the `resolveItems` call (`add.ts:96`).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/commands/add.test.ts packages/cli/src/index.test.ts`
Expected: PASS, including every test that was already in both files.

- [ ] **Step 6: Try it against the real registry**

```bash
pnpm build
cd "$(mktemp -d)"
pnpm --package=create-next-app@latest dlx create-next-app consumer --ts --tailwind --app --no-eslint --no-src-dir --import-alias "@/*" --use-pnpm --yes
cd consumer
node /path/to/nat-ui/packages/cli/dist/index.js init --yes
node /path/to/nat-ui/packages/cli/dist/index.js add --all --yes
ls components/ui lib
```

Expected: `button.tsx` and `button-variants.tsx` under `components/ui`, and `motion.ts` and `use-motion.ts` under `lib`. Substitute the real absolute path to this repository for `/path/to/nat-ui`.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src
git commit -m "feat(cli): add --all to install every component in the registry"
```

---

### Task 2: Give `@nat-ui/cli` an npm page

`npm view @nat-ui/cli readme` returns `ERROR: No README data found!`, so the package page on npm is blank. npm always publishes `README.md` from the package root regardless of the `files` array, so creating the file is the whole fix.

**Files:**

- Create: `packages/cli/README.md`

- [ ] **Step 1: Confirm the gap**

Run: `npm view @nat-ui/cli readme`
Expected: `ERROR: No README data found!`

Run: `ls packages/cli/README.md`
Expected: no such file.

- [ ] **Step 2: Write the README**

Create `packages/cli/README.md`. Read the root `README.md` first and match its voice — this is a second front door to the same project, not a different project.

````md
# @nat-ui/cli

Add [nat-ui](https://nat-ui-delta.vercel.app) components to your project as
source you own.

## You may not need this

If your project already uses shadcn, install components with the CLI you have:

```bash
npx shadcn@latest add https://nat-ui-delta.vercel.app/s/button.json
```
````

Every component is published in shadcn's registry format as well as nat-ui's.
This CLI is the better option for a new project, where `init` writing theme
tokens and `components.json` is a service rather than an intrusion.

## Usage

```bash
npx @nat-ui/cli@latest init
npx @nat-ui/cli@latest add button
```

`init` configures the project once: it finds your stylesheet, writes
`components.json` from your detected aliases, creates the `cn` helper, adds the
theme variables, and installs `clsx` and `tailwind-merge`.

`add` reads that config, so components land where you already keep things with
their imports rewritten to your aliases. Dependencies come with them.

```bash
npx @nat-ui/cli@latest add --all
```

## Options

| Option             | Effect                                             |
| ------------------ | -------------------------------------------------- |
| `-y`, `--yes`      | Accept every default without asking                |
| `--overwrite`      | Replace files that already exist                   |
| `--all`            | Add every item in the registry, libraries included |
| `--registry <url>` | Fetch from a different registry                    |
| `-v`, `--version`  | Print the version                                  |
| `-h`, `--help`     | Show usage                                         |

`--yes` and `--overwrite` are not two ways of saying the same thing. `--yes`
accepts defaults, and keeping the file you already have is the default, so
`--yes` answers _no_ to the overwrite question. `--overwrite` is what answers
yes.

## Documentation

Full documentation is at
[nat-ui-delta.vercel.app/docs](https://nat-ui-delta.vercel.app/docs).

## Licence

MIT

````

Check the repository's licence before writing the last line — read the `license` field in `packages/cli/package.json` and match it rather than assuming MIT.

- [ ] **Step 3: Verify what npm would publish**

Run: `cd packages/cli && npm pack --dry-run 2>&1 | grep -i readme`
Expected: `README.md` appears in the file list, even though `files` does not name it.

- [ ] **Step 4: Check every command in it actually works**

Every command in a README is a promise. Run each of these and confirm the output matches what the README claims:

```bash
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js --version
````

The options table must match the `help` string in `packages/cli/src/index.ts` exactly — same flags, same descriptions, nothing missing and nothing invented. If they disagree, the `help` string is the source of truth.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/README.md
git commit -m "docs(cli): give the package a readme so npm has a page"
```

---

### Task 3: Offer the shadcn command on every component page

This is the correctness fix. The install block on a component page currently opens by asserting that `@nat-ui/cli init` has already run, which is false for the audience plan 2 was built for.

**Files:**

- Modify: `apps/docs/components/component-installation.tsx`

**Interfaces:**

- Consumes: `siteUrl` and `cliPackage` from `apps/docs/lib/shared.ts`; `CommandTabs` and `executeCommands` as already imported by this file.
- Produces: a three-tab install block — `shadcn`, `nat-ui CLI`, `Manual`.

- [ ] **Step 1: Read what is there**

Read `apps/docs/components/component-installation.tsx` in full, and `apps/docs/components/command-tabs.tsx` to see what `CommandTabs` and `executeCommands` do. `CommandTabs` takes `{commands: Record<PackageManager, string>}` and renders a tab per package manager. `executeCommands` turns one command string into that record.

Note that this component is an async server component that already resolves the item's payloads, so it knows the item's files and dependencies.

- [ ] **Step 2: Rewrite the preamble and the tabs**

Replace the `<p>` preamble and the `<Tabs>` block. The preamble must no longer assert that `init` has run — it now says which route needs what:

```tsx
      <p>
        Install with whichever CLI your project already has. The{' '}
        <Link href='/docs/installation'>nat-ui CLI</Link> and manual routes assume{' '}
        <code>{`${cliPackage} init`}</code> has run, because the files below import <code>cn</code>{' '}
        from your utils alias and are styled against the theme tokens it writes. The shadcn route
        needs none of that — <code>shadcn init</code> has already written both.
      </p>

      <Tabs items={['shadcn', 'nat-ui CLI', 'Manual']}>
        <Tab value='shadcn'>
          <CommandTabs commands={executeCommands(`shadcn@latest add ${siteUrl}/s/${item}.json`)} />
        </Tab>

        <Tab value='nat-ui CLI'>
          <CommandTabs commands={executeCommands(`${cliPackage}@latest add ${item}`)} />
        </Tab>

        <Tab value='Manual'>{/* unchanged */}</Tab>
      </Tabs>
```

Leave the entire `Manual` tab body exactly as it is. Add `siteUrl` to the existing import from `@/lib/shared`.

The shadcn tab goes first deliberately: most visitors arriving at a component page already have a shadcn project, and the first tab is the one people read.

- [ ] **Step 3: Update the file's doc comment**

The comment above the component says "Two routes to the same result. The CLI is the one to reach for". That is now wrong in both halves. Rewrite it to describe three routes and say which is for whom, keeping the existing point about everything being derived from the built registry.

- [ ] **Step 4: Verify in a browser**

Run: `pnpm --filter @nat-ui/docs dev`

Open `http://localhost:3000/components/button` and confirm: three tabs in that order, the shadcn tab shows `npx shadcn@latest add https://nat-ui-delta.vercel.app/s/button.json`, the package-manager sub-tabs work inside each, and the preamble reads correctly. Stop the server afterwards.

- [ ] **Step 5: Gate**

Run: `pnpm lint && pnpm typecheck && pnpm format:check && pnpm build:docs`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/docs/components/component-installation.tsx
git commit -m "docs: offer the shadcn install command on every component page"
```

---

### Task 4: The repository's own front door, and the release

**Files:**

- Modify: `README.md` (repository root)
- Modify: `apps/docs/content/docs/cli.mdx`
- Create: `.changeset/<two-words-verb>.md`

- [ ] **Step 1: Add the shadcn route to the root README**

Read `README.md` and find the "Quick start" block, which currently shows only the nat-ui CLI. Add the shadcn route above it, matching the file's existing voice and heading levels. State plainly that a project already using shadcn does not need this CLI, show `npx shadcn@latest add https://nat-ui-delta.vercel.app/s/button.json`, and keep the existing nat-ui quick start below it under its own heading.

Do not restructure the rest of the README.

- [ ] **Step 2: Document `--all` in the CLI docs**

In `apps/docs/content/docs/cli.mdx`, the `Options` block near line 16 reproduces the CLI's help output. Add the `--all` line to it, in the same position it occupies in the real `help` string, so the page does not drift from the binary.

Then add a short prose section explaining it, in the style of the existing `--overwrite` and `--registry` sections. It must say two things: that `--all` installs every item the registry lists, libraries included, and that passing `--all` together with component names is an error rather than a merge.

Use `<CliCommand args='add --all' />` for the example, matching how every other command on that page is rendered.

- [ ] **Step 3: Write the changeset**

Create `.changeset/<two-words-verb>.md` with a `minor` bump to `@nat-ui/cli`. Pick an unused two-or-three-word hyphenated filename; look at `.changeset/` for the format.

Cover all three changes and why each happened:

```md
---
'@nat-ui/cli': minor
---

Adds `nat-ui add --all`, which installs every item the registry lists,
libraries included. Passing `--all` alongside component names is an error
rather than a merge, since obeying one would mean ignoring the other.

The package now has a README, so its npm page is no longer blank.

Component pages now offer the shadcn install command alongside the nat-ui one.
The install block previously opened by stating that `nat-ui init` had already
run, which is untrue for anyone arriving from an existing shadcn project — the
audience the shadcn registry format was published for.
```

- [ ] **Step 4: Full gate**

Run: `pnpm build && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check && pnpm build:docs`
Expected: all pass.

Run: `git diff --exit-code -- r s`
Expected: empty. Nothing in this plan touches the registry output.

- [ ] **Step 5: Commit**

```bash
git add README.md apps/docs/content/docs/cli.mdx .changeset
git commit -m "docs: document --all and the shadcn install route"
```

---

## Notes for the implementer

**What is deliberately not here.** The home page still leads with the nat-ui CLI and does not mention shadcn, and the docs index cards still frame installation as `init`. Both belong to plan 4's landing rewrite, which reconsiders the whole page rather than appending to it. This plan fixes only the surface that is actively misleading — the component install block — plus the two front doors that cost nothing to correct.

**The trap in Task 1.** `add` resolves dependencies itself, so `--all` passing every name to `resolveItems` is not wasteful — the resolver deduplicates. Do not try to filter the index down to items nothing depends on; that is a different behaviour and a slower one.

**The trap in Task 3.** `executeCommands` builds `npx`, `pnpm dlx`, `yarn dlx` and `bunx` forms of one command. Pass it `shadcn@latest add <url>` and it produces all four correctly. Do not hand it a string that already starts with `npx`.

## Follow-up this plan deliberately leaves open

The component page now tells every reader that the shadcn route needs no setup, because `shadcn init` writes both the `cn` helper and the theme tokens. That is true today only because every class in `button-variants.tsx` maps onto a token shadcn's default theme ships — and it is true only because an earlier commit stopped the destructive variant using `--destructive-foreground`, which shadcn does not define.

Nothing enforces this. A future component that references a token shadcn lacks will silently turn that sentence into a promise the product does not keep, and it will fail as unstyled text in someone else's project rather than as a failing build in ours.

The guard: collect the `--` custom properties referenced by each `*-variants.tsx`, and assert every one appears in a captured list of shadcn's default `:root` tokens. It belongs in CI, and it should land before or alongside the next component added to the registry.
