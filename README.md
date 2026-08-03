# nat-ui

A component distribution platform. Components are copied into your project as
source you own and can edit, not installed as a dependency you can only
configure.

Built on [Base UI](https://base-ui.com) for behavior and Tailwind CSS for
styling. TypeScript throughout.

> Early development. Nothing is published yet.

## Usage

```bash
pnpm dlx @nat-ui/cli@latest init
pnpm dlx @nat-ui/cli@latest add button
```

`init` asks where your stylesheet and import aliases live, writes
`components.json` recording those answers, creates a `cn` helper at your `utils`
alias, writes theme variables into your stylesheet, and installs `clsx` and
`tailwind-merge` with your detected package manager. Pick between the
`neutral` (default) and `slate` base colors when prompted. Pass `--yes` (or
`-y`) to accept every detected default without being asked — the same
defaults apply automatically when stdin isn't a TTY, except that a stylesheet
already importing `tailwindcss` must be found; if none is, run `init`
interactively so you can point it at one.

Re-running `init` is safe: it updates the theme block in your stylesheet in
place instead of duplicating it. If `components.json` already exists, `init`
asks whether to overwrite it (defaulting to no), or, under `--yes` or a
non-interactive shell, leaves it untouched automatically.

Every later `add` reads that config and rewrites imports to match your
project's aliases, so the files land where you already keep things.

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
