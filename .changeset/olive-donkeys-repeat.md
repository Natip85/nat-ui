---
'@nat-ui/cli': minor
---

Fetch components from the documentation site by default, rather than from
GitHub raw. The site serves the same registry with a CDN and a longer cache
policy, so `add` gets the same files with fewer round trips to origin.

Nothing needs to change in your project. `--registry` and `NAT_UI_REGISTRY_URL`
still override the default, and 0.1.0 and 0.2.0 keep working: `r/` stays
committed to the repository, so the URL those versions were published with
continues to serve.
