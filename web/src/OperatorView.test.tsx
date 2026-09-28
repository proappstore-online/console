/**
 * @vitest-environment jsdom
 */
// #240: the operator view renders only what the owner-gated API returns; a
// refusal shows why and never renders app data. Declared contracts render
// generically: two different sample apps go through the same component.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { OperatorView } from './OperatorView'
import { formatCell } from './operator'
import type { OperatorContract } from './operator'

const baseline = {
  app: { id: 'stash', createdAt: 1 },
  operator: { userId: 'gh:1', login: 'octo' },
  baseline: { usersWithRoles: 4, activity: { days: 30, activeUsers: 7, sessionSeconds: 3600, apiCalls: 120 } },
  contract: null,
}

// As the platform stores and returns them (validated, normalized).
const STASH: OperatorContract = {
  version: 1,
  resources: [
    { id: 'members', kind: 'users', title: 'Members', description: null, action: 'op_list_users', columns: [
      { key: 'display_name', label: 'Name', format: 'text' },
      { key: 'user_id', label: 'User ID', format: 'text' },
      { key: 'suspended', label: 'Suspended', format: 'boolean' },
    ],
    search: { param: 'q' },
    page: { param: 'after', column: 'user_id', size: 2 },
    detail: { action: 'op_member_detail', param: 'user_id', key: 'user_id', step_up: false, fields: [
      { key: 'display_name', label: 'Name', format: 'text' },
      { key: 'email', label: 'Email', format: 'text' },
      { key: 'pocket_count', label: 'Pockets', format: 'number' },
    ] } },
    { id: 'moderation', kind: 'metrics', title: 'Moderation', description: null, action: 'op_report_metrics', columns: [
      { key: 'open_reports', label: 'Open reports', format: 'number' },
      { key: 'suspended_users', label: 'Suspended', format: 'number' },
    ] },
  ],
  actions: [
    { id: 'suspend_member', title: 'Suspend', resource: 'members', action: 'op_suspend_user', params: { user_id: 'user_id' }, confirm: 'Suspend this member?', step_up: false },
  ],
}

const PARENTS_CLUBS: OperatorContract = {
  version: 1,
  resources: [
    { id: 'parents', kind: 'users', title: 'Parents', description: null, action: 'op_list_parents', columns: [
      { key: 'full_name', label: 'Parent', format: 'text' },
      { key: 'club_name', label: 'Club', format: 'text' },
      { key: 'user_id', label: 'User', format: 'text' },
    ],
    search: { param: 'search' },
    page: { param: 'cursor', column: 'user_id', size: 25 },
    detail: { action: 'op_parent_detail', param: 'id', key: 'user_id', step_up: false, fields: [
      { key: 'full_name', label: 'Parent', format: 'text' },
      { key: 'joined_at', label: 'Joined', format: 'datetime' },
    ] } },
    { id: 'id_checks', kind: 'verification', title: 'ID checks', description: 'Pending ID checks.', action: 'op_pending_verifications', columns: [
      { key: 'parent_name', label: 'Parent', format: 'text' },
      { key: 'request_id', label: 'Request', format: 'text' },
    ] },
  ],
  actions: [
    { id: 'approve', title: 'Approve', resource: 'id_checks', action: 'op_approve_verification', params: { request_id: 'request_id' }, confirm: 'Approve this ID check?', step_up: true },
  ],
}

// Built at runtime so the static a11y scan doesn't read the probe as a real <img> tag.
const XSS = ['<', 'img src=x onerror=alert(1)>'].join('')

// What the operator resource routes answer (declared columns only), by resource id.
const ROWS: Record<string, unknown> = {
  members: { rows: [{ display_name: 'Ada', user_id: 'u1', suspended: 0 }, { display_name: XSS, user_id: 'u2', suspended: 1 }], next_cursor: null },
  moderation: { rows: [{ open_reports: 1234, suspended_users: 3 }], next_cursor: null },
  parents: { rows: [{ full_name: 'Grace', club_name: 'Chess', user_id: 'p/1' }], next_cursor: null },
  id_checks: { rows: [{ parent_name: 'Grace', request_id: 'r9' }], next_cursor: null },
}

