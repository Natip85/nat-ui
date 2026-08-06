# A motion-native component registry

Date: 2026-08-06
Status: approved, not yet implemented

## Goal

Turn nat-ui from a shadcn clone into a registry with a reason to exist: the
complex components shadcn does not ship, built so that motion is part of how
they work rather than decoration applied afterwards.

The pitch, in one line: **the components shadcn is missing, with real physics.**

## Why the current direction has no future

Three components in, nat-ui is a smaller shadcn built the same way. That was
survivable while the differentiator was the primitive layer — Base UI instead of
Radix. It no longer is.

In July 2026 shadcn/ui made Base UI the **default** for new projects. Base UI
shipped v1.0 in December 2025, sits at 1.6.0 with 6M+ weekly downloads, and
shadcn now opens its component docs on the Base UI tab. The one architectural
choice that distinguished this project is now the thing everybody gets by
running `npx shadcn init`.

So the question is not how to catch up on component count. It is what nat-ui is
for.

## What the ecosystem rewards

Twenty shadcn registries compete today. Sorting them by component count against
recognition gives an unambiguous answer:

| Library         | Components | Recognition       |
| --------------- | ---------- | ----------------- |
| Neobrutalism    | ~30        | 5.2k stars        |
| Cult UI         | 78         | 5.9k stars        |
| 8bitcn          | ~35        | 1.9k stars        |
| Origin UI       | 484        | not a household name |
| ReUI            | 1000+      | not a household name |

Neobrutalism earns 5.2k stars from thirty components because it can be
described in three words. ReUI ships a thousand and cannot be described at all.

Breadth does not buy adoption. A point of view does. At roughly 10–15 hours a
week, breadth is not available anyway, which makes this a constraint and an
opportunity pointing the same direction.

## Positioning

Two categories are already owned. Origin UI, ReUI, and Kibo UI own functional
complexity, and everything they ship is inert — a Kibo dropzone is correct and
lifeless. Magic UI and Aceternity own motion, and all of it is decoration on
marketing surfaces.

Nobody is building **functional components where the motion is the substance**.
That is the gap, and it is defensible for a solo maintainer because it is a
taste and tuning problem rather than a volume problem.

It also solves distribution honestly. People search for "shadcn multiselect",
find nat-ui, and stay because it feels unlike the four static multiselects they
already tried.

The consequence, accepted deliberately: this leans app-side. A tactile
multi-select does nothing for a portfolio landing page. App developers are the
primary audience; landing-page builders are incidental.

## The two tests

Every candidate component must fail **both** of these to be admitted:

1. **Does shadcn/ui already ship it?** If yes, skip.
2. **Would it be meaningfully worse as a static component?** If motion would
   only be a pleasant transition on top, skip — someone already ships it and
   "the same thing but smoother" is not a reason to switch.

The second test is what keeps this out of the clone trap. A tactile multi-select
passes: chips spring in and displace their neighbours, drag reorders, a fling
removes. A styled checkbox fails.

The four signature primitives below are a deliberate, capped exception to test
one. See "Why primitives are exempt".

## Scope

In scope:

- A motion token layer, published as a registry item every component depends on.
- An `animation` prop on every component, with three presets.
- Four signature primitives, rebuilt around the motion language.
- Eight missing components where motion is the substance.
- Dual registry output, so the shadcn CLI can install nat-ui components.
- A playground route in `apps/docs` for developing and comparing presets.
- Docs and landing-page copy that sells motion rather than ownership.

Out of scope, deliberately:

- **Storybook.** See "Why not Storybook".
- **Landing-page effects, marketing blocks, charts.** Magic UI, Aceternity,
  Shadcnblocks, Tailark, and Tremor each own one of these outright.
- **Command palette, carousel, toast.** shadcn ships the first two; sonner owns
  the third and beating it is not worth the hours.
- **Kanban, gantt, rich-text editor.** Kibo UI and Novel own these, and each is
  a multi-week project alone.
