'use client'

import {Dialog as BaseDialog} from '@base-ui/react/dialog'
import {XIcon} from 'lucide-react'
import type {ComponentProps} from 'react'
import {buttonVariants} from '@/components/ui/button'
import {cn} from '@/lib/utils'

export const Dialog = BaseDialog.Root
export const DialogTrigger = BaseDialog.Trigger
export const DialogPortal = BaseDialog.Portal
export const DialogClose = BaseDialog.Close

type Styleable<T> = Omit<T, 'className'> & {className?: string}

export function DialogOverlay({
  className,
  ...props
}: Styleable<ComponentProps<typeof BaseDialog.Backdrop>>) {
  return (
    <BaseDialog.Backdrop
      className={cn(
        'fixed inset-0 z-50 bg-black/50 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
        className,
      )}
      {...props}
    />
  )
}

export type DialogContentProps = Styleable<ComponentProps<typeof BaseDialog.Popup>> & {
  showCloseButton?: boolean
}

/**
 * Portal, overlay, viewport, and popup in one element, which is the shape
 * people expect from `DialogContent`. `Dialog.Viewport` is Base UI's
 * positioning container and stays an internal detail.
 */
export function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <BaseDialog.Viewport className='fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4'>
        <BaseDialog.Popup
          className={cn(
            'relative w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg transition-all duration-200 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton ? (
            <BaseDialog.Close
              aria-label='Close'
              className={cn(
                buttonVariants({variant: 'ghost', size: 'icon'}),
                'absolute right-3 top-3 size-7',
              )}
            >
              <XIcon />
            </BaseDialog.Close>
          ) : null}
        </BaseDialog.Popup>
      </BaseDialog.Viewport>
    </DialogPortal>
  )
}

export function DialogHeader({className, ...props}: ComponentProps<'div'>) {
  return (
    <div className={cn('flex flex-col gap-1.5 text-center sm:text-left', className)} {...props} />
  )
}

export function DialogFooter({className, ...props}: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  )
}

export function DialogTitle({
  className,
  ...props
}: Styleable<ComponentProps<typeof BaseDialog.Title>>) {
  return (
    <BaseDialog.Title
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: Styleable<ComponentProps<typeof BaseDialog.Description>>) {
  return (
    <BaseDialog.Description className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
}
