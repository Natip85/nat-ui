---
'@nat-ui/cli': patch
---

Publishes every registry item in shadcn's `registry-item` format at
`/s/{name}.json`, so an existing shadcn project can install nat-ui components
with `npx shadcn add` and never install the nat-ui CLI at all.

The nat-ui format at `/r/{name}.json` is unchanged byte-for-byte — published
CLIs bake that URL into their bundle — and the two formats are serialised from
one in-memory item list, so they cannot drift.

Cross-references between items are absolute URLs rather than namespaced names,
because a namespaced reference only resolves once the user has configured the
namespace in `components.json`, and the install path most people take is a bare
URL with no configuration at all.

The `destructive` button variant now uses `text-white` instead of
`text-destructive-foreground`: shadcn's own theme defines `--destructive` but
not `--destructive-foreground`, so the label rendered with no foreground
colour in a shadcn project. nat-ui's own theme presets define that variable to
essentially the same white, so this is not a visible change there.
