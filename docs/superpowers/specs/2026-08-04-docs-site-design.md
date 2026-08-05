# The documentation site

Date: 2026-08-04
Status: approved, not yet implemented

## Goal

Build `apps/docs`: a Fumadocs site that documents every nat-ui component with a
live preview, and serves the registry alongside those docs.

The CLI is finished enough to be useful — `init` and `add` both ship, and
`@nat-ui/cli@0.2.0` is on npm. What is missing is not capability but discovery.
Nobody can see a component before installing it, and the only human-readable
description of the set is one line of the README naming three components.

The registry is also served from `raw.githubusercontent.com`, which is rate
limited, cached on GitHub's terms, and not something this project controls.
A documentation site is the natural host, which is why
`packages/cli/src/registry/base-url.ts` has said since it was written that "the
documentation site can take this over later by changing this default."

This design builds the site and has it serve the registry. It does not change
the default. See "The URL migration is not in this work."

## Scope

In scope:

- `apps/docs`: a Next.js 16 app using Fumadocs UI, deployed to Vercel.
- A home page with a single hero section.
- A global navigation bar — Home, Docs, Components, search, theme toggle.
- Two sidebar roots under a shared layout: guides and components.
- A component page per registry item, with a live preview, a code tab, and the
  install command.
- Serving the built registry from the site at `/r`, in addition to the existing
  committed `r/` at the repository root.
- Three CI guards: a dependency-declaration check, a docs coverage check, and a
  smoke build that proves CLI output compiles.
- A `pnpm new:component <name>` scaffold.

Out of scope, deliberately:

- **Changing `DEFAULT_REGISTRY_URL`.** Explained below.
- **Registry schema changes.** Explained below.
- **New components.** The site documents the three that exist. Growing the set
  is its own work, and this design exists partly to make that work cheap.
- Blocks, charts, example applications, and a theme customiser. All are pages
  on top of a shell rather than changes to it, so none of them constrain this
  design. The customiser is blocked regardless: `presets.ts` implements two of
  the five base colours the schema accepts, so it would have two entries.
- Per-framework installation guides. shadcn ships ten. The CLI detects Next.js
  and falls back to a generic path, so there are one and a half to write, and
  they are prose in `content/docs/` whenever someone wants them.
- An MCP server, a v0 integration, a Figma kit, and a community registry
  directory. Additive, and none of them apply at three components.
- `list`, `search`, `diff`, and `update` commands. The site answers the
  discovery question these would answer, from a browser.

## Why now, and why the extras are deferred

shadcn's site today carries roughly sixty components, ten installation guides,
CLI and `components.json` references, theming and typeset guides, a changelog,
a colours page, a theme customiser, blocks, charts, example apps, a registry
directory, AI skills, an MCP server, v0 integration, and `llms.txt`. Cloning
that surface at three components is building empty rooms.

The pieces divide cleanly. Some are expensive to retrofit because they shape
the architecture: how previews reach the real component source, and how the
registry is served. Those are settled here. The rest — every item in the "out
of scope" list — is content layered onto a shell that will already exist, and
can arrive in any order without rework.

So this design is a complete site for the components that exist, built so the
rest bolts on. Not a scaffold, and not a clone.

## The registry schema does not change

The obvious way to drive a docs site from the registry is to add `title`,
`description`, and `categories` to `registryItemSchema`. That would be a
breaking change for every user already installed.

`registryItemSchema` is a `z.strictObject`, and `registryItemPayloadSchema`
extends it, so strictness carries through to the wire format. The schema is
compiled into the published CLI bundle by tsup — `@nat-ui/cli@0.2.0` is
carrying its own copy right now. The moment `r/button.json` grows a
`description` key, every 0.2.0 client rejects the item on an unrecognised key,
and `add button` stops working for anyone who has not upgraded.

It is also unnecessary. The docs site lives in this monorepo, so it can import
`items` from `@nat-ui/registry` at build time; the metadata never needs to
cross the network. And Fumadocs already wants `title` and `description` in MDX
frontmatter, which makes the docs pages the natural home for them.