type Reply = { status: number; body: unknown }
type Route = Reply | ((url: URL) => Reply)
/** The operator context, resource reads (`resource:<id>`, `record:<id>`) and action posts (`<action name>`). */
function serve(context: unknown, routes: Record<string, Route> = {}) {
  const fetchMock = vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(raw)
    if (url.pathname.endsWith('/operator')) return Response.json(context)
    const m = /\/operator\/resources\/([^/]+)(\/records\/[^/]+)?$/.exec(url.pathname)
    const name = m ? `${m[2] ? 'record' : 'resource'}:${decodeURIComponent(m[1]!)}` : /\/actions\/([^/]+)$/.exec(url.pathname)?.[1] ?? ''
    const route = routes[name]
    const r = typeof route === 'function' ? route(url) : route ?? { status: 200, body: ROWS[name.replace('resource:', '')] ?? {} }
    void init
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const callsTo = (fetchMock: ReturnType<typeof serve>, action: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith(`/actions/${action}`))
const readsOf = (fetchMock: ReturnType<typeof serve>, resourceId: string) =>
  fetchMock.mock.calls.map(([url]) => new URL(String(url))).filter((u) => u.pathname.endsWith(`/operator/resources/${resourceId}`))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('OperatorView — access', () => {
  it("asks the PAS API for this app's operator context with the session bearer", async () => {
    const fetchMock = serve(baseline)
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    expect(await screen.findByText('Users with roles')).toBeTruthy()
    expect(screen.getByText('Stash — Operator view')).toBeTruthy()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.proappstore.online/v1/apps/stash/operator')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('shows an owner-only refusal and no data when the API answers 403', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not the app owner', { status: 403 })))
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    expect((await screen.findByRole('alert')).textContent).toBe("Only the app's owner can open the operator view.")
    expect(screen.queryByText('Users with roles')).toBeNull()
  })

  it('shows a session message and no data when the API answers 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('invalid or expired session', { status: 401 })))
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    expect((await screen.findByRole('alert')).textContent).toContain('session has expired')
    expect(screen.queryByText('Users with roles')).toBeNull()
  })

  it('does not call the API when signed out', async () => {
    const fetchMock = serve(baseline)
    render(<OperatorView appId="stash" appName="Stash" getToken={() => null} />)
    expect((await screen.findByRole('alert')).textContent).toContain('Sign in again')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('OperatorView — generic contract rendering', () => {
  it('an app that declares nothing gets the baseline only, and no action is called', async () => {
    const fetchMock = serve(baseline)
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    expect(await screen.findByText(/declares no operator view yet/)).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url]) => /\/actions\/|\/resources\//.test(String(url)))).toBe(false)
  })

  it('renders Stash: users table with formatted cells, metrics as KPIs, undeclared kinds listed', async () => {
    serve({ ...baseline, contract: STASH })
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    const members = (await screen.findByText('Members')).closest('section')!
    expect(await within(members).findByText('Ada')).toBeTruthy()
    expect(within(members).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Name', 'User ID', 'Suspended', 'Actions'])
    expect(within(members).getByText('Yes')).toBeTruthy()
    expect(within(members).getAllByRole('button', { name: 'Suspend' })).toHaveLength(2)
    const moderation = screen.getByText('Moderation').closest('section')!
    expect(await within(moderation).findByText((1234).toLocaleString())).toBeTruthy()
    expect(screen.getByText(/Not declared by this app: Reports, Suspensions, ID verification\./)).toBeTruthy()
  })

  it('renders app-supplied values as text, never HTML', async () => {
    serve({ ...baseline, contract: STASH })
    const { container } = render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    expect(await screen.findByText(XSS)).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('runs a row action with params mapped from the row, only after confirmation, then reloads', async () => {
    const fetchMock = serve({ ...baseline, contract: STASH }, { op_suspend_user: { status: 200, body: { meta: { changes: 1 } } } })
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    const members = (await screen.findByText('Members')).closest('section')!
    await within(members).findByText('Ada')

    fireEvent.click(within(members).getAllByRole('button', { name: 'Suspend' })[0]!)
    expect(confirm).toHaveBeenCalledWith('Suspend this member?')
    expect(callsTo(fetchMock, 'op_suspend_user')).toHaveLength(0)

    confirm.mockReturnValue(true)
    fireEvent.click(within(members).getAllByRole('button', { name: 'Suspend' })[0]!)
    await within(members).findByText('Suspend: done.')
    const [[url, init]] = callsTo(fetchMock, 'op_suspend_user') as unknown as [string, RequestInit][]
    expect(url).toBe('https://api.proappstore.online/v1/apps/stash/actions/op_suspend_user')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ params: { user_id: 'u1' } })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(readsOf(fetchMock, 'members')).toHaveLength(2) // reloaded
  })

  it('renders a second app (Parents Clubs) through the same code: verification queue, step-up refusal explained', async () => {
    serve({ ...baseline, app: { id: 'parents-clubs', createdAt: 1 }, contract: PARENTS_CLUBS }, {
      op_approve_verification: { status: 403, body: { error: 'step_up_required', message: 'Recent authentication required', max_age: 300 } },
    })
    vi.stubGlobal('confirm', () => true)
    render(<OperatorView appId="parents-clubs" appName="Parents Clubs" getToken={() => 'tok'} />)
    expect(await screen.findByText('ID verification')).toBeTruthy()
    const checks = screen.getByText('ID checks').closest('section')!
    expect(within(checks).getByText('Pending ID checks.')).toBeTruthy()
    await within(checks).findByText('Grace')
    fireEvent.click(within(checks).getByRole('button', { name: 'Approve' }))
    expect(await within(checks).findByText(/Approve: This needs a recent sign-in/)).toBeTruthy()
    expect(screen.getByText(/Not declared by this app: Metrics, Reports, Suspensions\./)).toBeTruthy()
  })

  it('a resource the owner lacks the role for fails in its own panel only', async () => {
    serve({ ...baseline, contract: STASH }, { 'resource:members': { status: 403, body: { error: 'requires app role' } } })
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    const members = (await screen.findByText('Members')).closest('section')!
    expect((await within(members).findByRole('alert')).textContent).toContain('Grant it to yourself under Settings → Access')
    const moderation = screen.getByText('Moderation').closest('section')!
    await waitFor(() => expect(within(moderation).getByText('3')).toBeTruthy())
  })
})

describe('OperatorView — users: search, paging, detail (#240 slice 3)', () => {
  afterEach(() => { history.replaceState(null, '', '#/') })
  const openStash = async (routes: Record<string, Route> = {}) => {
    const fetchMock = serve({ ...baseline, contract: STASH }, routes)
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    const members = (await screen.findByText('Members')).closest('section')!
    return { fetchMock, members }
  }
  const go = (hash: string) => act(() => { location.hash = hash; window.dispatchEvent(new HashChangeEvent('hashchange')) })

  it('searches through the declared route; only searchable resources get a search box', async () => {
    const { fetchMock, members } = await openStash({
      'resource:members': (url) => ({ status: 200, body: url.searchParams.get('q') === 'ada'
        ? { rows: [{ display_name: 'Ada', user_id: 'u1', suspended: 0 }], next_cursor: null }
        : ROWS.members }),
    })
    await within(members).findByText('Ada')
    fireEvent.change(within(members).getByRole('searchbox', { name: 'Search Members' }), { target: { value: '  ada ' } })
    fireEvent.click(within(members).getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(within(members).queryByText(XSS)).toBeNull())
    expect(readsOf(fetchMock, 'members').at(-1)!.searchParams.get('q')).toBe('ada')
    const moderation = screen.getByText('Moderation').closest('section')!
    expect(within(moderation).queryByRole('searchbox')).toBeNull()
  })

  it('loads the next page with the returned cursor and appends it; no button once paging ends', async () => {
    const { fetchMock, members } = await openStash({
      'resource:members': (url) => ({ status: 200, body: url.searchParams.get('cursor') === 'u2'
        ? { rows: [{ display_name: 'Cy', user_id: 'u3', suspended: 0 }], next_cursor: null }
        : { ...(ROWS.members as object), next_cursor: 'u2' } }),
    })
    fireEvent.click(await within(members).findByRole('button', { name: 'Load more' }))
    expect(await within(members).findByText('Cy')).toBeTruthy()
    expect(within(members).getByText('Ada')).toBeTruthy()
    expect(within(members).queryByRole('button', { name: 'Load more' })).toBeNull()
    expect(readsOf(fetchMock, 'members').map((u) => u.searchParams.get('cursor'))).toEqual([null, 'u2'])
  })

  it('opens a record page by deep link and shows only its declared fields, as text', async () => {
    const { fetchMock, members } = await openStash({
      'record:members': { status: 200, body: { record: { display_name: XSS, email: 'ada@x.test', pocket_count: 3 } } },
    })
    await within(members).findByText('Ada')
    const open = within(members).getAllByRole('link', { name: 'Open' })
    expect(open.map((a) => a.getAttribute('href'))).toEqual(['#/apps/stash/operator/members/u1', '#/apps/stash/operator/members/u2'])

    go('#/apps/stash/operator/members/u1')
    expect(await screen.findByText('ada@x.test')).toBeTruthy()
    expect(screen.getAllByRole('term').map((t) => t.textContent)).toEqual(['Name', 'Email', 'Pockets'])
    expect(screen.getByText(XSS)).toBeTruthy()
    expect(document.querySelector('img')).toBeNull()
    const [url, init] = fetchMock.mock.calls.at(-1)! as unknown as [string, RequestInit]
    expect(url).toBe('https://api.proappstore.online/v1/apps/stash/operator/resources/members/records/u1')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')

    go('#/apps/stash/operator')
    expect(await screen.findByText('Members')).toBeTruthy()
  })

  it('explains a refused or missing record, and never fetches an undeclared detail', async () => {
    await openStash({ 'record:members': { status: 403, body: { error: 'requires app role' } } })
    go('#/apps/stash/operator/members/u1')
    expect((await screen.findByRole('alert')).textContent).toContain('Grant it to yourself under Settings → Access')
    cleanup()
    const fetchMock = serve({ ...baseline, contract: STASH }, { 'record:members': { status: 404, body: { error: 'record not found' } } })
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    expect((await screen.findByRole('alert')).textContent).toBe('This record no longer exists.')
    go('#/apps/stash/operator/moderation/x')
    expect((await screen.findByRole('alert')).textContent).toContain('does not declare a detail page')
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/resources/moderation/records/'))).toBe(false)
  })

  it('a second app (Parents Clubs) gets search, paging and detail from its own contract, same code', async () => {
    const fetchMock = serve({ ...baseline, app: { id: 'parents-clubs', createdAt: 1 }, contract: PARENTS_CLUBS }, {
      'record:parents': { status: 200, body: { record: { full_name: 'Grace', joined_at: 1700000000 } } },
    })
    render(<OperatorView appId="parents-clubs" appName="Parents Clubs" getToken={() => 'tok'} />)
    const parents = (await screen.findByText('Parents')).closest('section')!
    await within(parents).findByText('Grace')
    expect(within(parents).getByRole('searchbox', { name: 'Search Parents' })).toBeTruthy()
    const href = within(parents).getByRole('link', { name: 'Open' }).getAttribute('href')!
    expect(href).toBe('#/apps/parents-clubs/operator/parents/p%2F1')
    go(href)
    expect(await screen.findByText(new Date(1700000000 * 1000).toLocaleString())).toBeTruthy()
    expect(String(fetchMock.mock.calls.at(-1)![0])).toBe('https://api.proappstore.online/v1/apps/parents-clubs/operator/resources/parents/records/p%2F1')
  })
})

describe('formatCell', () => {
  it('formats by the declared format and falls back to text', () => {
    expect(formatCell(null, 'text')).toBe('—')
    expect(formatCell(true, 'boolean')).toBe('Yes')
    expect(formatCell(0, 'boolean')).toBe('No')
    expect(formatCell(1700000000, 'datetime')).toBe(new Date(1700000000 * 1000).toLocaleString())
    expect(formatCell(1700000000000, 'datetime')).toBe(new Date(1700000000000).toLocaleString())
    expect(formatCell('not a date', 'datetime')).toBe('not a date')
    expect(formatCell('abc', 'number')).toBe('abc')
    expect(formatCell({ a: 1 }, 'text')).toBe('{"a":1}')
  })
})
