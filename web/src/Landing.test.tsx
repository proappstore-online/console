// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const auth = vi.hoisted(() => ({ signIn: vi.fn(), authError: null as string | null }))
vi.mock('./sdk', () => ({ pro: { auth } }))

import { Landing } from './Header'

beforeEach(() => { auth.signIn.mockReset(); auth.authError = null })
afterEach(cleanup)

describe('Landing (console#2)', () => {
  it('offers GitHub first, then Google, each starting sign-in with its own provider', () => {
    render(<Landing />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Sign in with GitHub', 'Sign in with Google'])

    fireEvent.click(screen.getByRole('button', { name: /sign in with github/i }))
    expect(auth.signIn).toHaveBeenLastCalledWith('github')
    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
    expect(auth.signIn).toHaveBeenLastCalledWith('google')
    expect(auth.signIn).toHaveBeenCalledTimes(2)
  })

  it('uses provider-neutral copy and warns that Google is a separate account', () => {
    render(<Landing />)
    expect(document.body.textContent).not.toContain('Sign in with GitHub to manage your apps')
    expect(screen.getByText('Sign in to manage your apps on ProAppStore.')).toBeTruthy()
    expect(screen.getByText(/Google sign-in creates a separate account/)).toBeTruthy()
  })

  it('shows why the last sign-in failed, and nothing when it did not', () => {
    render(<Landing />)
    expect(screen.queryByRole('alert')).toBeNull()
    cleanup()
    auth.authError = 'access_denied'
    render(<Landing />)
    expect(screen.getByRole('alert').textContent).toContain('access_denied')
  })
})
