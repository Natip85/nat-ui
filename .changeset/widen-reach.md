---
'@nat-ui/cli': minor
---

Adds `nat-ui add --all`, which installs every item the registry lists,
libraries included. Passing `--all` alongside component names is an error
rather than a merge, since obeying one would mean ignoring the other.

The package now has a README, so its npm page is no longer blank.

Component pages now offer the shadcn install command alongside the nat-ui
one. The install block previously opened by stating that `nat-ui init` had
already run, which is untrue for anyone arriving from an existing shadcn
project — the audience the shadcn registry format was published for.
