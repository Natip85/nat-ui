# @nat-ui/cli

## 0.5.0

### Minor Changes

- 7254b48: Publishes every registry item in shadcn's `registry-item` format at
  `/s/{name}.json`, so an existing shadcn project can install nat-ui components
  with `npx shadcn add` and never install the nat-ui CLI at all.

  The nat-ui format at `/r/{name}.json` gains no key and changes no shape, which
  is what matters: published CLIs bake that URL into their bundle and validate
  what they fetch against a strict schema, so a new key would break installs on a
  version nobody can patch. Both formats are serialised from one in-memory item
  list, so they cannot drift.

  Cross-references between items are absolute URLs rather than namespaced names,
  because a namespaced reference only resolves once the user has configured the
  namespace in `components.json`, and the install path most people take is a bare
  URL with no configuration at all.

  The `destructive` button variant now uses `text-white` instead of
  `text-destructive-foreground`: shadcn's own theme defines `--destructive` but
  not `--destructive-foreground`, so the label rendered with no foreground
  colour in a shadcn project. nat-ui's own theme presets define that variable to
  essentially the same white, so this is not a visible change there.

## 0.4.0

### Minor Changes

- 61dd090: `add` can now install `lib` items, which is what lets components share the
  motion token layer. Lib files go to the `lib` alias from `components.json`, or,
  for configs written before that alias existed, to the directory holding
  `utils`. Imports of `@/lib/<name>` are rewritten alongside `@/lib/utils` and
  `@/components/ui/*`.

  `input` and `dialog` have been removed from the registry. Copies already
  installed are unaffected — they are files your project owns — but
  `nat-ui add input` and `nat-ui add dialog` now fail with a not-found error.

  `button`'s `buttonVariants` has moved out of `button.tsx` into its own
  `button-variants.tsx`, and `nat-ui add button` now installs both files.
  `button.tsx` carries `'use client'` for its `animation` prop, which makes every
  export of that module a client reference — including `buttonVariants`, a plain
  class-name function that Server Components need to call directly (for example,
  to style a `<Link>` as a button). Splitting it out is what makes that call
  possible again. If your project already has `button`, update your import of
  `buttonVariants` to `@/components/ui/button-variants`.

  For the same reason the `motion` item now ships two files. `lib/motion.ts`
  holds the presets, easings and `transitionStyle`, and no longer carries a
  directive, so a Server Component can style a link with the same spring a
  `Button` uses. The reduced-motion hooks moved to `lib/use-motion.ts`, which
  does carry one — a module cannot be imported by a Server Component if it so
  much as imports `useState`.

### Patch Changes

- 6b16663: Retunes the animation presets so they are actually distinguishable, and fixes
  the reason they were not.

  The press never animated. Tailwind compiles `scale-*` to the independent
  `scale` property, which CSS Transforms Level 2 keeps separate from `transform`,
  and the transition named only `transform` — so every preset snapped instantly
  to its pressed size and the spring shaping it was never applied. `pressStyle`
  now names `scale` as well.

  The presets were also tuned too close together to tell apart even once they
  animate: all three settled within 49ms of each other, differing only in
  overshoot, which on a 4% press came to half a pixel. `smooth`, `snappy` and
  `bouncy` now settle in 285ms, 120ms and 901ms, and each sets its own press
  depth, since overshoot is a proportion of the distance travelled and a bounce
  needs room to happen in.

  Adds `PRESS_SCALES` and `pressStyle` to `lib/motion.ts`. `buttonVariants` reads
  its press depth from a `--press-scale` custom property, falling back to `0.96`
  so it stays usable on its own.

- f9ffd9e: Say what to do when no Tailwind stylesheet is found. The message offered only
  "run without `--yes` to supply one", which is no help to a project that has no
  Tailwind at all — the common case, since `create-vite` ships none. It now names
  setting Tailwind up as the first thing to try, and keeps the original advice for
  a stylesheet that merely lives somewhere unconventional.

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
