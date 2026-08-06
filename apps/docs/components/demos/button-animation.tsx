'use client'

import {Button} from '@nat-ui/registry/components/ui/button'

export function ButtonAnimation() {
  return (
    <div className='flex flex-wrap items-center gap-3'>
      <Button animation='smooth'>Smooth</Button>
      <Button animation='snappy'>Snappy</Button>
      <Button animation='bouncy'>Bouncy</Button>
    </div>
  )
}