- **Date range picker.** A real gap, but the motion story is thin — it would be
  a static component with our name on it.
- **A theme system of our own.** We are not a design system. Components style
  against the tokens the user's shadcn setup already defines.
- **Cascading motion via a context provider.** See "The extension not being
  built".

## Motion architecture

### Two tiers, so motion is never a blanket tax

**Tier one is CSS-only.** Base UI exposes `data-open`, `data-closed`,
`data-starting-style`, and `data-ending-style`, which cover enter and exit
transitions, hover, and press with no JavaScript dependency at all.

**Tier two depends on `motion`**, declared per-item in `dependencies` so only
the components that need it carry it. Gestures, drag, velocity handoff,
reorder, and layout animation live here, composed through Base UI's `render`
prop with `keepMounted` — the documented integration path, which keeps
accessibility intact.

Given what this registry is for, **tier two is the majority**. A set built
around dragging, flinging, and reordering cannot be expressed in CSS, and
pretending otherwise would be the wrong trade. Expected split: `button`, `tabs`,
and `dropzone` are tier one; `switch`, `slider`, `multi-select`,
`sortable-list`, `swipeable-item`, `sheet`, `expandable-card`, and
`animated-number` are tier two. `tree` is tier one for expand and collapse and
tier two only if drag-to-reparent is enabled, which is the one component where
the boundary is a design decision rather than a fact.

The point of the split is therefore not that most components avoid the
dependency — it is that the simple ones are not forced to pay for the complex
ones. Someone who installs only `button` and `dropzone` never sees `motion` in
their tree.

Components import from `motion/react` directly rather than requiring a
`LazyMotion` provider. The provider saves roughly 30kb but forces setup before
anything works, which is the wrong tax for copy-paste distribution. It is
documented as an optimisation instead.

### One spring definition, two outputs

The tiers must be visually indistinguishable, or the library feels like two
libraries. So the springs are defined once, in physical terms, and both forms
are generated from that single source at build time:

- **JavaScript spring configs** for tier two, consumed directly by `motion`.
- **CSS `linear()` easing functions** for tier one, sampled from the same
  damped-harmonic-oscillator solution and emitted as custom properties.

`linear()` is baseline across current browsers and is the only way to express a
true spring curve in CSS. Approximating with `cubic-bezier` would guarantee the
two tiers drift apart.

This generator is the most important piece of infrastructure in the design. It
is what makes `animation="bouncy"` mean the same thing on a CSS-only popover
and a drag-driven sheet.

### The token layer

One small `lib` registry item that every component depends on. It exports the
springs by name and nothing else. Components reference `springs.snappy`, never a
literal `{ stiffness: 430, damping: 32 }`.

This is the difference between a library and a pile. Thirty components that
each hand-roll their timing feel like thirty one-offs and cannot be described.
Thirty components sharing three named springs feel like one designed thing, and
the user can retune the entire library's personality by editing one file they
own. It is also the answer to "why not add transitions myself": the tuning is
the product.

`prefers-reduced-motion` is handled here, once, rather than forgotten in twenty
places. The animation-heavy registries are consistently careless about this, and
being the one that is not is cheap credibility with exactly the developers whose
opinion travels.

### The `animation` prop

Every component takes `animation`, a second axis alongside shadcn's existing
`variant`:

```tsx
<Button variant="destructive" animation="bouncy" />
```

Appearance and feel vary independently. The same prop name and the same preset
names appear on every component in the registry — that consistency is what
someone notices on their third component and what makes the library feel
designed rather than assembled.

The prop resolves differently per tier: a CSS custom property for tier one, a
spring config object for tier two. Same vocabulary, two implementations, one
generated source.

### Presets, and why choreography is fixed

| Preset   | Stiffness | Damping | Character                                  |
| -------- | --------- | ------- | ------------------------------------------ |
| `smooth` | 200       | 28      | Large travel, zero overshoot                |
| `snappy` | 520       | 26      | Very fast, overshoots once — **the default** |
| `bouncy` | 340       | 9       | Several visible oscillations                |

