// @vitest-environment happy-dom
import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, test} from 'vitest'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog'

afterEach(cleanup)

const example = (props: {defaultOpen?: boolean; showCloseButton?: boolean} = {}) => (
  <Dialog defaultOpen={props.defaultOpen}>
    <DialogTrigger>Open</DialogTrigger>
    <DialogContent showCloseButton={props.showCloseButton}>
      <DialogHeader>
        <DialogTitle>Delete project</DialogTitle>
        <DialogDescription>This cannot be undone.</DialogDescription>
      </DialogHeader>
      <DialogFooter>Footer</DialogFooter>
    </DialogContent>
  </Dialog>
)

describe('Dialog', () => {
  test('stays closed until the trigger is pressed', () => {
    render(example())

    expect(screen.queryByText('Delete project')).toBeNull()

    fireEvent.click(screen.getByRole('button', {name: 'Open'}))

    expect(screen.getByText('Delete project')).not.toBeNull()
    expect(screen.getByText('This cannot be undone.')).not.toBeNull()
  })

  test('labels itself with its title', () => {
    render(example({defaultOpen: true}))

    const dialog = screen.getByRole('dialog')

    expect(dialog.getAttribute('aria-labelledby')).not.toBeNull()
    expect(dialog.getAttribute('aria-describedby')).not.toBeNull()
  })

  test('offers a close control styled as a ghost icon button', () => {
    render(example({defaultOpen: true}))

    const close = screen.getByRole('button', {name: 'Close'})

    expect(close.className).toContain('hover:bg-accent')
  })

  test('omits the close control when asked', () => {
    render(example({defaultOpen: true, showCloseButton: false}))

    expect(screen.queryByRole('button', {name: 'Close'})).toBeNull()
  })
})
