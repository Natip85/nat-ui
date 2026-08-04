# Registry format, `add`, and the first components

Date: 2026-08-04
Status: approved, not yet implemented

## Goal

Make `nat-ui add button` work against a real hosted registry, and ship the first
three components through it.

These are one piece of work rather than three. The registry item format cannot
be designed well in the abstract — it needs a real component pushing on it — and
`add` needs something real to fetch. Designing them together lets the first
components shape the format instead of the other way around.

## Scope

In scope:

- The served registry format: what a registry item looks like on the wire.
- A generator that produces that format from the component sources.
- Hosting from GitHub raw, behind a base URL the CLI can override.
- The `add` command: fetch, resolve dependencies, rewrite imports, write files,
  install packages.
- Three components: `button`, `input`, `dialog`.

Out of scope, deliberately:

- The documentation site. It takes over registry hosting later by changing a
  URL, not by changing the CLI.
- A `label` component. Base UI has no standalone label — `Field.Label` throws
  outside a `Field.Root` — so a label belongs to a future `field` item designed
  alongside `Field.Root`, `Field.Description`, and `Field.Error`.
- JavaScript output. See "One deliberate limitation" below.
- Version pinning. `add` fetches from `main`. Pinned registry versions are
  additive later and nothing needs them yet.
- A `list` command, though the index this design emits is what would back one.
- Item and file types other than `ui`. The schema keeps both wider enums for
  later, but the generator asserts every served item and file is `ui`, and `add`
  refuses anything else rather than guessing a destination.

## The registry format

### Two schemas, not one

`packages/schema` already has `registryItemSchema` and `registryItemFileSchema`.
Those describe **authoring**: what `packages/registry` declares about an item.
A file there is `{path, type}`, because the source lives on disk next to the
declaration.

What gets **served** must also carry the text of each file, and must identify
the contract version it was written against so an old CLI can refuse a document
it cannot parse rather than writing garbage into someone's project.

So the schema package grows a served variant alongside the authoring one:

- `registryItemFilePayloadSchema` — the authoring file schema plus
  `content: string`.
- `registryItemPayloadSchema` — the authoring item schema plus
  `schemaVersion`, with `files` using the payload file schema.
- `registryIndexSchema` — the index described below.

Authoring stays lean; distribution carries everything. The CLI only ever
validates payload schemas, and `packages/registry` only ever writes authoring
ones.

### An item on the wire

```json
{
  "schemaVersion": "1",
  "name": "button",
  "type": "ui",
  "dependencies": ["@base-ui/react", "class-variance-authority"],
  "files": [
    {
      "path": "ui/button.tsx",
      "type": "ui",
      "content": "import * as React from 'react'\n..."
    }
  ]
}
```

`path` is relative to `packages/registry/src`, which is where the component is
authored. Only its basename decides the destination filename; the directory
part is repository structure, not instruction.

`schemaVersion` is compared against `REGISTRY_SCHEMA_VERSION`, which already
exists in `packages/schema` for exactly this purpose. A mismatch is an error
telling the user to upgrade the CLI, not a best-effort parse.

### The index

The generator also emits `index.json`:

```json
{
  "schemaVersion": "1",
  "items": [
    {"name": "button", "type": "ui"},
    {"name": "dialog", "type": "ui"},
    {"name": "input", "type": "ui"}
  ]
}
```

It costs nothing to produce and turns a mistyped name from a bare 404 into
`Unknown item 'buton'. Available: button, dialog, input.` It is also what a
`list` command would read, if one is ever wanted.

Items are sorted by name. Everything the generator emits must be byte-identical
on every machine, because CI compares its output against what is committed.

## Hosting and the base URL

Items are served from GitHub raw off `main`:

```
https://raw.githubusercontent.com/Natip85/nat-ui/main/r
```

An item is `<base>/<name>.json` and the index is `<base>/index.json`.

