# `nat-ui init` design

Date: 2026-08-03
Status: approved, not yet implemented

## Goal

`init` is the first command a user of nat-ui runs. It prepares a project to
receive components: it records where things live, creates the class-name utility
every component imports, writes the theme variables components style against,
and installs the two packages that utility needs.

It does not add any component. `add` is a separate command, designed later.

## Scope

In scope:

- Write `components.json` to the current working directory.
- Write the `cn` utility to the path the `utils` alias resolves to.
- Write CSS theme variables into the stylesheet named by `tailwind.css`.
- Install `clsx` and `tailwind-merge` with the project's package manager.

Out of scope, deliberately:

- The `add` command, registry fetching, and component installation.
- Base UI. It is at `1.0.0-rc.0`, and nothing installed by `init` uses it, so it
  arrives with the first component that needs it and can be pinned per component.
- Source-level style variants. See "Styles" below.
- Per-field flags such as `--css` or `--base-color`. The prompts cover the known
  cases; flags can be added when something concrete needs them.
- Writing `$schema` into the config. It should point at a hosted JSON schema, and
  there is no docs site yet to host one.
- The optional `lib` and `hooks` aliases. `configSchema` makes them optional and
  nothing needs them yet.

## Command surface

```
nat-ui init [--yes]
```

Arguments are parsed with `util.parseArgs` from the Node standard library. The
Node 22.13 floor guarantees it, so no argument-parsing dependency is needed.

`--yes` accepts every default without asking. The same behaviour applies
automatically when stdin is not a TTY, so the command cannot hang in CI.

Because the stylesheet is the one value with no conventional fallback, `--yes`
fails with a clear error when no stylesheet can be detected, rather than
guessing a path.

Exit code 0 on success, 1 on any failure. Declining to overwrite an existing
config is not a failure and exits 0.

## Prompts

Five questions, each pre-filled with a detected or conventional default, so the
common case is five presses of enter.

| Prompt                         | Default  | Where the default comes from               |
| ------------------------------ | -------- | ------------------------------------------ |
| Base style                     | Neutral  | first of the two presets                   |
| Global CSS file                | detected | stylesheet that imports `tailwindcss`      |
| Import alias prefix            | detected | `compilerOptions.paths` in `tsconfig.json` |
| Using React Server Components? | detected | `next` dependency plus an app directory    |
| TypeScript?                    | detected | `tsconfig.json` exists                     |

Prompts use `@clack/prompts`. The prompt module is passed into the command
rather than imported by it, so tests drive the flow with scripted answers
instead of mocking stdin.

### Alias prefix, not three aliases

The prompt asks only for the prefix, `@` or `~`. The three required aliases are
derived from it:

- `components` → `<prefix>/components`
- `utils` → `<prefix>/lib/utils`
- `ui` → `<prefix>/components/ui`

One question instead of three. This is also why the utility lands at
`lib/utils.ts`: that is the `utils` alias resolved to a real path through
`tsconfig.json`, not a hardcoded location.

## Detection rules

- **Stylesheet.** Check `app/globals.css`, `src/app/globals.css`,
  `src/index.css`, `src/styles/globals.css`, `styles/globals.css`, in that
  order, and pick the first that exists and contains an import of `tailwindcss`.
  If none matches, the prompt has no default and the user must supply a path;
  under `--yes` or a non-TTY this is an error, as noted above.
- **Alias prefix.** Read `compilerOptions.paths` from `tsconfig.json` and take
  the prefix of the first key shaped like `X/*`. Default `@` if absent.
- **TypeScript.** `tsconfig.json` exists.
- **RSC.** `next` appears in `dependencies` or `devDependencies` of
  `package.json`, and `app/` or `src/app/` exists.
- **Package manager.** First lockfile found, in order: `pnpm-lock.yaml`,
  `yarn.lock`, `package-lock.json`, `bun.lock`. If none, parse the
  `npm_config_user_agent` environment variable. If that is absent, use npm.

## Styles

The base style prompt offers two presets, **Neutral** (default) and **Slate**,
which map onto the existing `baseColor` field in `configSchema` as `neutral` and
`slate` respectively, so **no schema change is needed**. The other three values
the enum allows remain reachable by editing `components.json` by hand.

Each preset defines the same set of token names with different values, so a
component styled against them works under either. The tokens are:

`--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`,
`--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`,
`--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`,
`--accent-foreground`, `--destructive`, `--destructive-foreground`, `--border`,
`--input`, `--ring`, and `--radius`.

Each preset defines these twice, once for the light theme and once under a dark
selector. Concrete values are chosen during implementation; the requirement here
is that both presets define the identical token set, since a component may only
rely on tokens guaranteed to exist.

The presets differ only in CSS. Component source does not vary by style.

This is a deliberate deferral rather than a rejection. Source-level styles, in
which every component ships in two variants with different spacing and radii,
would double component authoring, review, and serving forever, and that cost
would be incurred before the first component exists. Adding a real `style` field
later is additive: an optional field with a default breaks no config already in
the wild, and `registryItemTypeSchema` already reserves `'style'` as an item
type for exactly this. Revisit once there are enough components to judge whether
a second variant earns its keep.

