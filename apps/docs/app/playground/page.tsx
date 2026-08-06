'use client'

import {Button} from '@nat-ui/registry/components/ui/button'
import {
  type AnimationPreset,
  DURATIONS_MS,
  PRESS_SCALES,
  SPRINGS,
} from '@nat-ui/registry/lib/motion'
import {useState} from 'react'

const PRESETS: AnimationPreset[] = [...(Object.keys(SPRINGS) as AnimationPreset[]), 'none']
const VARIANTS = ['default', 'secondary', 'destructive', 'outline', 'ghost', 'link'] as const
const SIZES = ['sm', 'default', 'lg', 'icon'] as const

type Variant = (typeof VARIANTS)[number]
type Size = (typeof SIZES)[number]

export default function PlaygroundPage() {
  const [animation, setAnimation] = useState<AnimationPreset>('snappy')
  const [variant, setVariant] = useState<Variant>('default')
  const [size, setSize] = useState<Size>('default')

  return (
    <main className='mx-auto flex max-w-3xl flex-col gap-8 p-8'>
      <div>
        <h1 className='text-2xl font-semibold'>Playground</h1>
        <p className='text-sm opacity-70'>
          Not linked from anywhere. Press things, change the preset, press them again.
        </p>
      </div>

      <div className='flex flex-wrap gap-6'>
        <label className='flex flex-col gap-1 text-sm'>
          Animation
          <select
            className='rounded-md border px-2 py-1'
            value={animation}
            onChange={(event) => {
              setAnimation(event.target.value as AnimationPreset)
            }}
          >
            {PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
          </select>
        </label>

        <label className='flex flex-col gap-1 text-sm'>
          Variant
          <select
            className='rounded-md border px-2 py-1'
            value={variant}
            onChange={(event) => {
              setVariant(event.target.value as Variant)
            }}
          >
            {VARIANTS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className='flex flex-col gap-1 text-sm'>
          Size
          <select
            className='rounded-md border px-2 py-1'
            value={size}
            onChange={(event) => {
              setSize(event.target.value as Size)
            }}
          >
            {SIZES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className='flex min-h-32 flex-col items-center justify-center gap-3 rounded-lg border p-8'>
        <Button animation={animation} variant={variant} size={size}>
          {size === 'icon' ? 'B' : 'Press me'}
        </Button>
        <p className='font-mono text-xs opacity-60'>
          {DURATIONS_MS[animation]}ms · presses to {PRESS_SCALES[animation]}
        </p>
      </div>

      <div className='flex flex-col gap-3'>
        <p className='text-sm font-medium'>All three at once</p>
        <div className='flex flex-wrap items-center gap-3'>
          <Button animation='smooth'>Smooth</Button>
          <Button animation='snappy'>Snappy</Button>
          <Button animation='bouncy'>Bouncy</Button>
          <Button animation='none'>None</Button>
        </div>
      </div>
    </main>
  )
}