Mass is 1 throughout. These were chosen by feel, in a browser, against live
demos rather than on paper.

`none` exists as a fourth value but is not a personality — it is the target
`prefers-reduced-motion` collapses everything to.

`snappy` is the default because the default is what everyone experiences before
they know the prop exists. It reads instantly as a library that does motion,
which is the specialisation, but settles fast enough that a form containing
twelve of them is not exhausting. `bouncy` as the default would be more
memorable and would quietly disqualify nat-ui from the app UI it targets —
nobody ships oscillating inputs on a settings page. `smooth` as the default
undersells the premise. Defaulting to `snappy` with `bouncy` one prop away gets
both.

**The presets change physics, never choreography.** How far a press travels,
how far a panel rises, how deep a scale goes — all identical across presets.
Only stiffness and damping vary.

This matters more than it appears. If `bouncy` also moved further than `smooth`,
the prop would change two things at once and nobody could predict the effect of
switching it across thirty components. Fixing choreography and varying physics
is what makes the prop comprehensible at scale.

The choreography itself is deliberately loud — a press scales to 0.80, panels
enter from 0.35 scale and 28px below. "In your face" is a property of nat-ui as
a whole, not something reserved for the bounciest setting, because it is the
specialisation.

### The extension not being built

Making motion cascade — `data-motion="bouncy"` on a container retuning
everything inside — is nearly free for tier one and needs a context provider for
tier two. Copy-paste components that require a provider before they work is the
wrong friction. The token layer should be built so this stays possible; it
should not be built now.

## The component set

### Why primitives are exempt from test one

Test one says skip anything shadcn ships, which would exclude every primitive.
They are admitted anyway, capped at four, because the motion language is most
legible in the simplest components and because a button is the cheapest possible
demonstration of the library's feel — someone presses it once and knows whether
nat-ui is worth their time. Neobrutalism's button *is* their product and nobody
calls it a clone.

The cap exists because the failure mode is real: ship button, then input, then
checkbox, then select, and four months later there is a shadcn clone with
transitions and none of the missing components that were the point.

### Signature primitives (4)

- **`button`** — velocity-aware press; idle → loading → success as one
  continuous morph rather than a swap
- **`switch`** — a thumb that can actually be dragged, that overshoots and
  settles
- **`tabs`** — an indicator that travels between tabs under real physics
- **`slider`** — springy thumb with momentum

### Missing components where motion is the substance (8)

- **`multi-select`** — the flagship. Chips spring in and displace neighbours,
  drag reorders, a fling removes.
- **`sortable-list`** — drag to reorder with live displacement; the motion is
  the component
- **`swipeable-item`** — swipe a row to reveal actions; absent from every
  registry surveyed
- **`sheet`** — drag-to-dismiss with snap points and velocity handoff
- **`expandable-card`** — morphs into a full panel via shared-element transition
- **`tree`** — spring-driven expand and collapse, drag to reparent
- **`dropzone`** — files spring into place, real drag-over feedback
- **`animated-number`** — cheap to build, disproportionately delightful,
  motion-native by definition

### Why multi-select is the flagship

It is the most-searched missing shadcn component, so it brings people in on its
own merits, and it is where the motion treatment is least deniable as a gimmick.
Someone arriving from a search for "shadcn multiselect" has already tried three
static ones; this is the first that feels like anything. That is the conversion
moment, and the rest of the library sits downstream of it.

### Removals

`input` and `dialog` are removed from the registry. shadcn ships both, neither
earned a place among the four primitives, and `sheet` supersedes `dialog` in the
new lineup. Carrying them is the clone trap in miniature.

`button` is not removed but is rebuilt against the motion language.

This breaks `nat-ui add input` and `nat-ui add dialog` for every published CLI
version, because those clients fetch `r/input.json` and `r/dialog.json` by name
and will now get a 404. Acceptable here only because the user base is
effectively zero — it would not be acceptable later, and it is worth removing
now precisely because that window is closing. Already-installed copies are
unaffected: the components are source files the user owns.

