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

export function DialogNoCloseButton() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant='outline'>Open dialog</Button>} />
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Accept the terms</DialogTitle>
          <DialogDescription>
            Dropping the corner button leaves the footer as the only way out, which suits a choice
            the reader has to make deliberately.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className='mt-6'>
          <DialogClose render={<Button>Accept</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