So the schema is untouched, `schemaVersion` stays `'1'`, and every published
CLI keeps working. The cost is that the registry and the docs pages are two
lists that must agree, which the coverage guard below enforces.

If a future `nat-ui list` needs descriptions over the wire, that is a
deliberate `schemaVersion: '2'` with a real reason behind it, and old clients
will fail on the version literal with a clear message rather than on a
confusing unrecognised-key error.

## The URL migration is not in this work

> **Superseded on 2026-08-05.** `DEFAULT_REGISTRY_URL` now points at
> `https://nat-ui-delta.vercel.app/r`. The reasoning below missed that the CLI
> fetches with `fetch`, which follows redirects, so pointing the Vercel project
> at a real domain later keeps these installs working without a second
> migration. What has to outlive every other decision is therefore not the
> hostname but the Vercel project keeping its name: renaming or deleting it
> strands those clients, because nothing redirects from the old subdomain. The
> conclusion about the committed `r/` was right and still holds — it is what
> keeps 0.1.0 and 0.2.0 working. See `packages/cli/src/registry/base-url.ts`.

There is no domain yet. The site will deploy to a Vercel hobby project under a
`.vercel.app` hostname until a real domain is bought.

A `.vercel.app` hostname must never become the canonical registry URL. Every
published CLI version bakes `DEFAULT_REGISTRY_URL` into its bundle, and old
binaries cannot be changed, so that URL has to outlive every other decision in
this project.

Therefore the site serves `/r` from the first deploy, but `DEFAULT_REGISTRY_URL`
keeps pointing at GitHub raw. The served copy is reachable and testable through
the two overrides that already exist and already ship in 0.2.0:

```bash
nat-ui add button --registry https://<project>.vercel.app/r
NAT_UI_REGISTRY_URL=https://<project>.vercel.app/r nat-ui add button
```

When a real domain lands, flipping the default is one line in `base-url.ts` and
a release — by which point the path will have been serving production traffic
for weeks. The committed `r/` at the repository root stays committed
permanently regardless, so `raw.githubusercontent.com` keeps serving every
client already in the wild. Two URLs, one generated source, nobody breaks.

## Architecture

### The application

`apps/docs` is a Next.js 16 App Router application using Fumadocs UI 16.14,
Fumadocs MDX 15.2, and Tailwind v4. All four are added to the workspace
catalog, so they are pinned the same way as everything else.

The package is named `@nat-ui/docs` and is `"private": true`. It is never
published; Vercel builds it from the repository. Every path below written as
`content/...` or `components/...` is relative to `apps/docs/`.

Peer requirements line up with the catalog as it stands: `fumadocs-ui@16.14.0`
requires `next: 16.x.x` and `react: ^19.2.0`, and the catalog already carries
`react@^19.2.8` and `react-dom@^19.2.8`.

`pnpm-workspace.yaml` already globs `apps/*`, `.gitignore` already ignores
`.next/`, `.vercel/`, `out/`, and `apps/docs/public/r/`, `eslint.config.ts`
already ignores `apps/docs/public/r/**`, and `vitest.config.ts` already
excludes `**/.next/**`. The slot was carved when the repository was set up; this
fills it.

### Layouts and navigation

Two Fumadocs layouts share one `baseOptions` object, so the navigation bar is
defined once and appears everywhere:

- `HomeLayout` from `fumadocs-ui/layouts/home` wraps `/`.
- `DocsLayout` wraps `/docs` and `/components`.

`baseOptions` carries the Home, Docs, and Components links. Search and the
theme toggle come from `RootProvider`: search is Fumadocs' built-in static
Orama index, which needs no external service and no API key, and the toggle is
`ThemeSwitch` from `fumadocs-ui/layouts/shared/slots/theme-switch`.

### Two sidebar roots

Guides and components are two separate Fumadocs collections, each declared with
its own `defineDocs` in `source.config.ts`, each wrapped in its own `loader()`
with its own `baseUrl`, and each served by its own catch-all route. That gives
`/docs/<slug>` and `/components/<slug>` as distinct URL trees, with a distinct
sidebar per tree, under the navigation bar and search they share through
`baseOptions`.

