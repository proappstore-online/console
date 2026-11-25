/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RolesManager } from './RolesManager'

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const roles = [
  { user_id: 'gh:1', role_name: 'owner', granted_by: null, granted_at: 1, user_login: 'ada' },
  { user_id: 'gh:2', role_name: 'editor', granted_by: 'gh:1', granted_at: 2, user_login: 'bob' },
  { user_id: 'google:9', role_name: 'member', granted_by: null, granted_at: 3, user_login: null },
]

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('RolesManager (console#19)', () => {
  it('lists the team, and counts signed-in users separately with what member means', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ roles })))
    render(<RolesManager appId="a" getToken={() => 't'} />)
    expect(await screen.findByText('@bob')).toBeTruthy()
    expect(screen.getByText(/1 signed-in user/).textContent).toContain('No extra permissions')
    expect(screen.getByText('google:9').closest('details')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove @ada' })).toBeNull() // the owner can't be removed
  })

  it('explains the picked role, and removes only after a confirm', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init?.method ?? 'GET')
      return response(init?.method === 'DELETE' ? { ok: true } : { roles })
    }))
    render(<RolesManager appId="a" getToken={() => 't'} />)
    await screen.findByText('@bob')
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'viewer' } })
    expect(screen.getByText('Read-only access to app analytics and settings.', { selector: 'form p' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove @bob' }))
    expect(calls).not.toContain('DELETE')
    fireEvent.click(screen.getByRole('button', { name: 'Remove editor' }))
    await waitFor(() => expect(calls).toContain('DELETE'))
  })
})
