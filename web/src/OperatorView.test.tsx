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
    { id: 'reports', kind: 'reports', title: 'Reports', description: null, action: 'op_list_reports', columns: [
      { key: 'reason', label: 'Reason', format: 'text' },
      { key: 'status', label: 'Status', format: 'badge' },
      { key: 'report_id', label: 'Report', format: 'text' },
    ],
    status: { column: 'status', param: 'status', states: [
      { value: 'open', label: 'Open' }, { value: 'reviewing', label: 'In review' }, { value: 'resolved', label: 'Resolved' },
    ] } },
    { id: 'history', kind: 'suspensions', title: 'Suspension history', description: null, action: 'op_list_suspensions', columns: [
      { key: 'user_id', label: 'User', format: 'text' },
      { key: 'status', label: 'Status', format: 'badge' },
      { key: 'suspension_id', label: 'Suspension', format: 'text' },
    ],
    related: { resource: 'members', param: 'user' },
    status: { column: 'status', param: null, states: [{ value: 'active', label: 'Active' }, { value: 'lifted', label: 'Lifted' }] } },
    { id: 'kyc', kind: 'verification', title: 'Identity checks', description: null, action: 'op_list_kyc', columns: [
      { key: 'full_name', label: 'Name', format: 'text' },
      { key: 'status', label: 'Status', format: 'badge' },
      { key: 'request_id', label: 'Request', format: 'text' },
    ],
    search: { param: 'q' },
    status: { column: 'status', param: 'status', states: [{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }] },
    detail: { action: 'op_kyc_detail', param: 'request_id', key: 'request_id', step_up: true, fields: [
      { key: 'full_name', label: 'Name', format: 'text' },
      { key: 'status', label: 'Status', format: 'badge' },
      { key: 'request_id', label: 'Request', format: 'text' },
      { key: 'document_path', label: 'ID document', format: 'text' },
      { key: 'selfie_path', label: 'Selfie', format: 'text' },
    ], evidence: [{ field: 'document_path', label: 'ID document' }, { field: 'selfie_path', label: 'Selfie' }] } },
    { id: 'moderation', kind: 'metrics', title: 'Moderation', description: null, action: 'op_report_metrics', columns: [
      { key: 'open_reports', label: 'Open reports', format: 'number' },
      { key: 'suspended_users', label: 'Suspended', format: 'number' },
    ] },
  ],
  actions: [
    { id: 'suspend_member', title: 'Suspend', resource: 'members', action: 'op_suspend_user', params: { user_id: 'user_id' }, confirm: 'Suspend this member?', step_up: true, destructive: true, transition: null, target: 'user_id' },
    ...(['review', 'resolve'] as const).map((id) => ({
      id, title: id === 'review' ? 'Start review' : 'Resolve', resource: 'reports', action: `op_${id}_report`,
      params: { report_id: 'report_id', from_status: 'status' }, confirm: `${id}?`, step_up: false, destructive: false, target: 'report_id',
      transition: id === 'review' ? { from: ['open'], to: 'reviewing' } : { from: ['open', 'reviewing'], to: 'resolved' },
    })),
    ...(['approve', 'reject'] as const).map((verb) => ({
      id: `${verb}_kyc`, title: verb === 'approve' ? 'Approve' : 'Reject', resource: 'kyc', action: `op_${verb}_kyc`,
      params: { request_id: 'request_id', from_status: 'status' }, confirm: `${verb}?`, step_up: true, destructive: false, target: 'request_id',
      transition: { from: ['pending'], to: verb === 'approve' ? 'approved' : 'rejected' },
    })),
    { id: 'lift', title: 'Lift', resource: 'history', action: 'op_lift_suspension', params: { suspension_id: 'suspension_id', from_status: 'status', user_id: 'user_id' }, confirm: 'Lift?', step_up: false, destructive: false, target: 'user_id', transition: { from: ['active'], to: 'lifted' } },
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
    { id: 'flags', kind: 'reports', title: 'Flagged posts', description: null, action: 'op_list_flags', columns: [
      { key: 'post_title', label: 'Post', format: 'text' },
      { key: 'state', label: 'State', format: 'badge' },
      { key: 'flag_id', label: 'Flag', format: 'text' },
    ],
    status: { column: 'state', param: 'state', states: [{ value: 'new', label: 'New' }, { value: 'upheld', label: 'Upheld' }] } },
    { id: 'id_checks', kind: 'verification', title: 'ID checks', description: 'Pending ID checks.', action: 'op_pending_verifications', columns: [
      { key: 'parent_name', label: 'Parent', format: 'text' },
      { key: 'state', label: 'State', format: 'badge' },
      { key: 'request_id', label: 'Request', format: 'text' },
    ],
    status: { column: 'state', param: 'state', states: [{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'declined', label: 'Declined' }] },
    detail: { action: 'op_verification_detail', param: 'id', key: 'request_id', step_up: true, fields: [
      { key: 'parent_name', label: 'Parent', format: 'text' },
      { key: 'state', label: 'State', format: 'badge' },
      { key: 'request_id', label: 'Request', format: 'text' },
      { key: 'licence_path', label: "Driver's licence", format: 'text' },
    ], evidence: [{ field: 'licence_path', label: "Driver's licence" }] } },
  ],
  actions: [
    { id: 'approve', title: 'Approve', resource: 'id_checks', action: 'op_approve_verification', params: { request_id: 'request_id', was: 'state' }, confirm: 'Approve this ID check?', step_up: true, destructive: false, target: 'request_id', transition: { from: ['pending'], to: 'approved' } },
    { id: 'uphold', title: 'Uphold', resource: 'flags', action: 'op_uphold_flag', params: { flag: 'flag_id', was: 'state' }, confirm: 'Uphold?', step_up: false, destructive: false, target: 'flag_id', transition: { from: ['new'], to: 'upheld' } },
  ],
}

