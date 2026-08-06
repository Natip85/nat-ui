'use client'

import {Button} from '@nat-ui/registry/components/ui/button'
import {
  type AnimationPreset,
  DURATIONS_MS,
  PRESS_SCALES,
  transitionStyle,
} from '@nat-ui/registry/lib/motion'
import {usePrefersReducedMotion} from '@nat-ui/registry/lib/use-motion'
import {useState} from 'react'

const PRESETS = ['smooth', 'snappy', 'bouncy'] as const

/**
 * One trigger drives all three, because comparing presets by pressing three
 * separate buttons means comparing the third against a memory of the first.
 */
export function ButtonAnimation() {
  const [pressed, setPressed] = useState(false)
  const reduced = usePrefersReducedMotion()
  const release = () => {
    setPressed(false)
  }

  return (
    <div className='flex flex-col items-center gap-6 py-4'>
      <div className='flex flex-wrap items-end justify-center gap-8'>
        {PRESETS.map((name) => {
          const preset: AnimationPreset = reduced ? 'none' : name

          return (
            <div key={name} className='flex flex-col items-center gap-2'>
              <div
                className='bg-primary text-primary-foreground flex h-9 items-center rounded-md px-4 text-sm font-medium shadow'
                style={{
                  ...transitionStyle(preset),
                  transform: `scale(${String(pressed ? PRESS_SCALES[preset] : 1)})`,
                }}
              >
                {name}
              </div>
              <span className='text-fd-muted-foreground font-mono text-xs'>
                {DURATIONS_MS[preset]}ms
              </span>
            </div>
          )
        })}
      </div>

      {/* Keyboard handlers alongside pointer ones: a press you can only reach
          with a mouse leaves keyboard users with three static rectangles. */}
      <Button
        onBlur={release}
        onKeyDown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') setPressed(true)
        }}
        onKeyUp={release}
        onPointerDown={() => {
          setPressed(true)
        }}
        onPointerLeave={release}
        onPointerUp={release}
      >
        Hold to press all three
      </Button>
    </div>
  )
}
