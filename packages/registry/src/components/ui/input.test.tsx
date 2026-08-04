// @vitest-environment happy-dom
import {cleanup, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, test} from 'vitest'
import {Input} from './input'

afterEach(cleanup)

describe('Input', () => {
  test('renders a text box with its base classes', () => {
    render(<Input placeholder='Email' />)

    const input = screen.getByPlaceholderText('Email')

    expect(input.tagName).toBe('INPUT')
    expect(input.className).toContain('border-input')
    expect(input.className).toContain('h-9')
  })

  test('reflects the disabled state', () => {
    render(<Input placeholder='Email' disabled />)

    expect(screen.getByPlaceholderText('Email')).toHaveProperty('disabled', true)
  })

  test('passes through the value and type', () => {
    render(<Input type='email' defaultValue='a@b.c' placeholder='Email' />)

    const input = screen.getByPlaceholderText('Email')

    expect(input.getAttribute('type')).toBe('email')
    expect(input).toHaveProperty('value', 'a@b.c')
  })

  test('keeps caller classes alongside its own', () => {
    render(<Input placeholder='Email' className='w-64' />)

    expect(screen.getByPlaceholderText('Email').className).toContain('w-64')
  })
})