// Built at runtime so the static a11y scan doesn't read the probe as a real <img> tag.
const XSS = ['<', 'img src=x onerror=alert(1)>'].join('')

// What the operator resource routes answer (declared columns only), by resource id.
const ROWS: Record<string, unknown> = {
  members: { rows: [{ display_name: 'Ada', user_id: 'u1', suspended: 0 }, { display_name: XSS, user_id: 'u2', suspended: 1 }], next_cursor: null },
  moderation: { rows: [{ open_reports: 1234, suspended_users: 3 }], next_cursor: null },
  parents: { rows: [{ full_name: 'Grace', club_name: 'Chess', user_id: 'p/1' }], next_cursor: null },
  id_checks: { rows: [{ parent_name: 'Grace', state: 'pending', request_id: 'r9' }, { parent_name: 'Hal', state: 'approved', request_id: 'r8' }], next_cursor: null },
  kyc: { rows: [{ full_name: 'Ada', status: 'pending', request_id: 'k1' }, { full_name: 'Bo', status: 'rejected', request_id: 'k2' }], next_cursor: null },
  reports: { rows: [{ reason: 'spam', status: 'open', report_id: 'r1' }, { reason: 'abuse', status: 'reviewing', report_id: 'r2' }, { reason: 'old', status: 'resolved', report_id: 'r3' }], next_cursor: null },
  history: { rows: [{ user_id: 'u1', status: 'active', suspension_id: 's1' }, { user_id: 'u1', status: 'lifted', suspension_id: 's0' }], next_cursor: null },
  flags: { rows: [{ post_title: 'Hi', state: 'new', flag_id: 'f1' }], next_cursor: null },
}

