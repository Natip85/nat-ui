# @nat-ui/cli

## 0.3.0

### Minor Changes

- 005894f: Warn during `init` when `tsconfig.json` maps nothing for your import alias, and
  print the `paths` entry to add. Without one, the components `add` writes are
  correct but cannot resolve, and the first error you see comes from a file you
  did not write.

  This mostly affects Vite, since `create-vite` configures no alias and its root
  `tsconfig.json` compiles nothing — the entry belongs in `tsconfig.app.json`.
  Next.js projects already have an alias and are unaffected.

- 45c7a22: Fetch components from the documentation site by default, rather than from
  GitHub raw. The site serves the same registry with a CDN and a longer cache
  policy, so `add` gets the same files with fewer round trips to origin.

  Nothing needs to change in your project. `--registry` and `NAT_UI_REGISTRY_URL`
  still override the default, and 0.1.0 and 0.2.0 keep working: `r/` stays
  committed to the repository, so the URL those versions were published with
  continues to serve.

## 0.2.0

### Minor Changes

- 082ad46: Add the `add` command, which copies components from the registry into your
  project, rewrites their imports to your aliases, and installs what they need.
  The first components are `button`, `input`, and `dialog`.

  `init` now also maps its theme tokens into Tailwind's design system with
  `@theme inline`. Without that mapping, utilities like `bg-primary` do not exist
  in Tailwind v4 and components render unstyled. Re-run `init` to update the
  block in place.

## 0.1.0

### Minor Changes

- 1ab8208: Add the init command, which writes components.json, the cn utility, and theme variables, then installs clsx and tailwind-merge.
