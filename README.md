# nat-ui

A component distribution platform. Components are copied into your project as
source you own and can edit, not installed as a dependency you can only
configure.

Built on [Base UI](https://base-ui.com) for behavior and Tailwind CSS for
styling. TypeScript throughout.

> Early development. `init` is the only command that exists so far; `add` and
> the components it installs are being built next.

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

That config is what `add` will read once it exists, so the components it copies
land where you already keep things, with imports rewritten to your aliases.

## Repository layout

| Path                | Purpose                                                      |
| ------------------- | ------------------------------------------------------------ |
| `packages/schema`   | Zod schemas and types shared by the CLI and the registry     |
| `packages/registry` | Canonical component source and the typed registry definition |
| `packages/cli`      | The `nat-ui` CLI, published as `@nat-ui/cli`                 |
| `apps/docs`         | Documentation site, which also serves the registry JSON      |

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

## License

MIT
