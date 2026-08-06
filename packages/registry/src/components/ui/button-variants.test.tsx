import {describe, expect, test} from 'vitest'
import {buttonVariants} from './button-variants'

describe('buttonVariants', () => {
  test('defaults to the primary variant at the default size', () => {
    const classes = buttonVariants()

    expect(classes).toContain('bg-primary')
    expect(classes).toContain('h-9')
  })

  test('selects the variant and size asked for', () => {
    expect(buttonVariants({variant: 'ghost'})).toContain('hover:bg-accent')
    expect(buttonVariants({variant: 'destructive'})).toContain('bg-destructive')
    expect(buttonVariants({variant: 'link'})).toContain('underline-offset-4')
    expect(buttonVariants({size: 'icon'})).toContain('size-9')
  })

  test('appends caller classes so they can override', () => {
    expect(buttonVariants({className: 'w-full'})).toContain('w-full')
  })

  test('takes its press depth from the preset', () => {
    // The literal that used to be here meant every preset pressed equally far,
    // which left `bouncy` bouncing across half a pixel.
    expect(buttonVariants()).toContain('active:scale-[var(--press-scale,0.96)]')
  })

  test('stops moving under reduced motion, loudly enough to beat an inline style', () => {
    // `pressStyle` writes the duration and press depth inline, and a plain
    // class cannot override that. Drop the `!` and reduced motion silently
    // stops working for any server-rendered link, which cannot run the hook
    // that `Button` relies on.
    const classes = buttonVariants()

    expect(classes).toContain('motion-reduce:transition-none!')
    expect(classes).toContain('motion-reduce:active:scale-100!')
  })
})
