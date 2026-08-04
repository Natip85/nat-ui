// @vitest-environment happy-dom
import {cleanup, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, test} from 'vitest'
import {Button, buttonVariants} from './button'

afterEach(cleanup)

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

describe('Button', () => {
  test('renders a native button carrying its variant classes', () => {
    render(
      <Button variant='destructive' size='lg'>
        Delete
      </Button>,
    )

    const button = screen.getByRole('button', {name: 'Delete'})

    expect(button.tagName).toBe('BUTTON')
    expect(button.className).toContain('bg-destructive')
    expect(button.className).toContain('h-10')
  })

  test('renders as a different element through the render prop', () => {
    render(
      <Button render={<span />} nativeButton={false}>
        Not a button
      </Button>,
    )

    const button = screen.getByRole('button', {name: 'Not a button'})

    expect(button.tagName).toBe('SPAN')
  })

  test('marks itself disabled for assistive technology', () => {
    render(<Button disabled>Off</Button>)

    const button = screen.getByRole('button', {name: 'Off'})

    expect(button).toHaveProperty('disabled', true)
    expect(button.getAttribute('data-disabled')).not.toBeNull()
  })
})
