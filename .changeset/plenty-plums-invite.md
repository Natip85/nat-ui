---
'@nat-ui/cli': minor
---

`add` can now install `lib` items, which is what lets components share the
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
