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

Releases are published by hand, from a checkout of `main`:

1. Describe user-visible changes in a changeset: `pnpm changeset`. Commit it
   with the work it describes.
2. When you are ready to ship, bump the version and write the changelog:
   `pnpm version-packages`. Commit the result.
3. Confirm the tarball npm will receive is correct:
   `pnpm --filter @nat-ui/cli run verify-pack`.
4. Publish: `pnpm release`. This builds and runs `changeset publish`, which
   publishes to npm and creates the git tag.
5. Push the commit and the tag: `git push && git push --tags`.

Publishing needs an npm login with publish rights (`npm whoami` to check).
Because this happens locally rather than in a CI workflow, published versions
carry no provenance attestation — npm generates those only for publishes
authenticated by a CI provider's OIDC identity.

## License

MIT
