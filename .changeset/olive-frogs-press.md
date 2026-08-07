---
'@nat-ui/cli': patch
---

Retunes the animation presets so they are actually distinguishable, and fixes
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
