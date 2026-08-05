import {Button} from '@nat-ui/registry/components/ui/button'

export function ButtonDemo() {
  return (
    <div className='flex flex-wrap items-center gap-3'>
      <Button>Default</Button>
      <Button variant='secondary'>Secondary</Button>
      <Button variant='destructive'>Destructive</Button>
      <Button variant='outline'>Outline</Button>
      <Button variant='ghost'>Ghost</Button>
      <Button variant='link'>Link</Button>
    </div>
  )
}
