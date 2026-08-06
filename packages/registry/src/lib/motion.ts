'use client'

import {type CSSProperties, useEffect, useState} from 'react'

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
 * Chosen by feel against live demos rather than derived. Presets vary physics
 * only -- travel distance and scale depth are fixed by each component, so
 * switching preset changes how a thing moves and never what it does.
 */
export const SPRINGS: Record<Exclude<AnimationPreset, 'none'>, Spring> = {
  smooth: {stiffness: 200, damping: 28, mass: 1},
  snappy: {stiffness: 520, damping: 26, mass: 1},
  bouncy: {stiffness: 340, damping: 9, mass: 1},
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

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Read after mount rather than during render, so a server render and the first
 * client render agree. One frame of motion before the preference applies is
 * preferable to a hydration mismatch on every page.
 */
export const usePrefersReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY)
    setReduced(query.matches)

    const onChange = (event: MediaQueryListEvent): void => {
      setReduced(event.matches)
    }
    query.addEventListener('change', onChange)

    return () => {
      query.removeEventListener('change', onChange)
    }
  }, [])

  return reduced
}

/**
 * The single place the reduced-motion preference is honoured. Components call
 * this instead of reading their `animation` prop directly, so no component can
 * forget.
 */
export const useResolvedPreset = (preset: AnimationPreset = DEFAULT_PRESET): AnimationPreset =>
  usePrefersReducedMotion() ? 'none' : preset

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