## Distribution

### Both CLIs, not either

The registry build emits two formats from one component source:

- **nat-ui format at `/r/{name}.json`** — unchanged, byte-for-byte, because
  every published CLI bakes `DEFAULT_REGISTRY_URL` into its bundle and those
  clients must keep working. The committed `r/` at the repository root stays
  committed, as established in the docs-site design.
- **shadcn `registry-item` format at `/s/{name}.json`** — new, additive,
  touching nothing that exists.

A separate path is required rather than a shared one: `/r/` already serves
nat-ui's own schema, and shadcn's CLI would reject it on the differing `type`
values and missing `$schema`.

Users then reach nat-ui either way:

```bash
# directly, no configuration
npx shadcn add https://nat-ui-delta.vercel.app/s/multi-select.json

# or namespaced, via components.json
{ "registries": { "@nat-ui": "https://nat-ui-delta.vercel.app/s/{name}.json" } }
npx shadcn add @nat-ui/multi-select
```

### Why this matters more than it sounds

Every one of the twenty competing registries installs through the shadcn CLI.
Today, a developer with a working shadcn app who wants one nat-ui component must
install a second CLI and run `nat-ui init`, which writes a `components.json` and
rewrites their theme CSS. That is an unreasonable ask for a single component,
and most people will not do it.

Existing projects are nearly the entire addressable audience. Kibo UI ships both
paths for exactly this reason and is the only registry in the survey with its
own CLI *and* real adoption.

### What the nat-ui CLI is for afterwards

It keeps a genuine job: the better greenfield experience, where `init` writing
theme tokens and wiring `components.json` is a service rather than an intrusion.
It is also the surface that can go where shadcn's CLI will not.

It is no longer the gate.

### Schema consequences

nat-ui's own `registryItemSchema` does not change and `schemaVersion` stays
`'1'`. The shadcn format is a separate serialisation of the same in-memory
items, so no published client sees a new key. The existing
`git diff --exit-code -- r` guard continues to cover the nat-ui output; the
shadcn output gets an equivalent guard.

In shadcn format, `registryDependencies` can reference plain shadcn items
(`button`, `input`) as well as namespaced nat-ui ones (`@nat-ui/motion`). This
is what lets nat-ui stop shipping primitives it does not need: components build
on whatever the user's shadcn setup already installed.

The motion token layer maps to `registry:lib`, and its CSS custom properties
ship through the item's `cssVars`.

## The playground, and why not Storybook

Motion cannot be reviewed by reading a diff. The development loop is
unavoidably: build, the maintainer presses it, the maintainer reports it feels
wrong. Whatever tooling is chosen, the maintainer's half is the bottleneck, so
the tooling should optimise that half and nothing else.

**A playground route in `apps/docs`** — a page rendering any component with live
controls for the `animation` preset, variant, size, and a reduced-motion toggle.
A few hours of work on the stack that already exists.

Its real advantage is that it is not throwaway. It is the same "try it three
ways" control that belongs above every live preview on the public component
pages, so building the workbench produces a marketing asset as a side effect.

**Storybook is rejected.** `apps/docs` already provides most of what it would:
live demos via `ComponentPreview`, a dev server, and coverage tests enforcing
that every registry item has a docs page and a demo. Storybook would be a second
surface duplicating that, and it would raise the per-component artifact count
from three to four permanently. Configuring it cleanly against a pnpm monorepo
with Tailwind v4, Next 16, and Base UI costs days, not hours, and it breaks on
major upgrades.

Its strongest argument — visual regression through Chromatic — is unusually weak
here. Screenshots do not capture springs. A static frame of a bouncy multi-select
and a smooth one are identical.

Worth revisiting only if the component count grows far beyond this design.

## Docs site

The current landing headline, "Components you own, not dependencies you
configure", describes shadcn exactly as well as it describes nat-ui. That is the
positioning problem in one sentence, and it changes.