The base URL is resolved in this order: the `--registry` flag, then the
`NAT_UI_REGISTRY_URL` environment variable, then that built-in default. The
override is not speculative — it is how the tests point at fixtures instead of
the network, and it is how the documentation site takes over hosting later
without a CLI release.

## Generating the registry

`packages/registry` gains a `build` script. It reads the `registry` declaration
from `src/index.ts`, reads each declared file off disk, validates the result
against the payload schemas, and writes `r/<name>.json` and `r/index.json` at
the repository root.

Those files are committed. That is a generated artifact in git, which is
precisely what moving `THIRD_PARTY_NOTICES` out of the tree avoided — but the
situations differ. That file could not be verified without a build, whereas here
CI already runs `pnpm build`, which regenerates `r/`, so a `git diff --exit-code
-- r/` step afterwards makes staleness impossible rather than merely unlikely.
Committing is what makes the raw URL live the moment a pull request merges.

Output is written as two-space JSON with a trailing newline so `format:check`
passes without a separate Prettier pass.

File contents are normalized to LF line endings before being embedded. Without
that, a Windows checkout would emit `\r\n` inside every `content` string and the
drift check would fail on one runner and pass on the others — the same class of
platform bug that made `pnpm build` a silent no-op on Windows.

The generator fails the build if any served item or file has a `type` other than
`ui`, so the repository cannot publish an item the CLI would refuse to install.

## `add` command surface

```
nat-ui add <item...> [--yes] [--overwrite] [--registry <url>]
```

Several items may be named at once. Exit code 0 on success, 1 on any failure.
Declining to overwrite is not a failure and exits 0, matching `init`.

`add` with no items named is a usage error that prints the available items
rather than doing nothing silently.

Item names must match `^[a-z0-9]+(-[a-z0-9]+)*$`. A name is interpolated into
both a URL and a filesystem path, so anything outside that shape is rejected
before either is constructed. This is a guard, not a naming convention.

`add` requires `components.json`. Without one it fails with a pointer to `init`
rather than guessing a project layout. The file is read and validated with
`configSchema.parse`, so a hand-edited config fails loudly at the boundary.

## Resolution

Each named item is fetched from `<base>/<name>.json` and validated. Its
`registryDependencies` are then resolved breadth-first, deduplicated by name,
with cycle detection — `dialog` pulls in `button`, and each item is fetched
exactly once no matter how many paths lead to it. A cycle is an error, not an
infinite loop.

Fetching uses Node's global `fetch`, which the Node 22.13 floor guarantees, so
no HTTP dependency is needed. A 404 becomes "unknown item", named against the
index so the message can suggest what does exist; any other non-success status
is reported with its code rather than being retried.

The fetch function is injected into the command, the way `init` injects its
prompts and installer, so no test touches the network.

## Where files land

Every file goes to the directory the `ui` alias resolves to. With the aliases
`init` writes, `add button` produces `src/components/ui/button.tsx` in a project
whose tsconfig maps `@/*` to `./src/*`.

Turning `aliases.ui` into a real directory follows exactly the rules `init`
already uses for `aliases.utils`: strip the prefix, join onto the directory
tsconfig's `paths` records for that prefix, and fall back to `src` or the
project root when that target is missing or resolves outside the project. Those
rules currently live as private helpers inside `commands/init.ts`. They move to
a shared module so both commands share one implementation rather than drifting
apart.

Destination directories are created as needed.

## Rewriting imports

Component sources are authored against `@/*`. Every import specifier is
rewritten to the consuming project's aliases before the file is written:
`@/lib/utils` becomes whatever `aliases.utils` says, and `@/components/ui/button`
becomes whatever `aliases.ui` says. Only import and re-export specifiers are
rewritten, never arbitrary text that happens to resemble one.

This is a pure string transform over source text, so it is tested without a
filesystem.

`dialog` importing `buttonVariants` from `button` means cross-item rewriting is
exercised by the first release rather than discovered broken later.

