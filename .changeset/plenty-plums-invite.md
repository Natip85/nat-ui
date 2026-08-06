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