## What gets written

### `components.json`

The resolved object, validated with `configSchema.parse` before being written.
The parsed result is what gets written, so fields carrying schema defaults
(`tailwind.cssVariables` as `true`, `tailwind.prefix` as `""`) appear explicitly
in the file rather than being left implicit. The config is then a complete
record of the decisions made, and a later change to a schema default cannot
silently alter how an existing project behaves.

Answers map onto fields as follows: the TypeScript answer sets `tsx`, the RSC
answer sets `rsc`, the base style sets `tailwind.baseColor`, the stylesheet path
sets `tailwind.css`, and the alias prefix expands into the three `aliases`
entries described above.

### The `cn` utility

At the path the `utils` alias resolves to. TypeScript:

```ts
import {type ClassValue, clsx} from 'clsx'
import {twMerge} from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

When TypeScript is false, the same file without type syntax, at `.js`.

**If this file already exists, `init` leaves it alone and reports that it did.**
Overwriting a file the user may have edited is worse than skipping it.

### CSS theme variables

Written into the stylesheet named by `tailwind.css`, wrapped in marker comments:

```css
/* nat-ui theme start */
...
/* nat-ui theme end */
```

If a marked block is already present, it is replaced. Otherwise the block is
inserted after the `tailwindcss` import. Re-running `init` therefore never
appends a second copy.

### Installed dependencies

`clsx` and `tailwind-merge`, unpinned, with the detected package manager:
`pnpm add`, `yarn add`, `npm install`, or `bun add`.

## Ordering and failure behaviour

All detection, prompting, and validation happen before anything is written. The
resolved config passes through `configSchema.parse` first, so a bug in
resolution surfaces as a validation error instead of an invalid `components.json`
on a user's disk. The schema acts as the guard, not merely as documentation.

Writes then happen cheapest and most recoverable first: config, utility,
stylesheet. Installation runs last, being the step most likely to fail and the
easiest to retry by hand.

Refuse before writing anything when:

- There is no `package.json` in the directory. `init` cannot install into a
  non-project.
- The stylesheet path does not exist.

Warn and continue when:

- `tsconfig.json` is missing but the user answered yes to TypeScript. The alias
  cannot be verified, but there is no reason to block.

On install failure, report it, print the exact command to run by hand, and exit
1 without rolling back. A written config with missing dependencies is easy to
recover from; a half-rolled-back project is not.

### An existing `components.json`

Prompt to overwrite, defaulting to no. Under `--yes` or a non-TTY, decline and
exit 0 without changes rather than silently overwriting.

## Module layout

Pure transforms are kept separate from I/O so the logic is testable without a
filesystem or a terminal.

```
packages/cli/src/
  index.ts                     entry: parseArgs, dispatch
  commands/init.ts             orchestrates the flow
  detect/project.ts            directory → detected defaults
  detect/package-manager.ts    lockfiles and user agent → package manager
  config/resolve.ts            detected + flags + answers → validated Config
  theme/presets.ts             the two CSS variable sets
  theme/apply.ts               stylesheet text + preset → new stylesheet text
  templates/cn.ts              the utility source
  prompts/ask.ts               @clack/prompts wrapper, injected into the command
```

`config/resolve.ts`, `theme/apply.ts`, and `detect/package-manager.ts` are pure
functions over data. Idempotency of the theme block is a property of a string
function, so it needs no disk access to test.

## Testing

Unit tests:

- Resolution: answers map onto the right config fields, the alias prefix expands
  into three aliases, schema defaults are materialized, and an answer the schema
  rejects fails loudly rather than being written. Since there are no per-field
  flags, precedence is only answer over detected value over conventional
  default, and that is settled while prompting rather than in resolution.
- Theme application in all three states: fresh insert, replacing an existing
  marked block, and no duplication when run twice.
- Package-manager detection for each lockfile, including precedence between
  several and the user-agent and npm fallbacks.

Integration tests run the whole command against throwaway fixture directories,
with prompts scripted and the installer stubbed:

- A Next.js-style project with an app directory.
- A Vite-style project with `src`.
- A JavaScript project with no `tsconfig.json`.
- A project that already has `components.json`.

No test touches the network.

## Build change: generated third-party notices

`@clack/prompts` brings four transitive dependencies, all bundled. Hand
maintaining `THIRD_PARTY_NOTICES` across roughly six packages is fragile, so it
becomes generated at build time from the actual bundle, written to
`dist/THIRD_PARTY_NOTICES` via tsup's `onSuccess` hook.

`files: ["dist"]` already covers that path, so the committed copy at the package
root and its explicit `files` entry are both removed. Nothing generated then
sits in git to go stale or to dirty the tree during CI. This also puts the file
where it was originally suggested; committing it there was impossible only
because `clean: true` would have wiped it.

## Dependency additions

`@clack/prompts` becomes a devDependency of `@nat-ui/cli` and is bundled, in
keeping with the existing `noExternal` arrangement that leaves the published
package with no runtime dependencies.
