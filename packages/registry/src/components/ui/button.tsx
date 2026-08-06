'use client'

import {Button as BaseButton} from '@base-ui/react/button'
import type {VariantProps} from 'class-variance-authority'
import type {ComponentProps} from 'react'
import {buttonVariants} from '@/components/ui/button-variants'
import {type AnimationPreset, DEFAULT_PRESET, transitionStyle} from '@/lib/motion'
import {useResolvedPreset} from '@/lib/use-motion'
import {cn} from '@/lib/utils'

/**
 * `className` is narrowed to a string. Base UI also accepts a function of the
 * component's state there, but `cn` composes strings, and no variant here needs
 * state to decide its classes.
 */
export type ButtonProps = Omit<ComponentProps<typeof BaseButton>, 'className'> &
  VariantProps<typeof buttonVariants> & {
    className?: string
    /** How the press responds. Independent of `variant` and `size`. */
    animation?: AnimationPreset
  }

export function Button({
  className,
  variant,
  size,
  animation = DEFAULT_PRESET,
  style,
  ...props
}: ButtonProps) {
  const preset = useResolvedPreset(animation)
  // Spread last so a caller's own style wins, the same way `className` does.
  const transition = transitionStyle(preset, 'transform, background-color, color')

  return (
    <BaseButton
      className={cn(buttonVariants({variant, size, className}))}
      style={{...transition, ...style}}
      {...props}
    />
  )
}