type Reply = { status: number; body: unknown; type?: string }
type Route = Reply | ((url: URL) => Reply)
/** The operator context, resource reads (`resource:<id>`, `record:<id>`) and action posts (`<action name>`). */
function serve(context: unknown, routes: Record<string, Route> = {}) {
  const fetchMock = vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(raw)
    if (url.pathname.endsWith('/operator')) return Response.json(context)
    const evidence = /\/records\/[^/]+\/evidence\/([^/]+)$/.exec(url.pathname)
    const m = /\/operator\/resources\/([^/]+)(\/records\/[^/]+)?$/.exec(url.pathname)
    const name = evidence ? `evidence:${evidence[1]}`
      : m ? `${m[2] ? 'record' : 'resource'}:${decodeURIComponent(m[1]!)}` : /\/actions\/([^/]+)$/.exec(url.pathname)?.[1] ?? ''
    const route = routes[name]
    const r = typeof route === 'function' ? route(url) : route ?? { status: 200, body: ROWS[name.replace('resource:', '')] ?? {} }
    void init
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status, headers: r.type ? { 'content-type': r.type } : {} })
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
    expect(screen.queryByText(/Not declared by this app/)).toBeNull() // Stash declares every kind
  })

  it('renders app-supplied values as text, never HTML', async () => {
    serve({ ...baseline, contract: STASH })
    const { container } = render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    expect(await screen.findByText(XSS)).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('runs a row action through the operator route with the displayed row, only after confirmation, then reloads', async () => {
    const fetchMock = serve({ ...baseline, contract: STASH }, { suspend_member: { status: 200, body: { ok: true, changes: 1 } } })
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    const members = (await screen.findByText('Members')).closest('section')!
    await within(members).findByText('Ada')

    fireEvent.click(within(members).getAllByRole('button', { name: 'Suspend' })[0]!)
    expect(confirm).toHaveBeenCalledWith('Suspend this member?')
    expect(callsTo(fetchMock, 'suspend_member')).toHaveLength(0)

    confirm.mockReturnValue(true)
    fireEvent.click(within(members).getAllByRole('button', { name: 'Suspend' })[0]!)
    await within(members).findByText('Suspend: done.')
    const [[url, init]] = callsTo(fetchMock, 'suspend_member') as unknown as [string, RequestInit][]
    expect(url).toBe('https://api.proappstore.online/v1/apps/stash/operator/actions/suspend_member')
    expect(init.method).toBe('POST')
    // The row as displayed (declared columns only); the platform maps the action's params from it.
    expect(JSON.parse(String(init.body))).toEqual({ row: { display_name: 'Ada', user_id: 'u1', suspended: 0 } })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(readsOf(fetchMock, 'members')).toHaveLength(2) // reloaded
  })

  it('renders a second app (Parents Clubs) through the same code: verification queue, step-up refusal explained', async () => {
    serve({ ...baseline, app: { id: 'parents-clubs', createdAt: 1 }, contract: PARENTS_CLUBS }, {
      approve: { status: 403, body: { error: 'step_up_required', message: 'Recent authentication required', max_age: 300 } },
    })
    vi.stubGlobal('confirm', () => true)
    render(<OperatorView appId="parents-clubs" appName="Parents Clubs" getToken={() => 'tok'} />)
    expect(await screen.findByText('ID verification')).toBeTruthy()
    const checks = screen.getByText('ID checks').closest('section')!
    expect(within(checks).getByText('Pending ID checks.')).toBeTruthy()
    await within(checks).findByText('Grace')
    fireEvent.click(within(checks).getByRole('button', { name: 'Approve' }))
    expect(await within(checks).findByText(/Approve: This needs a recent sign-in/)).toBeTruthy()
    expect(screen.getByText(/Not declared by this app: Metrics, Suspensions\./)).toBeTruthy()
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
    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/records/'))! as unknown as [string, RequestInit]
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

describe('OperatorView — reports & suspensions (#240)', () => {
  afterEach(() => { history.replaceState(null, '', '#/') })
  const go = (hash: string) => act(() => { location.hash = hash; window.dispatchEvent(new HashChangeEvent('hashchange')) })
  const openReports = async (routes: Record<string, Route> = {}, onReauth?: () => void) => {
    const fetchMock = serve({ ...baseline, contract: STASH }, routes)
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} onReauth={onReauth} />)
    const reports = (await screen.findByText('Reports', { selector: 'h4' })).closest('section')!
    await within(reports).findByText('spam')
    return { fetchMock, reports }
  }
  const rowOf = (section: HTMLElement, text: string) => within(section).getByText(text).closest('tr')!

  it('labels states, offers each transition only from the states it leaves, and filters by state', async () => {
    const { fetchMock, reports } = await openReports({
      'resource:reports': (url) => ({ status: 200, body: url.searchParams.get('status') === 'reviewing'
        ? { rows: [{ reason: 'abuse', status: 'reviewing', report_id: 'r2' }], next_cursor: null }
        : ROWS.reports }),
    })
    expect(within(rowOf(reports, 'spam')).getByText('Open')).toBeTruthy()
    expect(within(rowOf(reports, 'abuse')).getByText('In review')).toBeTruthy()
    const buttons = (text: string) => within(rowOf(reports, text)).queryAllByRole('button').map((b) => b.textContent)
    expect(buttons('spam')).toEqual(['Start review', 'Resolve'])
    expect(buttons('abuse')).toEqual(['Resolve'])
    expect(buttons('old')).toEqual([])

    const filter = within(reports).getByRole('group', { name: 'Filter Reports by status' })
    fireEvent.click(within(filter).getByRole('button', { name: 'In review' }))
    await waitFor(() => expect(within(reports).queryByText('spam')).toBeNull())
    expect(within(filter).getByRole('button', { name: 'In review' }).getAttribute('aria-pressed')).toBe('true')
    expect(readsOf(fetchMock, 'reports').at(-1)!.searchParams.get('status')).toBe('reviewing')
  })

  it('runs a transition with the displayed row and shows a conflict the platform reports', async () => {
    vi.stubGlobal('confirm', () => true)
    const { fetchMock, reports } = await openReports({
      review: { status: 409, body: { error: 'the record changed since it was loaded; reload and try again' } },
    })
    fireEvent.click(within(rowOf(reports, 'spam')).getByRole('button', { name: 'Start review' }))
    expect(await within(reports).findByText('Start review: the record changed since it was loaded; reload and try again')).toBeTruthy()
    const [[url, init]] = callsTo(fetchMock, 'review') as unknown as [string, RequestInit][]
    expect(url).toBe('https://api.proappstore.online/v1/apps/stash/operator/actions/review')
    expect(JSON.parse(String(init.body))).toEqual({ row: { reason: 'spam', status: 'open', report_id: 'r1' } })
  })

  it('styles destructive actions and offers a fresh sign-in when one is required', async () => {
    vi.stubGlobal('confirm', () => true)
    const onReauth = vi.fn()
    serve({ ...baseline, contract: STASH }, { suspend_member: { status: 403, body: { error: 'step_up_required', message: 'Recent authentication required', max_age: 300 } } })
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} onReauth={onReauth} />)
    const members = (await screen.findByText('Members')).closest('section')!
    await within(members).findByText('Ada')
    const suspend = within(members).getAllByRole('button', { name: 'Suspend' })[0]!
    expect(suspend.className).toContain('var(--error)')
    expect(suspend.getAttribute('title')).toBe('Needs a recent sign-in')
    fireEvent.click(suspend)
    expect(await within(members).findByText(/Suspend: This needs a recent sign-in/)).toBeTruthy()
    fireEvent.click(within(members).getByRole('button', { name: 'Sign in again' }))
    expect(onReauth).toHaveBeenCalledOnce()
  })

  it("shows a member's suspension history on their record page, scoped to that member, with Lift only on active ones", async () => {
    const fetchMock = serve({ ...baseline, contract: STASH }, {
      'record:members': { status: 200, body: { record: { display_name: 'Ada', email: 'ada@x.test', pocket_count: 1 } } },
    })
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    await screen.findByText('Members')
    go('#/apps/stash/operator/members/u1')
    const history = (await screen.findByText('Suspension history', { selector: 'h4' })).closest('section')!
    await within(history).findByText('s1')
    expect(readsOf(fetchMock, 'history').at(-1)!.searchParams.get('related')).toBe('u1')
    expect(within(rowOf(history, 's1')).getByRole('button', { name: 'Lift' })).toBeTruthy()
    expect(within(rowOf(history, 's0')).queryByRole('button', { name: 'Lift' })).toBeNull()
  })

  it('a second app (Parents Clubs) gets its own workflow from its contract, same code', async () => {
    vi.stubGlobal('confirm', () => true)
    const fetchMock = serve({ ...baseline, app: { id: 'parents-clubs', createdAt: 1 }, contract: PARENTS_CLUBS }, { uphold: { status: 200, body: { ok: true, changes: 1 } } })
    render(<OperatorView appId="parents-clubs" appName="Parents Clubs" getToken={() => 'tok'} />)
    const flags = (await screen.findByText('Flagged posts')).closest('section')!
    await within(flags).findByText('Hi')
    expect(within(rowOf(flags, 'Hi')).getByText('New')).toBeTruthy()
    expect(within(flags).getByRole('group', { name: 'Filter Flagged posts by status' })).toBeTruthy()
    fireEvent.click(within(flags).getByRole('button', { name: 'Uphold' }))
    await within(flags).findByText('Uphold: done.')
    const [[url, init]] = callsTo(fetchMock, 'uphold') as unknown as [string, RequestInit][]
    expect(url).toBe('https://api.proappstore.online/v1/apps/parents-clubs/operator/actions/uphold')
    expect(JSON.parse(String(init.body))).toEqual({ row: { post_title: 'Hi', state: 'new', flag_id: 'f1' } })
  })
})

