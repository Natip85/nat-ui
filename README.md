# nat-ui

A component distribution platform. Components are copied into your project as
source you own and can edit, not installed as a dependency you can only
configure.

Built on [Base UI](https://base-ui.com) for behavior and Tailwind CSS for
styling. TypeScript throughout.

Documentation, with live examples for every component:
**[nat-ui-delta.vercel.app](https://nat-ui-delta.vercel.app)**

> Early development. `init` and `add` are available; more components are on
> the way.

## Quick start

### Already using shadcn?

You don't need this CLI. Every component is published in shadcn's registry
format as well:

```bash
npx shadcn@latest add https://nat-ui-delta.vercel.app/s/button.json
```

### With the nat-ui CLI

```bash
pnpm dlx @nat-ui/cli@latest init
npx @nat-ui/cli@latest add button
```

`init` configures a project in one pass and writes `components.json`. `add`
reads that config, so components land where you already keep things, with
imports rewritten to your aliases. Naming a component pulls in whatever it
depends on, so `add button` also writes the shared `motion` module.

Available components: `button`.

The site covers the rest:
[installation](https://nat-ui-delta.vercel.app/docs/installation),
[Vite setup](https://nat-ui-delta.vercel.app/docs/vite),
[the CLI and its flags](https://nat-ui-delta.vercel.app/docs/cli),
[`components.json`](https://nat-ui-delta.vercel.app/docs/components-json), and
[theming](https://nat-ui-delta.vercel.app/docs/theming).

## Repository layout

| Path                | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| `packages/schema`   | Zod schemas and types shared by the CLI and the registry  |
| `packages/registry` | Canonical component source and registry build scripts     |
| `packages/cli`      | The `nat-ui` CLI, published as `@nat-ui/cli`              |
| `r/`                | Built registry JSON, committed so GitHub raw can serve it |
| `apps/docs`         | Documentation site, which also mirrors `r/` at `/r`       |

## Development

Requires Node 22.13+ and pnpm 10.

```bash
pnpm install
pnpm build       # build publishable packages
pnpm build:docs  # build the documentation site
pnpm typecheck   # typecheck every package
pnpm lint        # eslint, including type-aware rules
pnpm format      # prettier --write
pnpm test        # vitest
```

`pnpm build` regenerates `r/`, which is committed. CI fails if rebuilding
produces a diff, so run it before pushing a change to a component.

To scaffold a new component:

```bash
pnpm new:component my-component
```

That writes the component source, a demo, and a docs page, then prints the two
edits it can't make for you: registering the demo, and adding the registry
entry with whatever npm packages the component ends up importing.

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
