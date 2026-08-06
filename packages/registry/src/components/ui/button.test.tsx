// @vitest-environment happy-dom
import {cleanup, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, test} from 'vitest'
import {DEFAULT_PRESET, DURATIONS_MS, EASINGS} from '../../lib/motion'
import {Button} from './button'

afterEach(cleanup)

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

  test('applies the default preset when no animation prop is given', () => {
    render(<Button>Press</Button>)
    const button = screen.getByRole('button', {name: 'Press'})

    expect(button.style.transitionTimingFunction).toBe(EASINGS[DEFAULT_PRESET])
    expect(button.style.transitionDuration).toBe(`${String(DURATIONS_MS[DEFAULT_PRESET])}ms`)
  })

  test('applies the named preset', () => {
    render(<Button animation='bouncy'>Press</Button>)
    const button = screen.getByRole('button', {name: 'Press'})

    expect(button.style.transitionTimingFunction).toBe(EASINGS.bouncy)
  })

  test('lets a caller override the transition through style', () => {
    render(
      <Button animation='bouncy' style={{transitionDuration: '0ms'}}>
        Press
      </Button>,
    )

    expect(screen.getByRole('button', {name: 'Press'}).style.transitionDuration).toBe('0ms')
  })

  test('keeps variant and size independent of animation', () => {
    render(
      <Button variant='destructive' size='lg' animation='smooth'>
        Press
      </Button>,
    )
    const button = screen.getByRole('button', {name: 'Press'})

    expect(button.className).toContain('bg-destructive')
    expect(button.style.transitionTimingFunction).toBe(EASINGS.smooth)
  })
})
