/**
 * @vitest-environment jsdom
 */
// #240: the operator view renders only what the owner-gated API returns; a
// refusal shows why and never renders app data. Declared contracts render
// generically: two different sample apps go through the same component.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { OperatorView } from './OperatorView'
import { formatCell, formatMeasure, probeOperatorAccess } from './operator'
import { rangeFor } from './OperatorSeriesPanel'
import { formatBucket } from './OperatorLineChart'
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
    { id: 'growth', kind: 'metrics', title: 'Sign-ups', description: null, action: 'op_daily_signups', columns: [
      { key: 'day', label: 'Day', format: 'datetime' }, { key: 'plan', label: 'Plan', format: 'text' }, { key: 'signups', label: 'Sign-ups', format: 'number' },
    ], series: {
      time: { column: 'day', grain: 'day' },
      range: { from_param: 'from', to_param: 'to', default_days: 30, max_days: 366 },
      measures: [{ column: 'signups', label: 'Sign-ups', unit: 'count', currency: null, aggregation: 'sum' }],
      dimension: { column: 'plan', label: 'Plan', max_values: 3 },
    } },
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
    { id: 'club_trends', kind: 'metrics', title: 'Club trends', description: null, action: 'op_weekly_clubs', columns: [
      { key: 'week_start', label: 'Week', format: 'datetime' }, { key: 'attendance_rate', label: 'Attendance', format: 'number' }, { key: 'fees', label: 'Fees', format: 'number' },
    ], series: {
      time: { column: 'week_start', grain: 'week' },
      range: { from_param: 'since', to_param: 'until', default_days: 84, max_days: 366 },
      measures: [
        { column: 'attendance_rate', label: 'Attendance', unit: 'percent', currency: null, aggregation: 'avg' },
        { column: 'fees', label: 'Fees collected', unit: 'currency', currency: 'GBP', aggregation: 'sum' },
      ],
      dimension: null,
    } },
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
    const metrics = /\/operator\/metrics\/([^/]+)$/.exec(url.pathname)
    const name = url.pathname.endsWith('/operator/entries') ? 'entries' : url.pathname.endsWith('/operator/audit') ? 'audit'
      : metrics ? `metrics:${metrics[1]}` : evidence ? `evidence:${evidence[1]}`
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
  // platform#297: given the console's access probe, the view renders it and fetches nothing itself.
  it('a refused probe shows the 403 state and fetches nothing at all', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} access={{ status: 'refused', httpStatus: 403 }} />)
    expect((await screen.findByRole('alert')).textContent).toBe("Only the app's owner, or a holder of one of its admin roles, can open the operator view.")
    expect(screen.queryByText('Users with roles')).toBeNull()
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('an unanswered probe waits without fetching; an admitted one renders its context without a second read', async () => {
    const fetchMock = serve(baseline)
    const { rerender } = render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} access={{ status: 'unknown' }} />)
    expect(screen.getByText('Loading...')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    rerender(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} access={{ status: 'allowed', context: baseline }} />)
    expect(await screen.findByText('Users with roles')).toBeTruthy()
    // Only the once-per-visit entry is written; the context is never re-read.
    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual(['/v1/apps/stash/operator/entries'])
  })

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
    expect((await screen.findByRole('alert')).textContent).toBe("Only the app's owner, or a holder of one of its admin roles, can open the operator view.")
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
    expect(confirm).toHaveBeenCalledWith("Suspend this member?\n\nThis can't be undone.")
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
    expect(screen.getByText(/Not declared by this app: Suspensions\./)).toBeTruthy()
  })

  it('a resource the owner lacks the role for fails in its own panel only', async () => {
    serve({ ...baseline, contract: STASH }, { 'resource:members': { status: 403, body: { error: 'requires app role' } } })
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    const members = (await screen.findByText('Members')).closest('section')!
    expect((await within(members).findByRole('alert')).textContent).toContain("The app's owner grants roles under Settings → Access")
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
    expect((await screen.findByRole('alert')).textContent).toContain("The app's owner grants roles under Settings → Access")
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
    // platform#298: a 409 reads as what happened, and the list is reloaded to the row's current state.
    expect(await within(reports).findByText('Start review: This record changed since you loaded it, so nothing was changed. It has been reloaded: check it and try again.')).toBeTruthy()
    await waitFor(() => expect(readsOf(fetchMock, 'reports').length).toBeGreaterThan(1))
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

  it('off the console origin, a document that needs a passkey points to the console, and never offers a futile re-sign-in (#244)', async () => {
    await openKyc({ 'evidence:document_path': { status: 403, body: { error: 'step_up_required', method: 'passkey', max_age: 300 } } }, vi.fn())
    fireEvent.click(screen.getByRole('button', { name: 'View ID document' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Opening a document needs a passkey check.')
    const link = screen.getByRole('link', { name: 'console.proappstore.online' })
    expect(link.getAttribute('href')).toBe('https://console.proappstore.online/#/apps/stash/operator/kyc/k1')
    expect(screen.queryByRole('button', { name: 'Verify with passkey' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Sign in again' })).toBeNull()
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

describe('OperatorView — metric time series (#240)', () => {
  const growthData = {
    from: '2026-09-01', to: '2026-09-04', grain: 'day', buckets: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'],
    dimension: { column: 'plan', label: 'Plan' }, omitted: 2,
    measures: [{ column: 'signups', label: 'Sign-ups', unit: 'count', currency: null, aggregation: 'sum', summary: 1234, series: [
      { dimension: 'free', summary: 900, values: [300, null, 400, 200] },
      { dimension: XSS, summary: 334, values: [100, 34, null, 200] },
    ] }],
  }
  const trendsData = {
    from: '2026-09-07', to: '2026-09-20', grain: 'week', buckets: ['2026-09-07', '2026-09-14'], dimension: null, omitted: 0,
    measures: [
      { column: 'attendance_rate', label: 'Attendance', unit: 'percent', currency: null, aggregation: 'avg', summary: 72.5, series: [{ dimension: null, summary: 72.5, values: [70, 75] }] },
      { column: 'fees', label: 'Fees collected', unit: 'currency', currency: 'GBP', aggregation: 'sum', summary: 1234, series: [{ dimension: null, summary: 1234, values: [1000, 234] }] },
    ],
  }
  const metricsCalls = (fetchMock: ReturnType<typeof serve>, id: string) =>
    fetchMock.mock.calls.map(([u]) => new URL(String(u))).filter((u) => u.pathname.endsWith(`/operator/metrics/${id}`))
  const openGrowth = async (routes: Record<string, Route> = {}, onReauth?: () => void) => {
    const fetchMock = serve({ ...baseline, contract: STASH }, { 'metrics:growth': { status: 200, body: growthData }, ...routes })
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} onReauth={onReauth} />)
    const panel = (await screen.findByText('Sign-ups', { selector: 'h4' })).closest('section')!
    return { fetchMock, panel }
  }

  it('asks the metrics route for the declared default window and grain, then shows summary, legend and table', async () => {
    const { fetchMock, panel } = await openGrowth()
    await within(panel).findByText('1,234')
    const [req] = metricsCalls(fetchMock, 'growth')
    expect(req!.origin + req!.pathname).toBe('https://api.proappstore.online/v1/apps/stash/operator/metrics/growth')
    expect(Object.fromEntries(req!.searchParams)).toEqual({ ...rangeFor(30), grain: 'day' })
    expect(within(panel).getByText('Sign-ups · Total')).toBeTruthy()
    const range = within(panel).getByRole('group', { name: 'Sign-ups range' })
    expect(within(range).getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['Last 7 days', 'false'], ['Last 30 days', 'true'], ['Last 90 days', 'false'], ['Last 365 days', 'false'],
    ])
    expect(within(panel).getByRole('combobox', { name: 'Group by' })).toBeTruthy()
    expect(within(panel).getAllByRole('option').map((o) => o.textContent)).toEqual(['day', 'week', 'month'])
    const legend = within(panel).getByRole('list', { name: 'Sign-ups series' })
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['free', XSS])
    expect(within(panel).getByText('2 more plan values not shown (smallest totals).')).toBeTruthy()
    const table = within(panel).getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Day', 'free', XSS])
    expect(within(table).getAllByRole('row')[2]!.textContent).toContain('—') // Sep 2: free had no rows
    expect(document.querySelector('img')).toBeNull()
  })

  it('draws gaps for empty buckets instead of zero', async () => {
    const { panel } = await openGrowth()
    await within(panel).findByText('1,234')
    const svg = panel.querySelector('svg')!
    // free: [300, null, 400, 200] → a lone point + a line; second: [100, 34, null, 200] → a line + a lone point.
    expect(svg.querySelectorAll('path[stroke]').length).toBe(2)
    expect(svg.querySelectorAll('circle').length).toBe(2)
  })

  it('refetches for a new range or grain, keeping the previous render dimmed meanwhile', async () => {
    const { fetchMock, panel } = await openGrowth({
      'metrics:growth': (url) => ({ status: 200, body: url.searchParams.get('grain') === 'month' ? { ...growthData, grain: 'month' } : growthData }),
    })
    await within(panel).findByText('1,234')
    fireEvent.click(within(panel).getByRole('button', { name: 'Last 90 days' }))
    // While the new range loads, the previous render stays, dimmed and marked busy.
    expect(panel.getAttribute('aria-busy')).toBe('true')
    expect(within(panel).getByText('1,234')).toBeTruthy()
    expect(within(panel).getByText('1,234').closest('.opacity-50')).toBeTruthy()
    await waitFor(() => expect(panel.getAttribute('aria-busy')).toBe('false'))
    expect(metricsCalls(fetchMock, 'growth').at(-1)!.searchParams.get('from')).toBe(rangeFor(90).from)
    fireEvent.change(within(panel).getByRole('combobox', { name: 'Group by' }), { target: { value: 'month' } })
    await waitFor(() => expect(metricsCalls(fetchMock, 'growth').at(-1)!.searchParams.get('grain')).toBe('month'))
  })

  it('reads each bucket from the keyboard through a live region', async () => {
    const { panel } = await openGrowth()
    await within(panel).findByText('1,234')
    const chart = within(panel).getByRole('group', { name: /Sign-ups over time/ })
    const live = () => panel.querySelector('[aria-live="polite"]')!.textContent
    fireEvent.focus(chart)
    await waitFor(() => expect(live()).toContain(formatBucket('2026-09-04', 'day')))
    expect(live()).toContain('free 200')
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    await waitFor(() => expect(live()).toContain(formatBucket('2026-09-03', 'day')))
    expect(live()).toContain('free 400')
    expect(live()).toContain(`${XSS} —`)
    fireEvent.keyDown(chart, { key: 'Home' })
    await waitFor(() => expect(live()).toContain(formatBucket('2026-09-01', 'day')))
    fireEvent.keyDown(chart, { key: 'Escape' })
    await waitFor(() => expect(live()).toBe(''))
  })

  it('says so when the range has no data, and explains errors with a re-sign-in when needed', async () => {
    const empty = { ...growthData, omitted: 0, measures: [{ ...growthData.measures[0]!, summary: null, series: [] }] }
    const { panel } = await openGrowth({ 'metrics:growth': { status: 200, body: empty } })
    expect(await within(panel).findByText('No data in this range.')).toBeTruthy()
    expect(within(panel).getByText('—')).toBeTruthy()
    expect(panel.querySelector('svg')).toBeNull()
    cleanup()
    const oversized = await openGrowth({ 'metrics:growth': { status: 400, body: { error: 'range is 400 days; this metric allows at most 366' } } })
    expect((await within(oversized.panel).findByRole('alert')).textContent).toBe('range is 400 days; this metric allows at most 366')
    cleanup()
    const onReauth = vi.fn()
    const stale = await openGrowth({ 'metrics:growth': { status: 403, body: { error: 'step_up_required' } } }, onReauth)
    await within(stale.panel).findByRole('alert')
    fireEvent.click(within(stale.panel).getByRole('button', { name: 'Sign in again' }))
    expect(onReauth).toHaveBeenCalledOnce()
  })

  it('a second app (Parents Clubs) gets its own units, grain and one chart per measure from the same code', async () => {
    const fetchMock = serve({ ...baseline, app: { id: 'parents-clubs', createdAt: 1 }, contract: PARENTS_CLUBS }, { 'metrics:club_trends': { status: 200, body: trendsData } })
    render(<OperatorView appId="parents-clubs" appName="Parents Clubs" getToken={() => 'tok'} />)
    const panel = (await screen.findByText('Club trends', { selector: 'h4' })).closest('section')!
    await within(panel).findByText('72.5%')
    expect(within(panel).getByText('Attendance · Average')).toBeTruthy()
    expect(within(panel).getByText('£1,234.00')).toBeTruthy()
    expect(within(panel).getAllByRole('option').map((o) => o.textContent)).toEqual(['week', 'month'])
    expect(within(panel).getAllByRole('figure')).toHaveLength(2) // one chart per measure, never a shared axis
    expect(within(panel).queryByRole('list', { name: /series/ })).toBeNull() // a single series needs no legend
    expect(metricsCalls(fetchMock, 'club_trends')[0]!.searchParams.get('grain')).toBe('week')
    expect(metricsCalls(fetchMock, 'club_trends')[0]!.searchParams.get('from')).toBe(rangeFor(84).from)
  })
})

describe('formatMeasure', () => {
  it('formats each unit, and a missing value as a dash', () => {
    expect(formatMeasure(null, 'count')).toBe('—')
    expect(formatMeasure(1234.5678, 'count')).toBe((1234.5678).toLocaleString(undefined, { maximumFractionDigits: 2 }))
    expect(formatMeasure(12.345, 'percent')).toBe(`${(12.345).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`)
    expect(formatMeasure(5400, 'seconds')).toBe('1 hr 30 min')
    expect(formatMeasure(1536, 'bytes')).toBe(`${(1.5).toLocaleString()} KB`)
    expect(formatMeasure(10, 'bytes')).toBe('10 B')
    expect(formatMeasure(9.5, 'currency', 'EUR')).toBe((9.5).toLocaleString(undefined, { style: 'currency', currency: 'EUR' }))
  })

  it('rangeFor counts the last N days including today, in UTC', () => {
    expect(rangeFor(30, Date.parse('2026-09-28T23:30:00Z'))).toEqual({ from: '2026-08-30', to: '2026-09-28' })
    expect(rangeFor(1, Date.parse('2026-09-28T00:10:00Z'))).toEqual({ from: '2026-09-28', to: '2026-09-28' })
  })
})

describe('OperatorView — entry and audit trail (#240)', () => {
  const entries = (fetchMock: ReturnType<typeof serve>) =>
    fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/operator/entries')) as unknown as [string, RequestInit][]
  const auditCalls = (fetchMock: ReturnType<typeof serve>) =>
    fetchMock.mock.calls.map(([u]) => new URL(String(u))).filter((u) => u.pathname.endsWith('/operator/audit'))
  const trail = (overrides: Partial<Record<string, unknown>> = {}) => ({
    rows: [
      { id: 9, at: Date.UTC(2026, 8, 28, 9), actor: { id: 'gh:1', login: 'owner' }, role: 'operator', kind: 'evidence', resource: 'kyc', field: 'document_path', operation: 'evidence:kyc.document_path', action: 'op_kyc_detail', target: null, target_hidden: true, status: 200, outcome: 'success' },
      { id: 8, at: Date.UTC(2026, 8, 28, 8), actor: { id: 'gh:1', login: null }, role: null, kind: 'action', resource: null, field: null, operation: 'review', action: null, target: null, target_hidden: false, status: 409, outcome: 'refused' },
      { id: 7, at: Date.UTC(2026, 8, 28, 7), actor: { id: 'gh:1', login: 'owner' }, role: 'operator', kind: 'detail', resource: 'members', field: null, operation: 'detail:members', action: 'op_member_detail', target: XSS, target_hidden: false, status: 200, outcome: 'success' },
      { id: 6, at: Date.UTC(2026, 8, 28, 6), actor: { id: 'gh:1', login: 'owner' }, role: null, kind: 'enter', resource: null, field: null, operation: 'enter', action: null, target: 'visit-1', target_hidden: false, status: 200, outcome: 'success' },
    ],
    next_cursor: null, targets_hidden: true, ...overrides,
  })
  beforeEach(() => sessionStorage.clear())

  it('records entering once per visit, however often the view re-renders or remounts', async () => {
    const fetchMock = serve({ ...baseline, contract: STASH }, { entries: { status: 200, body: { recorded: true } } })
    const view = render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    await screen.findByText('Members')
    await waitFor(() => expect(entries(fetchMock)).toHaveLength(1))
    const [[url, init]] = entries(fetchMock)
    expect(url).toBe('https://api.proappstore.online/v1/apps/stash/operator/entries')
    const visit = (JSON.parse(String(init.body)) as { visit: string }).visit
    expect(visit).toBe(sessionStorage.getItem('pas:operator-visit:stash'))
    view.rerender(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    view.unmount()
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />) // tab switch back
    await screen.findByText('Members')
    expect(entries(fetchMock)).toHaveLength(1)
    // A new tab session is a new visit.
    cleanup()
    sessionStorage.clear()
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    await screen.findByText('Members')
    await waitFor(() => expect(entries(fetchMock)).toHaveLength(2))
    expect((JSON.parse(String(entries(fetchMock)[1]![1].body)) as { visit: string }).visit).not.toBe(visit)
  })

  it('does not record entry when the view is refused, and records a second app separately', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not the app owner', { status: 403 })))
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    await screen.findByRole('alert')
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some(([u]) => String(u).endsWith('/entries'))).toBe(false)
    cleanup()
    const fetchMock = serve({ ...baseline, app: { id: 'parents-clubs', createdAt: 1 }, contract: PARENTS_CLUBS }, { entries: { status: 200, body: { recorded: true } } })
    render(<OperatorView appId="parents-clubs" appName="Parents Clubs" getToken={() => 'tok'} />)
    await waitFor(() => expect(entries(fetchMock)).toHaveLength(1))
    expect(entries(fetchMock)[0]![0]).toBe('https://api.proappstore.online/v1/apps/parents-clubs/operator/entries')
    expect(sessionStorage.getItem('pas:operator-visit:parents-clubs')).toBeTruthy()
  })

  it('loads the trail only when opened, then shows who did what to which record, redacting identity targets', async () => {
    const onReauth = vi.fn()
    const fetchMock = serve({ ...baseline, contract: STASH }, { audit: { status: 200, body: trail() } })
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} onReauth={onReauth} />)
    const toggle = await screen.findByRole('button', { name: 'Show audit trail' })
    expect(auditCalls(fetchMock)).toHaveLength(0)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Hide audit trail' }).getAttribute('aria-expanded')).toBe('true')
    const table = await screen.findByRole('table', { name: 'Operator audit trail, newest first' })
    const cells = within(table).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').slice(1).map((c) => c.textContent))
    expect(cells).toEqual([
      ['owneras operator', 'Viewed document: Identity checks · ID document', 'Hidden', '✓ Success'],
      ['gh:1', 'Ran action: Start review', '—', '✕ Refused (409)'],
      ['owneras operator', 'Opened record: Members', XSS, '✓ Success'],
      ['owner', 'Opened operator view', 'visit-1', '✓ Success'],
    ])
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText(/hidden until you sign in again/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }))
    expect(onReauth).toHaveBeenCalledOnce()
    // Narrow screens get the same rows as a stacked list.
    expect(within(screen.getByRole('list', { name: 'Operator audit trail, newest first' })).getAllByRole('listitem')).toHaveLength(4)
  })

  it('filters with ordinary form controls and pages with the returned cursor', async () => {
    const fetchMock = serve({ ...baseline, contract: STASH }, {
      audit: (url) => ({ status: 200, body: url.searchParams.get('cursor') === '6'
        ? trail({ rows: [{ ...trail().rows[3], id: 5, operation: 'enter', target: 'visit-0' }], next_cursor: null, targets_hidden: false })
        : trail({ next_cursor: '6' }) }),
    })
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Show audit trail' }))
    await screen.findByRole('table', { name: 'Operator audit trail, newest first' })
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findAllByText('visit-0')
    expect(auditCalls(fetchMock).at(-1)!.searchParams.get('cursor')).toBe('6')
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()

    const form = screen.getByRole('form', { name: 'Filter the audit trail' })
    fireEvent.change(within(form).getByLabelText('What'), { target: { value: 'detail' } })
    fireEvent.change(within(form).getByLabelText('Outcome'), { target: { value: 'refused' } })
    fireEvent.change(within(form).getByLabelText('Record'), { target: { value: '  k1 ' } })
    fireEvent.change(within(form).getByLabelText('From'), { target: { value: '2026-09-01' } })
    fireEvent.change(within(form).getByLabelText('To'), { target: { value: '2026-09-28' } })
    fireEvent.submit(form)
    await waitFor(() => expect(Object.fromEntries(auditCalls(fetchMock).at(-1)!.searchParams)).toEqual({ kind: 'detail', outcome: 'refused', target: 'k1', from: '2026-09-01', to: '2026-09-28' }))
    fireEvent.click(within(form).getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(auditCalls(fetchMock).at(-1)!.search).toBe(''))
  })

  it('says when nothing matches, and explains a refusal (Parents Clubs declares an audit role)', async () => {
    serve({ ...baseline, contract: STASH }, { audit: { status: 200, body: trail({ rows: [], targets_hidden: false }) } })
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Show audit trail' }))
    expect(await screen.findByText('Nothing recorded for these filters.')).toBeTruthy()
    cleanup()
    serve({ ...baseline, app: { id: 'parents-clubs', createdAt: 1 }, contract: PARENTS_CLUBS }, { audit: { status: 403, body: { error: 'requires app role' } } })
    render(<OperatorView appId="parents-clubs" appName="Parents Clubs" getToken={() => 'tok'} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Show audit trail' }))
    expect((await screen.findByRole('alert')).textContent).toContain("The app's owner grants roles under Settings → Access")
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

describe('probeOperatorAccess (platform#297)', () => {
  it("is the backend's answer: 200 → allowed with the context; 401/403/404 → refused with no data", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(baseline)))
    expect(await probeOperatorAccess('tok', 'stash')).toEqual({ status: 'allowed', context: baseline })
    for (const status of [401, 403, 404]) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status })))
      expect(await probeOperatorAccess('tok', 'stash')).toEqual({ status: 'refused', httpStatus: status })
    }
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network') }))
    expect(await probeOperatorAccess('tok', 'stash')).toEqual({ status: 'refused', httpStatus: null })
  })

  it('without a session it refuses without asking', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await probeOperatorAccess(null, 'stash')).toEqual({ status: 'refused', httpStatus: 401 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// platform#298: the same #240 components, from an app admin's side — an admin
// the platform admitted (not the owner) browses, searches, opens records and runs
// permitted actions on both sample apps; only what the backend returned renders.
describe('OperatorView — app admin CRUD (platform#298)', () => {
  const asAdmin = (contract: OperatorContract) => ({ status: 'allowed' as const, context: { ...baseline, operator: { userId: 'gh:4', login: 'admina' }, contract } })
  const go = (hash: string) => act(() => { location.hash = hash; window.dispatchEvent(new HashChangeEvent('hashchange')) })
  afterEach(() => { location.hash = '' })
  const rowOf = (section: HTMLElement, text: string) => within(section).getByText(text).closest('tr')!
  /** The section a resource renders in (its title can also be a kind heading, e.g. Reports). */
  const sectionOf = async (title: string) => (await screen.findAllByText(title)).map((e) => e.closest('section')).find((s): s is HTMLElement => !!s)!

  it('Stash: an admin browses, searches, opens a record and runs a permitted destructive action (confirmed first)', async () => {
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    const fetchMock = serve(null, {
      'record:members': { status: 200, body: { record: { display_name: 'Ada', email: 'ada@x.test', pocket_count: 2 } } },
      suspend_member: { status: 200, body: { ok: true, changes: 2 } },
    })
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} access={asAdmin(STASH)} />)
    const members = (await screen.findByText('Members')).closest('section')!
    expect(await within(members).findByText('Ada')).toBeTruthy()
    // Not the owner's view: the header names who it is for.
    expect(screen.getByText('Owner and admins')).toBeTruthy()

    fireEvent.change(within(members).getByRole('searchbox', { name: 'Search Members' }), { target: { value: 'Ada' } })
    fireEvent.click(within(members).getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(readsOf(fetchMock, 'members').at(-1)!.searchParams.get('q')).toBe('Ada'))

    fireEvent.click(within(rowOf(members, 'Ada')).getByRole('button', { name: 'Suspend' }))
    expect(confirm).toHaveBeenCalledWith("Suspend this member?\n\nThis can't be undone.")
    expect(await within(members).findByText('Suspend: done.')).toBeTruthy()
    expect(JSON.parse(String((callsTo(fetchMock, 'suspend_member')[0]![1] as RequestInit).body))).toEqual({ row: { display_name: 'Ada', user_id: 'u1', suspended: 0 } })

    await go('#/apps/stash/operator/members/u1')
    expect(await screen.findByText('ada@x.test')).toBeTruthy()
  })

  it('Parents Clubs: an admin browses, searches, opens a record and runs a non-destructive transition', async () => {
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    const fetchMock = serve(null, {
      'record:parents': { status: 200, body: { record: { full_name: 'Grace', joined_at: 1_700_000_000_000 } } },
      uphold: { status: 200, body: { ok: true, changes: 1 } },
    })
    render(<OperatorView appId="parents-clubs" appName="Parents Clubs" getToken={() => 'tok'} access={asAdmin(PARENTS_CLUBS)} />)
    const parents = (await screen.findByText('Parents')).closest('section')!
    expect(await within(parents).findByText('Grace')).toBeTruthy()
    fireEvent.change(within(parents).getByRole('searchbox', { name: 'Search Parents' }), { target: { value: 'Gr' } })
    fireEvent.click(within(parents).getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(readsOf(fetchMock, 'parents').at(-1)!.searchParams.get('q')).toBe('Gr'))

    const flags = (await screen.findByText('Flagged posts')).closest('section')!
    fireEvent.click(await within(flags).findByRole('button', { name: 'Uphold' }))
    expect(confirm).toHaveBeenCalledWith('Uphold?')
    expect(await within(flags).findByText('Uphold: done.')).toBeTruthy()

    await go('#/apps/parents-clubs/operator/parents/p%2F1')
    expect(await screen.findByText('Grace')).toBeTruthy()
    expect(screen.getByText('Joined')).toBeTruthy()
  })

  it('renders only the fields the backend returned: a blocked column, KPI or detail field is absent, a null is "—"', async () => {
    serve(null, {
      'resource:members': { status: 200, body: { rows: [{ display_name: 'Ada', user_id: 'u1' }], next_cursor: null } },
      'resource:moderation': { status: 200, body: { rows: [{ open_reports: 7 }], next_cursor: null } },
      'resource:reports': { status: 200, body: { rows: [{ reason: 'spam', status: 'open', report_id: null }], next_cursor: null } },
      'record:members': { status: 200, body: { record: { display_name: 'Ada', pocket_count: 2 } } },
    })
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} access={asAdmin(STASH)} />)
    const members = (await screen.findByText('Members')).closest('section')!
    await within(members).findByText('Ada')
    expect(within(members).queryByText('Suspended')).toBeNull() // never returned: no header, no empty cell
    const moderation = (await screen.findByText('Moderation')).closest('section')!
    expect(await within(moderation).findByText('Open reports')).toBeTruthy()
    expect(within(moderation).queryByText('Suspended')).toBeNull()
    const reports = await sectionOf('Reports')
    await within(reports).findByText('spam')
    expect(within(reports).getByText('Report')).toBeTruthy() // returned as null: the column stays, the cell reads —
    expect(within(rowOf(reports, 'spam')).getByText('—')).toBeTruthy()

    await go('#/apps/stash/operator/members/u1')
    await screen.findByText('Pockets')
    expect(screen.queryByText('Email')).toBeNull()
    expect(screen.queryByText('—')).toBeNull()
  })

  it('a transition from a status the row has left reads clearly and reloads the list', async () => {
    vi.stubGlobal('confirm', () => true)
    const fetchMock = serve(null, { review: { status: 409, body: { error: '"Start review" is not available from status "reviewing"' } } })
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} access={asAdmin(STASH)} />)
    const reports = await sectionOf('Reports')
    fireEvent.click(within(rowOf(reports, 'spam')).getByRole('button', { name: 'Start review' }))
    expect(await within(reports).findByText("Start review: This action doesn't apply to the record's current status any more. It has been reloaded.")).toBeTruthy()
    await waitFor(() => expect(readsOf(fetchMock, 'reports').length).toBeGreaterThan(1))
  })

  it('a declined confirmation runs nothing', async () => {
    vi.stubGlobal('confirm', () => false)
    const fetchMock = serve(null)
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} access={asAdmin(STASH)} />)
    const members = (await screen.findByText('Members')).closest('section')!
    fireEvent.click(within(rowOf(members, 'Ada')).getByRole('button', { name: 'Suspend' }))
    expect(callsTo(fetchMock, 'suspend_member')).toEqual([])
  })

  it('the owner-only audit trail tells an admin so, in words', async () => {
    serve(null, { audit: { status: 403, body: { error: 'not the app owner' } } })
    render(<OperatorView appId="stash" appName="Stash" getToken={() => 'tok'} access={asAdmin(STASH)} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Show audit trail' }))
    expect((await screen.findByRole('alert')).textContent).toBe("Only the app's owner can see this.")
  })
})
