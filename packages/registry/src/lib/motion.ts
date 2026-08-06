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
 * The damping ratio -- c / (2·√(k·m)), which sets how far a spring overshoots
 * and how many times it crosses rest -- was chosen by feel against live demos.
 * The absolute stiffness and damping are not: they are scaled up together,
 * ratio held fixed, until each preset settles in roughly 400ms. A live
 * simulation hides a spring's long low-amplitude tail as sub-pixel wobble, but
 * these constants also drive a fixed-duration CSS transition, where that same
 * tail becomes part of the declared length instead of something invisible.
 * Presets vary physics only -- travel distance and scale depth are fixed by
 * each component, so switching preset changes how a thing moves and never
 * what it does.
 */
export const SPRINGS: Record<Exclude<AnimationPreset, 'none'>, Spring> = {
  smooth: {stiffness: 1080, damping: 65, mass: 1},
  snappy: {stiffness: 1400, damping: 43, mass: 1},
  bouncy: {stiffness: 5200, damping: 35, mass: 1},
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
