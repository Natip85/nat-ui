import {Button} from '@nat-ui/registry/components/ui/button'
import {ChevronRightIcon} from 'lucide-react'

export function ButtonIcon() {
  return (
    <Button variant='outline' size='icon' aria-label='Next'>
      <ChevronRightIcon />
    </Button>
  )
}