## The `use client` directive

`components.json` records `rsc`. Components that own client-only behaviour carry
`"use client"` in their source; `add` strips it when `rsc` is false and keeps it
when true. Leaving it in a non-RSC project is not merely untidy — some bundlers
warn about module-level directives they do not understand.

## Files that already exist

`init` leaves existing files alone, but `add` should not inherit that, because
re-adding a component is how someone pulls an update.

`add` prompts once, naming every file that would be overwritten, and defaults to
no. Answering no skips those files and writes the rest.

`--overwrite` accepts without asking, and wins when combined with `--yes`, since
it is an explicit instruction rather than a default. `--yes` on its own declines
and reports which files were skipped, which matches how `init` treats an
existing `components.json`: `--yes` means "accept every default", and the
default here is not to clobber. A non-TTY behaves the same as `--yes`.

## Ordering and failure behaviour

Everything is fetched, validated, and resolved to concrete destination paths
before a single byte is written, so a bad payload, an unknown item, or an
unresolvable alias fails with nothing half-done. The schema is the guard at the
boundary, exactly as in `init`.

Writes then happen through the existing `atomicWriteFile` helper. Installation
runs last, being the step most likely to fail and the easiest to retry by hand.

Dependencies are unioned across every resolved item, deduplicated, and installed
in one command with the detected package manager. `add dialog` therefore
installs `@base-ui/react`, `class-variance-authority`, and `lucide-react`
together rather than three times over.

On install failure, report it, print the exact command to run by hand, and exit
1 without rolling back — the same trade `init` makes.

Refuse before writing anything when:

- There is no `components.json`.
- `components.json` fails schema validation.
- No items were named.
- An item name is not of the permitted shape.
- A named item does not exist in the registry.
- A payload's `schemaVersion` is not understood.
- A served file has a type other than `ui`.
- `tsx` is false. See below.

## The components

All three are authored in `packages/registry/src/ui/` and are `type: "ui"`.

### `button`

Wraps `Button` from `@base-ui/react/button`, which supplies `render`-prop
composition, `focusableWhenDisabled`, correct `role` and keyboard handling when
rendered as a non-button element, and a `data-disabled` attribute.

Styling is a `buttonVariants` helper built with `class-variance-authority`, with
variants `default`, `destructive`, `outline`, `secondary`, `ghost`, and `link`,
and sizes `sm`, `default`, `lg`, and `icon`. `buttonVariants` is exported
separately so other components can borrow the styling without the element.

Every colour comes from the tokens `init` already writes, so the component works
under both base colours with no additions to the theme block.

Dependencies: `@base-ui/react`, `class-variance-authority`.

### `input`

Wraps `Input` from `@base-ui/react/input`. One shape, no variants: border, focus
ring, and disabled and invalid states drawn from the same tokens. Using Base
UI's input rather than a bare element means it picks up validation state
automatically if it is later nested in a `Field.Root`.

Dependencies: `@base-ui/react`.

### `dialog`

Wraps Base UI's dialog parts. Exported names follow shadcn's vocabulary —
`Dialog`, `DialogTrigger`, `DialogPortal`, `DialogOverlay`, `DialogContent`,
`DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`,
`DialogClose` — mapping onto Base UI's `Root`, `Trigger`, `Portal`, `Backdrop`,
`Popup`, `Title`, `Description`, and `Close`. `DialogHeader` and `DialogFooter`
are plain layout elements with no Base UI counterpart.

The close affordance is a lucide `X` icon styled with
`buttonVariants({variant: 'ghost', size: 'icon'})`, which is why `dialog`
declares `registryDependencies: ["button"]`.

Enter and exit animation uses Tailwind's `data-*` variants against Base UI's
`data-open`, `data-closed`, `data-starting-style`, and `data-ending-style`
attributes, driven by transitions rather than keyframes. Keyframes would require
either an animation plugin or new entries in `init`'s theme block; a transition
requires neither and looks the same for a fade and scale.

