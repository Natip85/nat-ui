'use client'

import {Button} from '@nat-ui/registry/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@nat-ui/registry/components/ui/dialog'

export function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant='outline'>Open dialog</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete project</DialogTitle>
          <DialogDescription>
            This permanently removes the project and everything in it. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className='mt-6'>
          <DialogClose render={<Button variant='outline'>Cancel</Button>} />
          <DialogClose render={<Button variant='destructive'>Delete</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