describe('OperatorView — ID verification (#240)', () => {
  afterEach(() => { history.replaceState(null, '', '#/') })
  const go = (hash: string) => act(() => { location.hash = hash; window.dispatchEvent(new HashChangeEvent('hashchange')) })
  const blobUrls = () => {
    let n = 0
    const create = vi.fn(() => `blob:test/${++n}`)
    const revoke = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }))
    return { create, revoke }
  }
  const kycRecord = { full_name: 'Ada', status: 'pending', request_id: 'k1', document_path: true, selfie_path: false }
  const openKyc = async (routes: Record<string, Route> = {}, onReauth?: () => void) => {
    const fetchMock = serve({ ...baseline, contract: STASH }, { 'record:kyc': { status: 200, body: { record: kycRecord } }, ...routes })
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} onReauth={onReauth} />)
    await screen.findByText('Identity checks', { selector: 'h4' })
    go('#/apps/stash/operator/kyc/k1')
    await screen.findByText('Evidence')
    return fetchMock
  }

  it('the queue filters by state and offers decisions only on pending checks', async () => {
    serve({ ...baseline, contract: STASH })
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    const queue = (await screen.findByText('Identity checks', { selector: 'h4' })).closest('section')!
    await within(queue).findByText('Ada')
    expect(within(queue).getByRole('group', { name: 'Filter Identity checks by status' })).toBeTruthy()
    const row = (text: string) => within(queue).getByText(text).closest('tr')!
    expect(within(row('Ada')).queryAllByRole('button').map((b) => b.textContent)).toEqual(['Approve', 'Reject'])
    expect(within(row('Bo')).queryAllByRole('button')).toHaveLength(0)
    expect(within(row('Ada')).getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('#/apps/stash/operator/kyc/k1')
  })

  it('the record shows fields without document paths, and decisions from the current state', async () => {
    await openKyc()
    expect(screen.getAllByRole('term').map((t) => t.textContent)).toEqual(['Name', 'Status', 'Request'])
    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'View ID document' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'View Selfie' })).toBeNull()
    expect(screen.getByText('No document on file.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Approve' }).getAttribute('title')).toBe('Needs a recent sign-in')
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy()
  })

  it('views an image document only on request, through the evidence route, from an object URL', async () => {
    const { create } = blobUrls()
    const fetchMock = await openKyc({ 'evidence:document_path': { status: 200, body: 'PNGDATA', type: 'image/png' } })
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/evidence/'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'View ID document' }))
    const img = await screen.findByRole('img', { name: 'ID document' })
    expect(img.getAttribute('src')).toBe('blob:test/1')
    expect(create).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/evidence/'))! as unknown as [string, RequestInit]
    expect(url).toBe('https://api.proappstore.online/v1/apps/stash/operator/resources/kyc/records/k1/evidence/document_path')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('explains a refused document and offers a fresh sign-in when one is required', async () => {
    const onReauth = vi.fn()
    await openKyc({ 'evidence:document_path': { status: 403, body: { error: 'step_up_required' } } }, onReauth)
    fireEvent.click(screen.getByRole('button', { name: 'View ID document' }))
    expect((await screen.findByRole('alert')).textContent).toContain('recent sign-in')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }))
    expect(onReauth).toHaveBeenCalledOnce()
    cleanup()
    history.replaceState(null, '', '#/')
    await openKyc({ 'evidence:document_path': { status: 403, body: { error: 'not a reviewer for this app' } } })
    fireEvent.click(screen.getByRole('button', { name: 'View ID document' }))
    expect((await screen.findByRole('alert')).textContent).toBe('not a reviewer for this app')
  })

  it('a stale session on the record itself is explained with a re-sign-in', async () => {
    const onReauth = vi.fn()
    serve({ ...baseline, contract: STASH }, { 'record:kyc': { status: 403, body: { error: 'step_up_required' } } })
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} onReauth={onReauth} />)
    await screen.findByText('Identity checks', { selector: 'h4' })
    go('#/apps/stash/operator/kyc/k1')
    expect((await screen.findByRole('alert')).textContent).toContain('recent sign-in')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }))
    expect(onReauth).toHaveBeenCalledOnce()
    expect(screen.queryByText('Evidence')).toBeNull()
  })

  it('decides from the record with the record as the row, then reloads it', async () => {
    vi.stubGlobal('confirm', () => true)
    let decided = false
    const fetchMock = await openKyc({
      approve_kyc: () => { decided = true; return { status: 200, body: { ok: true, changes: 1 } } },
      'record:kyc': () => ({ status: 200, body: { record: decided ? { ...kycRecord, status: 'approved' } : kycRecord } }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText('Approve: done.')).toBeTruthy()
    await screen.findByText('Approved')
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    const [[url, init]] = callsTo(fetchMock, 'approve_kyc') as unknown as [string, RequestInit][]
    expect(url).toBe('https://api.proappstore.online/v1/apps/stash/operator/actions/approve_kyc')
    expect(JSON.parse(String(init.body))).toEqual({ row: kycRecord })
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/records/k1'))).toHaveLength(2)
  })

  it('a second app (Parents Clubs) opens its licence PDF through the same code', async () => {
    blobUrls()
    serve({ ...baseline, app: { id: 'parents-clubs', createdAt: 1 }, contract: PARENTS_CLUBS }, {
      'record:id_checks': { status: 200, body: { record: { parent_name: XSS, state: 'pending', request_id: 'r9', licence_path: true } } },
      'evidence:licence_path': { status: 200, body: '%PDF-1', type: 'application/pdf' },
    })
    render(<OperatorView appId="parents-clubs" appName="Parents Clubs" getToken={() => 'tok'} />)
    await screen.findByText('ID checks')
    go('#/apps/parents-clubs/operator/id_checks/r9')
    fireEvent.click(await screen.findByRole('button', { name: "View Driver's licence" }))
    const link = await screen.findByRole('link', { name: "Open Driver's licence (PDF)" })
    expect(link.getAttribute('href')).toBe('blob:test/1')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByText(XSS)).toBeTruthy() // app-supplied text stays text
    expect(document.querySelector('img')).toBeNull()
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