Required changes:

- **Landing page.** Lead with motion. The hero should be a component the visitor
  can press, drag, or fling within a second of arriving — not a screenshot and
  not a headline. The multi-select is the natural choice.
- **Preset switcher above every preview.** The playground control, promoted.
  Being able to flip the same component between `smooth`, `snappy`, and `bouncy`
  in place is the single most persuasive thing the site can offer, and it
  demonstrates the `animation` prop without explaining it.
- **Installation shows the shadcn command first.** `npx shadcn add @nat-ui/...`
  is what most visitors can act on immediately; the nat-ui CLI is the second tab.
- **A motion page** documenting the presets, the token layer, retuning, and the
  reduced-motion behaviour. This is the page that argues the library has a point
  of view.

The existing coverage guard extends to cover the new artifacts rather than being
replaced.

## Sequencing

Do not wait for twelve components.

**First public release:** the motion token layer, the four primitives, plus
`multi-select`, `sortable-list`, and `swipeable-item`. That is a coherent
library with an obvious point of view, and it earns real feedback months before
the full set would exist.

**Second:** `sheet`, `expandable-card`, `dropzone`, `animated-number`.

**Third:** `tree`, which is the most expensive item in the set.

The dual registry output, the playground, and the landing-page rewrite all land
with the first release, because they are what makes the first release legible.

This spec covers all three releases so the shape is settled up front, but it is
too large for one implementation plan. **The plan that follows this spec covers
the first release only.** The second and third are additive — components dropped
into infrastructure that already exists — and each gets its own plan when the
one before it has shipped.

## Budget

At 10–15 hours a week over three months, roughly 150 hours:

| Work                                       | Estimate |
| ------------------------------------------ | -------- |
| Motion token layer and the spring generator | ~12h     |
| 12 components at ~7h each                   | ~85h     |
| Dual registry output and guards             | ~10h     |
| Playground route                            | ~5h      |
| Docs and landing rewrite                    | ~20h     |
| Slack                                       | ~18h     |

Tight but real. The sequencing above is what protects it: if the estimate slips,
the first release still ships complete and the later components arrive late
rather than the whole thing arriving never.

## Testing

The existing guards carry over unchanged — dependency declaration, docs
coverage, and the CLI smoke build.

New:

- **Spring generator unit tests.** The CSS `linear()` output and the JS spring
  config must derive from the same constants; a test asserts they sample the
  same curve within tolerance. This is the piece whose silent drift would be
  hardest to notice by eye.
- **Shadcn format validation.** Every emitted `/s/{name}.json` validates against
  shadcn's published `registry-item` schema, and a guard fails the build if
  regenerating produces a diff.
- **Reduced-motion behaviour.** A test asserting that with
  `prefers-reduced-motion` set, every component resolves to the `none` preset
  regardless of its `animation` prop.

Gesture and drag behaviour is not unit tested. The assertions worth writing
would test the spring integrator, which is `motion`'s code, and the thing that
actually matters — whether it feels right — is only answerable by a human.

## Risks

**The set is app-side and the audience question was answered "both".** Accepted
explicitly. Landing-page builders are not served by this design. Revisiting
means a different set, not a modified one.

**`bouncy` may read as toy-like in real applications.** Mitigated by defaulting
to `snappy` and by fixing choreography across presets, but it is a taste call
that only real usage settles.

**Motion as a per-component dependency could still surprise people.** A user
installing four tier-two components gets `motion` whether or not they wanted it.
The docs must be explicit about which components carry it.

**The flagship is a hard component.** A multi-select with drag reorder,
displacement, and fling-to-remove is the most complex item in the first release
and it is also the one everything else depends on for attention. It should be
built first, not last, so that a slip is visible early.

**Shadcn's registry format is not ours to control.** If it changes, the `/s/`
output must follow. The mitigation is that it is generated, not authored, so
following costs one function rather than twelve files.
