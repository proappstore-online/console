/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AppPublicTeam } from './AppPublicTeam'

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const me = { user_id: 'gh:1', role: 'owner', display_name: 'Ada L.', label: 'Maintainer', visible: true, updated_at: 1 }
const other = { user_id: 'gh:2', role: 'admin', display_name: 'Bob', label: 'Designer', visible: true, updated_at: 1 }
const hidden = { user_id: 'gh:3', role: 'viewer', display_name: null, label: null, visible: false, updated_at: null }

function route(opts: { roster?: unknown[] | 403; pub?: unknown[]; onWrite?: (m: string, url: string, body: unknown) => Response }) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') return opts.onWrite?.(method, url, init?.body ? JSON.parse(String(init.body)) : null) ?? response({ ok: true })
    if (url.includes('/storefront/')) return response({ members: opts.pub ?? [] })
    if (opts.roster === 403) return response({ error: 'forbidden' }, 403)
    return response({ appId: 'a', members: opts.roster ?? [] })
  })
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('AppPublicTeam (console#11)', () => {
  it('owner: prefills their own profile, previews it, and never shows emails, ids or roles', async () => {
    vi.stubGlobal('fetch', route({ roster: [me, other, hidden], pub: [{ display_name: 'Ada L.', label: 'Maintainer', is_creator: true }] }))
    render(<AppPublicTeam appId="a" getToken={() => 't'} userId="gh:1" />)
    expect(((await screen.findByLabelText('Display name')) as HTMLInputElement).value).toBe('Ada L.')
    expect(screen.getByLabelText('Preview').textContent).toContain('Ada L. · Maintainer')
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/gh:\d|admin|viewer|@/)
  })

  it('saves with the exact contract body, and a withdraw sends DELETE', async () => {
    const writes: [string, string, unknown][] = []
    vi.stubGlobal('fetch', route({ roster: [me], onWrite: (m, u, b) => { writes.push([m, new URL(u).pathname, b]); return response({ ok: true }) } }))
    render(<AppPublicTeam appId="a" getToken={() => 't'} userId="gh:1" />)
    fireEvent.change(await screen.findByLabelText('Display name'), { target: { value: '  Ada Lovelace ' } })
    fireEvent.change(screen.getByLabelText('Label (optional)'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await screen.findByText('Saved. Your profile is public.')
    expect(writes[0]).toEqual(['PUT', '/v1/apps/a/team/public/me', { display_name: 'Ada Lovelace', visible: true }])
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw from public team' }))
    await screen.findByText(/Withdrawn/)
    expect(writes[1]).toEqual(['DELETE', '/v1/apps/a/team/public/me', null])
    expect((screen.getByLabelText(/Show me on/) as HTMLInputElement).checked).toBe(false)
  })

  it('cannot save a visible profile without a name', async () => {
    vi.stubGlobal('fetch', route({ roster: [hidden] }))
    render(<AppPublicTeam appId="a" getToken={() => 't'} userId="gh:3" />)
    fireEvent.click(await screen.findByLabelText(/Show me on/))
    expect((screen.getByRole('button', { name: 'Save profile' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Add a display name to appear publicly.')).toBeTruthy()
  })

  it('non-owner collaborator: the owner-only roster is refused and simply not shown', async () => {
    vi.stubGlobal('fetch', route({ roster: 403, pub: [{ display_name: 'Ada L.', label: null, is_creator: true }] }))
    render(<AppPublicTeam appId="a" getToken={() => 't'} userId="gh:2" />)
    await screen.findByLabelText('Display name')
    expect(screen.queryByText('Moderate the public list')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Ada L.')).toBeTruthy()
  })

  it('shows the server refusal when a non-member tries to publish (403)', async () => {
    vi.stubGlobal('fetch', route({ roster: 403, onWrite: () => response({ error: 'only a current team member can publish a profile' }, 403) }))
    render(<AppPublicTeam appId="a" getToken={() => 't'} userId="gh:9" />)
    fireEvent.change(await screen.findByLabelText('Display name'), { target: { value: 'X' } })
    fireEvent.click(screen.getByLabelText(/Show me on/))
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Only a current member')
  })

  it('owner moderation: hides someone else by id, not themselves, and only visible entries', async () => {
    const writes: [string, string][] = []
    vi.stubGlobal('fetch', route({ roster: [me, other, hidden], onWrite: (m, u) => { writes.push([m, new URL(u).pathname]); return response({ ok: true, visible: false }) } }))
    render(<AppPublicTeam appId="a" getToken={() => 't'} userId="gh:1" />)
    const list = (await screen.findByText('Moderate the public list')).parentElement!
    expect(within(list).queryByRole('button', { name: /Hide Ada/ })).toBeNull()
    expect(within(list).getAllByRole('button')).toHaveLength(1)
    fireEvent.click(within(list).getByRole('button', { name: 'Hide Bob from the public list' }))
    await screen.findByText(/Bob is no longer on the public list/)
    expect(writes[0]).toEqual(['DELETE', '/v1/apps/a/team/public/gh%3A2'])
    expect(within(list).queryByRole('button', { name: /Hide Bob/ })).toBeNull()
  })

  it('load error offers retry; a private/missing app (404) is an empty list, not an error', async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(async (url: string) => url.includes('/storefront/') ? response({ error: 'not found' }, 404) : response({ appId: 'a', members: [] }))
    vi.stubGlobal('fetch', f)
    render(<AppPublicTeam appId="a" getToken={() => 't'} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    await screen.findByText('No one is on the public team yet.')
  })

  it('ignores a stale response after switching apps', async () => {
    let release: (r: Response) => void = () => {}
    const f = vi.fn((url: string) => {
      if (url.includes('/apps/a/team/public')) return new Promise<Response>((r) => { release = r })
      if (url.includes('/storefront/apps/a/')) return Promise.resolve(response({ members: [{ display_name: 'From A', label: null, is_creator: false }] }))
      if (url.includes('/storefront/apps/b/')) return Promise.resolve(response({ members: [{ display_name: 'From B', label: null, is_creator: false }] }))
      return Promise.resolve(response({ appId: 'b', members: [] }))
    })
    vi.stubGlobal('fetch', f)
    const { rerender } = render(<AppPublicTeam appId="a" getToken={() => 't'} />)
    rerender(<AppPublicTeam appId="b" getToken={() => 't'} />)
    await screen.findByText('From B')
    release(response({ appId: 'a', members: [] }))
    await waitFor(() => expect(screen.queryByText('From A')).toBeNull())
    expect(screen.getByText('From B')).toBeTruthy()
  })
})
