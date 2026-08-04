# nat-ui

A component distribution platform. Components are copied into your project as
source you own and can edit, not installed as a dependency you can only
configure.

Built on [Base UI](https://base-ui.com) for behavior and Tailwind CSS for
styling. TypeScript throughout.

> Early development. `init` and `add` are available; more components are on
> the way.

## Usage

```bash
pnpm dlx @nat-ui/cli@latest init
```

`init` sets a project up in one pass. It asks where your stylesheet and import
aliases live, then writes `components.json` with those answers, creates a `cn`
helper at your `utils` alias, adds theme variables to your stylesheet, and
installs `clsx` and `tailwind-merge` with your detected package manager. You
also pick a base color, `neutral` or `slate`.

Pass `--yes` (or `-y`) to accept every detected default without being asked.
The same defaults apply automatically when stdin isn't a TTY, so `init` won't
hang in CI. The one thing it won't guess is your stylesheet: if it can't find
one that imports `tailwindcss`, it stops rather than picking a file at random.

Re-running `init` is safe. It updates the theme block in your stylesheet in
place instead of duplicating it, and if `components.json` already exists it
asks before overwriting — declining, and changing nothing, when it can't ask.

That config is what `add` reads, so the components it copies land where you
already keep things, with imports rewritten to your aliases.

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

## Repository layout

| Path                | Purpose                                                  |
| ------------------- | -------------------------------------------------------- |
| `packages/schema`   | Zod schemas and types shared by the CLI and the registry |
| `packages/registry` | Canonical component source and registry build scripts    |
| `packages/cli`      | The `nat-ui` CLI, published as `@nat-ui/cli`             |
| `r/`                | Built registry JSON served over HTTP for local testing   |
| `apps/docs`         | Documentation site                                       |

## Development

Requires Node 22.13+ and pnpm 10.

```bash
pnpm install
pnpm build       # build publishable packages
pnpm typecheck   # typecheck every package
pnpm lint        # eslint, including type-aware rules
pnpm format      # prettier --write
pnpm test        # vitest
```

To run the CLI from source without building:

```bash
pnpm --filter @nat-ui/cli start --help
```

## Releasing

Releases run in CI. The normal path never involves publishing from a laptop.

1. Describe user-visible changes in a changeset: `pnpm changeset`. Commit it
   with the work it describes.
2. When that merges to `main`, the publish workflow opens a **Version Packages**
   pull request that bumps the version and writes the changelog.
3. Merging that pull request publishes `@nat-ui/cli` to npm, tags the commit,
   and creates a GitHub release.

Publishing authenticates with GitHub's OIDC identity through npm's trusted
publishing, so no npm token is stored in this repository, and every published
version carries a provenance attestation. The workflow filename
(`.github/workflows/publish.yml`) is registered on the package's npm trust
relationship and cannot be changed without updating that setting.

`pnpm release` publishes locally and is refused by default, because it goes
through `pnpm publish`, which cannot perform npm's OIDC exchange and so
produces a version with no provenance. It remains available for the case where
CI cannot publish at all — set `NAT_UI_ALLOW_LOCAL_RELEASE=1` — but a version
shipped that way is a trust-level downgrade for anyone installing under
`--trust-policy no-downgrade`.

## License

MIT
