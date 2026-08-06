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
})
