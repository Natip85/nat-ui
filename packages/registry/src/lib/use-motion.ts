'use client'

/**
 * The hooks live apart from the rest of the motion language so that
 * `lib/motion.ts` stays free of any runtime React import. A server component
 * cannot import a module that so much as pulls in `useState`, and server
 * components need `transitionStyle` and the preset tables to style things like
 * a `<Link>` that is meant to look and move like a button.
 */

import {useEffect, useState} from 'react'
import {type AnimationPreset, DEFAULT_PRESET} from '@/lib/motion'

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
