import {describe, expect, test} from 'vitest'
import {
  DEFAULT_PRESET,
  DURATIONS_MS,
  EASINGS,
  PRESS_SCALES,
  pressStyle,
  SPRINGS,
  springResponse,
  toLinearEasing,
} from './motion'

describe('springResponse', () => {
  test('settles at rest for every preset', () => {
    for (const spring of Object.values(SPRINGS)) {
      const {positions} = springResponse(spring)

      expect(positions.at(-1)).toBeCloseTo(1, 2)
    }
  })

  test('reports a positive duration for every preset', () => {
    for (const spring of Object.values(SPRINGS)) {
      expect(springResponse(spring).durationMs).toBeGreaterThan(0)
    }
  })

  test('smooth never overshoots', () => {
    const {positions} = springResponse(SPRINGS.smooth)

    expect(Math.max(...positions)).toBeLessThanOrEqual(1.001)
  })

  test('snappy overshoots, but only slightly', () => {
    const peak = Math.max(...springResponse(SPRINGS.snappy).positions)

    expect(peak).toBeGreaterThan(1.001)
    expect(peak).toBeLessThan(1.15)
  })

  test('bouncy overshoots noticeably more than snappy', () => {
    const bouncy = Math.max(...springResponse(SPRINGS.bouncy).positions)
    const snappy = Math.max(...springResponse(SPRINGS.snappy).positions)

    expect(bouncy).toBeGreaterThan(snappy)
    expect(bouncy).toBeGreaterThan(1.2)
  })

  test('bouncy crosses the resting position more than once', () => {
    const {positions} = springResponse(SPRINGS.bouncy)
    let crossings = 0
    for (let i = 1; i < positions.length; i++) {
      const before = (positions[i - 1] ?? 0) - 1
      const after = (positions[i] ?? 0) - 1
      if (before < 0 !== after < 0) crossings++
    }

    expect(crossings).toBeGreaterThan(1)
  })
})

describe('toLinearEasing', () => {
  test('emits a linear() function with the requested number of points', () => {
    const easing = toLinearEasing(SPRINGS.snappy, 10)
    const inner = easing.slice('linear('.length, -1)

    expect(easing.startsWith('linear(')).toBe(true)
    expect(easing.endsWith(')')).toBe(true)
    expect(inner.split(', ')).toHaveLength(10)
  })

  test('starts at rest and ends at rest', () => {
    const inner = toLinearEasing(SPRINGS.bouncy, 20).slice('linear('.length, -1)
    const points = inner.split(', ').map(Number)

    expect(points[0]).toBeCloseTo(0, 2)
    expect(points.at(-1)).toBeCloseTo(1, 2)
  })
})

describe('the derived tables', () => {
  test('EASINGS and DURATIONS_MS cover exactly the presets', () => {
    const presets = [...Object.keys(SPRINGS), 'none'].sort()

    expect(Object.keys(EASINGS).sort()).toEqual(presets)
    expect(Object.keys(DURATIONS_MS).sort()).toEqual(presets)
  })

  test('every spring preset derives its easing from its own spring', () => {
    // The whole point of the layer: one constant, two outputs. If these ever
    // diverge, CSS-driven and Motion-driven components stop matching and
    // nothing else would notice.
    for (const [name, spring] of Object.entries(SPRINGS)) {
      expect(EASINGS[name as keyof typeof SPRINGS]).toBe(toLinearEasing(spring))
      expect(DURATIONS_MS[name as keyof typeof SPRINGS]).toBe(springResponse(spring).durationMs)
    }
  })

  test('none is instant', () => {
    expect(DURATIONS_MS.none).toBe(0)
  })

  test('the default preset is snappy', () => {
    expect(DEFAULT_PRESET).toBe('snappy')
  })

  test('every preset settles in a duration a UI can actually use', () => {
    // The defect this catches is not a coding error but a category error:
    // constants tuned in a live spring simulation carry a long, invisible tail,
    // and a fixed-duration CSS transition turns that tail into part of the
    // animation's declared length. The original constants produced 838ms,
    // 658ms and 1575ms, all of which pass every other test in this file.
    for (const preset of Object.keys(SPRINGS) as (keyof typeof SPRINGS)[]) {
      expect(DURATIONS_MS[preset]).toBeGreaterThan(80)
      expect(DURATIONS_MS[preset]).toBeLessThan(1200)
    }
  })

  test('the presets are far enough apart to tell apart', () => {
    // A previous tuning put all three within 49ms of each other and let only
    // the overshoot differ. That is defensible physics and a useless product:
    // on a button the entire visible difference came to half a pixel, and the
    // three presets were indistinguishable in the browser. Duration is the cue
    // the eye actually reads, so it is the one pinned here.
    expect(DURATIONS_MS.snappy).toBeLessThan(DURATIONS_MS.smooth / 1.5)
    expect(DURATIONS_MS.bouncy).toBeGreaterThan(DURATIONS_MS.smooth * 2)
  })

  test('a preset that overshoots more also presses deeper', () => {
    // Overshoot is a proportion of the distance travelled, so the two have to
    // move together or the bounce has nothing to happen in.
    expect(PRESS_SCALES.bouncy).toBeLessThan(PRESS_SCALES.snappy)
    expect(PRESS_SCALES.snappy).toBeLessThan(PRESS_SCALES.smooth)
    expect(PRESS_SCALES.none).toBe(1)
  })
})

describe('pressStyle', () => {
  test('carries the preset timing and the press depth together', () => {
    const style = pressStyle('bouncy') as Record<string, unknown>

    expect(style.transitionDuration).toBe(`${String(DURATIONS_MS.bouncy)}ms`)
    expect(style.transitionTimingFunction).toBe(EASINGS.bouncy)
    expect(style['--press-scale']).toBe(PRESS_SCALES.bouncy)
  })

  test('transitions the scale property, not just transform', () => {
    // Tailwind's `scale-*` sets the independent `scale` property, which CSS
    // Transforms Level 2 does not fold into `transform`. Naming only
    // `transform` here left every preset's press snapping instantly, which is
    // how three differently tuned springs came to look identical in a browser
    // while every test in this file passed.
    const properties = String((pressStyle('bouncy') as Record<string, unknown>).transitionProperty)

    expect(properties.split(', ')).toContain('scale')
  })

  test('none neither moves nor takes time', () => {
    const style = pressStyle('none') as Record<string, unknown>

    expect(style.transitionDuration).toBe('0ms')
    expect(style['--press-scale']).toBe(1)
  })
})
