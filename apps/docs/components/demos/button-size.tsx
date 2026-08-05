import {Button} from '@nat-ui/registry/components/ui/button'

export function ButtonSize() {
  return (
    <div className='flex flex-wrap items-center gap-3'>
      <Button size='sm'>Small</Button>
      <Button>Default</Button>
      <Button size='lg'>Large</Button>
    </div>
  )
}
