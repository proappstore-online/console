/**
 * @vitest-environment jsdom
 */
// #240: the operator view renders only what the owner-gated API returns; a
// refusal shows why and never renders app data.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { OperatorView } from './OperatorView'

const context = {
  app: { id: 'stash', createdAt: 1 },
  operator: { userId: 'gh:1', login: 'octo' },
  baseline: { usersWithRoles: 4, activity: { days: 30, activeUsers: 7, sessionSeconds: 3600, apiCalls: 120 } },
}

function answer(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('OperatorView', () => {
  it("asks the PAS API for this app's operator context with the session bearer", async () => {
    const fetchMock = answer(200, context)
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    expect(await screen.findByText('Users with roles')).toBeTruthy()
    expect(screen.getByText('Stash — Operator view')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
    expect(screen.getByText('Users')).toBeTruthy()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.proappstore.online/v1/apps/stash/operator')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('shows an owner-only refusal and no data when the API answers 403', async () => {
    answer(403, 'not the app owner')
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    expect((await screen.findByRole('alert')).textContent).toBe("Only the app's owner can open the operator view.")
    expect(screen.queryByText('Users with roles')).toBeNull()
  })

  it('shows a session message and no data when the API answers 401', async () => {
    answer(401, 'invalid or expired session')
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    expect((await screen.findByRole('alert')).textContent).toContain('session has expired')
    expect(screen.queryByText('Users with roles')).toBeNull()
  })

  it('does not call the API when signed out', async () => {
    const fetchMock = answer(200, context)
    render(<OperatorView appId="stash" appName="Stash" getToken={() => null} />)
    expect((await screen.findByRole('alert')).textContent).toContain('Sign in again')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