Two collections rather than one collection containing two folders marked
`"root": true`. The `root` flag produces a sidebar _switcher_ inside a single
`/docs` tree, which would put the components under `/docs/components` and
reach them through a dropdown. Separate top-level paths were the requirement.

Each collection's `meta.json` uses the `"..."` rest entry after any explicit
ordering, so a new MDX file appears in the sidebar without anyone editing the
manifest.

### How previews reach the real component

`@nat-ui/registry` gains an `exports` map and drops `"private": true`, and
`apps/docs` depends on it as `workspace:*`. Demo files in the docs app import
components from the registry and render them live.

Three options were considered.

**Importing canonical source**, as described, cannot drift: the existing
`git diff --exit-code -- r` guard already proves `r/` matches the source the
docs import. Iteration is a hot reload. What it does not prove is that the
CLI's transforms produce code that builds in a real project.

**Dogfooding the CLI on the docs app** — giving `apps/docs` its own
`components.json` and letting `nat-ui add` write into it — proves the most,
because the site would render exactly what a user receives. It costs a
rebuild-and-re-add cycle on every component edit, commits every component
twice, and has a chicken-and-egg problem on first build. Worth noting that
shadcn does not do this either; their site imports from `registry/new-york/ui/*`
by alias.

**The hybrid** is chosen: import canonical source for the site, and prove the
CLI separately in CI with a smoke build. It buys the dogfooding guarantee
without paying its friction on every edit.

The one bug class the hybrid could still hide is an undeclared npm dependency,
and the dependency guard below closes it directly and more cheaply than any
wiring choice could.

### A collision to rule out first

Fumadocs UI ships its own Tailwind theme, and nat-ui components style against
`--primary`, `--ring`, and similar tokens written by `init`. Fumadocs
namespaces its own tokens as `--color-fd-*`, apparently for exactly this
reason, so the two should coexist. This is the first thing the implementation
proves rather than assumes, because every component preview depends on it.

## Registry hosting

`build-registry.ts` writes its output to two places:

- `r/` at the repository root — committed, unchanged, guarded by
  `git diff --exit-code -- r`, and served by GitHub raw for existing clients.
- `apps/docs/public/r/` — generated, gitignored, served by the site.

Next serves the second with explicit long-lived cache headers configured in
`next.config`, which is control GitHub raw never offered.

The two copies are byte-identical because one function writes both. Nothing
compares them, because there is nothing to compare: a single serialisation runs
twice.

## Content

### Guides

`content/docs/` holds prose: an introduction, installation, a CLI reference, a
`components.json` reference, and theming. This is largely a migration of what
the README already says, which lets the README shrink to a pointer.

### Component pages

`content/components/` holds one MDX page per registry item. Frontmatter carries
`title` and `description` — the metadata that is deliberately not in the
schema. The body is short:

- `<ComponentPreview name="button-demo" />`
- the install command, `npx @nat-ui/cli add button`
- a usage snippet
- a props and variants table, hand-written

### `ComponentPreview`

An async server component taking a demo name. It:

1. looks the name up in an explicit map at `components/demos/registry.ts` —
   explicit because a dynamic import on a variable path does not statically
   analyse
2. renders the demo component for the Preview tab
3. reads the demo file's own source from disk at build time for the Code tab
4. reads `r/<name>.json` for the installed source

Showing both sources is deliberate. The demo answers "how do I use this"; the
payload answers "what lands in my project", and being read from the built
registry it is exactly what the CLI would write.

### Home page

A single hero under `HomeLayout`, inheriting the shared navigation bar: a
headline, the one-line pitch already in the README, a copyable
`npx @nat-ui/cli@latest init`, and buttons into Docs and Components. Nothing
below the fold.

## Guards

Three checks, all following the pattern `git diff --exit-code -- r` already
established: make the failure loud, at build time, in CI.

### 1. Dependency declaration

