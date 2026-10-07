/**
 * @vitest-environment jsdom
 */
// platform#297: a deep link to an app's operator tab for a user the platform
// refused shows the 403 state — and no admin data, nor the owner's listing, is
// requested. An admitted admin's operator view needs no owner-only data either.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AppDetail } from './AppDetail'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const props = {
  appId: 'stash', appName: 'Stash', getToken: () => 'tok', onDelete: async () => {}, onReauth: () => {},
  settingsTab: 'storefront' as const, onSettingsTab: () => {},
}

describe('AppDetail operator deep link (platform#297)', () => {
  it('refused: the 403 state, and not a single request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<AppDetail {...props} tab="operator" operatorAccess={{ status: 'refused', httpStatus: 403 }} />)
    expect((await screen.findByRole('alert')).textContent).toContain('admin roles')
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('admitted: the operator view renders without fetching the owner listing', async () => {
    const fetchMock = vi.fn(async () => Response.json({ recorded: true }))
    vi.stubGlobal('fetch', fetchMock)
    const context = {
      app: { id: 'stash', createdAt: 1 }, operator: { userId: 'gh:4', login: 'admina' }, contract: null,
      baseline: { usersWithRoles: 1, activity: { days: 30, activeUsers: 1, sessionSeconds: 0, apiCalls: 0 } },
    }
    render(<AppDetail {...props} tab="operator" operatorAccess={{ status: 'allowed', context }} />)
    expect(await screen.findByText('Users with roles')).toBeTruthy()
    const paths = fetchMock.mock.calls.map((c) => new URL(String((c as unknown[])[0])).pathname)
    expect(paths).toEqual(['/v1/apps/stash/operator/entries'])
  })
})
