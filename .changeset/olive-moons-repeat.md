---
'@nat-ui/cli': patch
---

Say what to do when no Tailwind stylesheet is found. The message offered only
"run without `--yes` to supply one", which is no help to a project that has no
Tailwind at all — the common case, since `create-vite` ships none. It now names
setting Tailwind up as the first thing to try, and keeps the original advice for
a stylesheet that merely lives somewhere unconventional.
