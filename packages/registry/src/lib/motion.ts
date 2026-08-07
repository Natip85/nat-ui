/**
 * Deliberately free of any runtime React import -- the `CSSProperties` import
 * below is type-only and compiles away. The reduced-motion hooks live in
 * `use-motion.ts` instead, because a server component cannot import a module
 * that pulls in `useState`, and server components do need these presets to
 * style a `<Link>` that should look and move like a button.
 */

import type {CSSProperties} from 'react'

/**
 * The shared motion vocabulary. Every nat-ui component takes an `animation`
 * prop naming one of these, so retuning this file retunes the whole library.
 */
export type AnimationPreset = 'smooth' | 'snappy' | 'bouncy' | 'none'

export interface Spring {
  readonly stiffness: number
  readonly damping: number
  readonly mass: number
}

/**
 * Two things separate one preset from another, and the eye is far more
 * sensitive to the first: how long the motion lasts, and how far it overshoots.
 * An earlier tuning held all three to roughly 400ms and let only the damping
 * ratio vary, which is theoretically the "same feel, different character" --
 * and in practice produced three presets nobody could tell apart, because the
 * whole difference amounted to half a pixel on a button. Duration now spans
 * 200ms to 950ms deliberately.
 *
 * Nothing sits below ~180ms, because under roughly 150ms the eye stops reading
 * movement and registers a jump instead -- which is what separates crisp from
 * abrupt. The damping ratios are also kept high enough that each preset
 * settles in a few defined oscillations rather than a long tail of tiny ones,
 * since that tail reads as buzz rather than bounce.
 */
export const SPRINGS: Record<Exclude<AnimationPreset, 'none'>, Spring> = {
  smooth: {stiffness: 1200, damping: 69, mass: 1},
  snappy: {stiffness: 3775, damping: 80, mass: 1},
  bouncy: {stiffness: 575, damping: 15, mass: 1},
}

/**
 * How far a press travels, as a scale factor. This varies per preset for the
 * same reason duration does: overshoot is a proportion of the distance
 * covered, so a spring that overshoots by half of a 4% press moves less than a
 * pixel and reads as no bounce at all. `bouncy` needs room to bounce in.
 */
export const PRESS_SCALES: Record<AnimationPreset, number> = {
  smooth: 0.96,
  snappy: 0.94,
  bouncy: 0.88,
  none: 1,
}

export const DEFAULT_PRESET: AnimationPreset = 'snappy'

const STEP_SECONDS = 1 / 1000
const MAX_SECONDS = 10
const REST_POSITION = 0.001
const REST_VELOCITY = 0.001

/**
 * The unit step response, integrated rather than solved, so an overdamped and
 * an underdamped spring go through the same code path. Positions are sampled
 * every millisecond, starting at 0 and ending once the spring is at rest.
 */
export const springResponse = (spring: Spring): {positions: number[]; durationMs: number} => {
  const positions: number[] = [0]
  let position = 0
  let velocity = 0
  let elapsed = 0

  while (elapsed < MAX_SECONDS) {
    const acceleration =
      (spring.stiffness * (1 - position) - spring.damping * velocity) / spring.mass
    velocity += acceleration * STEP_SECONDS
    position += velocity * STEP_SECONDS
    elapsed += STEP_SECONDS
    positions.push(position)

    if (Math.abs(1 - position) < REST_POSITION && Math.abs(velocity) < REST_VELOCITY) break
  }

  return {positions, durationMs: Math.round(elapsed * 1000)}
}

/**
 * A CSS `linear()` easing sampled from the same integration. `cubic-bezier`
 * cannot express overshoot at all, so approximating with one would guarantee
 * the CSS-driven components drift away from the Motion-driven ones.
 */
export const toLinearEasing = (spring: Spring, points = 64): string => {
  const {positions} = springResponse(spring)
  const samples: string[] = []

  for (let index = 0; index < points; index++) {
    const at = Math.round((index / (points - 1)) * (positions.length - 1))
    samples.push((positions[at] ?? 1).toFixed(4))
  }

  return `linear(${samples.join(', ')})`
}

export const EASINGS: Record<AnimationPreset, string> = {
  smooth: toLinearEasing(SPRINGS.smooth),
  snappy: toLinearEasing(SPRINGS.snappy),
  bouncy: toLinearEasing(SPRINGS.bouncy),
  none: 'linear',
}

export const DURATIONS_MS: Record<AnimationPreset, number> = {
  smooth: springResponse(SPRINGS.smooth).durationMs,
  snappy: springResponse(SPRINGS.snappy).durationMs,
  bouncy: springResponse(SPRINGS.bouncy).durationMs,
  none: 0,
}

/**
 * Inline rather than a stylesheet variable, so a component works the moment it
 * is copied in -- including when it arrives through the shadcn CLI, which never
 * runs nat-ui's init and so never writes theme CSS.
 */
export const transitionStyle = (
  preset: AnimationPreset,
  properties = 'transform',
): CSSProperties => ({
  transitionProperty: properties,
  transitionDuration: `${String(DURATIONS_MS[preset])}ms`,
  transitionTimingFunction: EASINGS[preset],
})

/**
 * Everything a pressable surface needs: the timing, plus the press depth as a
 * custom property so `:active` can stay in CSS. Handing back both means a
 * `<Link>` styled with `buttonVariants` presses exactly like a `Button`,
 * rather than inheriting the scale while losing the spring that shapes it.
 *
 * `scale` is listed alongside `transform` and is not redundant. Tailwind
 * compiles `scale-*` to the independent `scale` property, which CSS Transforms
 * Level 2 keeps separate from `transform` -- naming only the latter animates
 * nothing, and the press snaps instantly however the spring is tuned.
 */
export const pressStyle = (
  preset: AnimationPreset,
  properties = 'scale, transform, background-color, color',
): CSSProperties =>
  ({
    ...transitionStyle(preset, properties),
    '--press-scale': PRESS_SCALES[preset],
  }) as CSSProperties
