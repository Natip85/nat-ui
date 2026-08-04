import {Input as BaseInput} from '@base-ui/react/input'
import type {ComponentProps} from 'react'
import {cn} from '@/lib/utils'

export type InputProps = Omit<ComponentProps<typeof BaseInput>, 'className'> & {
  className?: string
}

/**
 * Base UI's input rather than a bare element, so that nesting it in a
 * `Field.Root` later wires up validation state and labelling with no change
 * here. The `data-[invalid]` styles are what that state drives.
 */
export function Input({className, ...props}: InputProps) {
  return (
    <BaseInput
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[invalid]:border-destructive data-[invalid]:ring-destructive',
        className,
      )}
      {...props}
    />
  )
}