`dialog` carries `"use client"`; `button` and `input` do not.

Dependencies: `@base-ui/react`, `lucide-react`.
Registry dependencies: `button`.

## One deliberate limitation

`components.json` has a `tsx` field, and honouring `tsx: false` means stripping
types from TSX, which needs a real compiler pass. Rather than ship a fragile
transform, `add` supports TypeScript only and fails with a clear message when
`tsx` is false. An honest error beats subtly broken JavaScript, and the
transform can be added later without changing anything else in this design.

## Repository changes

This monorepo has no React tooling today. Landing these components requires:

- `react`, `@types/react`, `@base-ui/react`, `class-variance-authority`, and
  `lucide-react` as devDependencies of `packages/registry`, added to the
  workspace catalog like every other shared version.
- JSX enabled in that package's tsconfig.
- ESLint taught about React and JSX so `pnpm lint` still covers the sources.
- `happy-dom` and `@testing-library/react` for component behaviour tests, which
  is the first DOM environment in the repository.
- The alias-to-path helpers extracted out of `commands/init.ts` into a shared
  module, as described above.

## Module layout

```
packages/registry/
  src/index.ts                 the three item declarations
  src/ui/button.tsx
  src/ui/input.tsx
  src/ui/dialog.tsx
  scripts/build-registry.ts    declarations + sources → r/*.json

packages/cli/src/
  commands/add.ts              orchestrates the flow
  registry/base-url.ts         flag, env, default
  registry/fetch-item.ts       one GET, validated against the payload schema
  registry/resolve-graph.ts    transitive deps, dedupe, cycle detection
  transform/rewrite-imports.ts source text + aliases → source text
  transform/use-client.ts      strips the directive when rsc is false
  config/read.ts               components.json → validated Config
  paths/alias.ts               alias + tsconfig targets → real directory
```

`base-url.ts`, `resolve-graph.ts`, `rewrite-imports.ts`, `use-client.ts`, and
`alias.ts` are pure functions over data, testable without a filesystem, a
terminal, or a network.

## Testing

Unit tests:

- Base URL precedence across flag, environment variable, and default.
- Item name validation, including names carrying a slash, a `..` segment, or a
  scheme, since a name reaches both a URL and a path.
- Payload validation: a good item parses; a bad `schemaVersion`, an unknown file
  type, an absolute path, and a `..` segment are each rejected.
- Graph resolution: transitive dependencies, deduplication across two entry
  points, and cycle detection.
- Import rewriting: the utils alias, the ui alias, a project using a `~` prefix,
  and text that resembles a specifier but is not one.
- Directive stripping, in both settings of `rsc`.
- Alias resolution, including the fallbacks for a missing `paths` entry and one
  pointing outside the project.

Integration tests run the whole command against throwaway directories with the
fetch function and installer stubbed:

- `add button` into a project `init` has already configured.
- `add dialog`, asserting button arrives too and its import is rewritten.
- `add button` twice: prompted and declined, declined under `--yes`, and forced
  with `--overwrite` including when `--yes` is also present.
- `add nope`, asserting the error names the available items.
- `add` with no `components.json`, with no items named, and with `tsx: false`.

Component tests, in a DOM environment:

- Button renders each variant and forwards `render`.
- Input reflects disabled and invalid states.
- Dialog opens from its trigger, closes on Escape, and labels itself with its
  title.

Generator tests assert that emitted JSON round-trips through the payload
schemas, that a non-`ui` item or file fails the build, and that a source
containing CRLF still produces LF in the payload.

No test touches the network.

## Release

The components ship as `@nat-ui/cli@0.2.0` with `add` in `--help` and in the
README, replacing the note that says it does not exist yet. The registry JSON is
live the moment the pull request merges, so the CLI release and the registry
cannot disagree about what exists — but a published `add` does depend on `r/`
being on `main`, so the release follows the merge rather than accompanying it.