`build-registry.ts` validates item types, file types, dynamic `@/` imports, and
unsupported alias shapes. It does not check that the npm packages a file
imports are declared in that item's `dependencies`.

That gap reaches users. Adding an import of `clsx` to `input.tsx` passes
typecheck and tests, because `packages/registry` carries `clsx` as a
devDependency; it passes `build-registry`; and `r/input.json` ships. A user
runs `nat-ui add input`, the CLI installs only `@base-ui/react` because that is
what the item declares, and their build fails on a missing module.

So `toPayload` gains a check: every bare import specifier in a file must appear
in the item's `dependencies`. `react` and `react-dom` are allowlisted as peers
that consuming projects necessarily already have. Subpath imports resolve to
their package name, so `@base-ui/react/button` satisfies `@base-ui/react`.

This runs on every build, needs no docs app, and would have been worth adding
regardless of this design.

### 2. Docs coverage

Because the schema carries no metadata, the registry and the docs are two lists
that must agree. A Vitest test reads `items` from `@nat-ui/registry`, globs
`content/components/*.mdx`, and reads the demo map, then fails if any of the
three has an entry the others lack.

This is what makes shipping an undocumented component impossible, and it is the
reason the missing schema metadata costs nothing.

### 3. Smoke build

A CI job, alongside `pack-integrity`, that scaffolds a throwaway Next.js
application outside the workspace, runs the built CLI against the local `r/`,
and builds the result.

The 26 existing `add` tests all mock `fetch` and none of them build what they
write, so this is genuinely new signal: React and Base UI resolving together in
a fresh install, Tailwind emitting theme tokens in a project that only ran
`init`, and the `use client` transform behaving in a real build.

Being outside the workspace matters. pnpm gives it an isolated `node_modules`
containing only what the CLI installed, so a missing dependency fails here too.

## `pnpm new:component <name>`

Adding a component touches four places: the source file, the `items` entry, the
MDX page, and the demo. The scaffold generates all four — the page with
frontmatter and its `<ComponentPreview />` already in place — so adding a
component is one command and then real content.

The guards then verify the content is real rather than left as a stub.

## Root scripts

`pnpm build` is `pnpm --recursive build`, which would build a Next.js
application on all three CI matrix jobs, Windows included.

So the root script narrows to the publishable packages, and the docs build
becomes its own script:

```json
"build": "pnpm --filter './packages/*' build",
"build:docs": "pnpm --filter @nat-ui/docs build"
```

The verify matrix stays as fast as it is now, the docs build runs once on
Linux, and Vercel runs `build:docs` itself.

`apps/docs/public/r/` is still produced by the narrowed `pnpm build`, because
`packages/registry` is inside `./packages/*` and its build script writes both
copies. Only the Next.js build is excluded.

## What adding a component looks like afterwards

Automatic: the built registry JSON, both served copies, `/r/<name>.json` going
live on push, `nat-ui add <name>` working, and the sidebar entry.

Manual: the docs page and the demo, generated as stubs by the scaffold and
filled in by hand, because a generated component page would be an empty page.

Unchanged: `pnpm build` must still be run locally and the regenerated
`r/*.json` committed, exactly as today, or `git diff --exit-code -- r` fails.

## Testing

Lint and typecheck pick up `apps/docs` through `projectService` without
configuration.

The coverage guard is a Vitest test. The dependency guard is unit tested
alongside the existing `build-registry` tests. The smoke build is a CI job.

Component demos are not unit tested. They are examples, they are rendered by
every docs build, and the components they exercise already have tests in
`packages/registry`.

## Risks

**Fumadocs and nat-ui token collision.** Rated low, because Fumadocs namespaces
its tokens, but every preview depends on it. Proven first.

**Fumadocs pins `next: 16.x.x`.** A Next major upgrade is gated on Fumadocs
supporting it. Acceptable for a docs site, and worth knowing before it bites.

**CI time.** The smoke build installs a real dependency tree from the network.
It runs as its own job so it cannot slow the verify matrix, and it is the
slowest thing in this design.
