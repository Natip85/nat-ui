---
'@nat-ui/cli': minor
---

Warn during `init` when `tsconfig.json` maps nothing for your import alias, and
print the `paths` entry to add. Without one, the components `add` writes are
correct but cannot resolve, and the first error you see comes from a file you
did not write.

This mostly affects Vite, since `create-vite` configures no alias and its root
`tsconfig.json` compiles nothing — the entry belongs in `tsconfig.app.json`.
Next.js projects already have an alias and are unaffected.
