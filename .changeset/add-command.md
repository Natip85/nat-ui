---
'@nat-ui/cli': minor
---

Add the `add` command, which copies components from the registry into your
project, rewrites their imports to your aliases, and installs what they need.
The first components are `button`, `input`, and `dialog`.

`init` now also maps its theme tokens into Tailwind's design system with
`@theme inline`. Without that mapping, utilities like `bg-primary` do not exist
in Tailwind v4 and components render unstyled. Re-run `init` to update the
block in place.
