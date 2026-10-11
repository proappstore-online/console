/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AppServer } from './AppServer'
import { APP_TABS, hashFor, parseHash } from './nav'

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }

const worker = {
  app_id: 'doordrop',
  worker: { enabled: 1, backend: 'dispatch', deployed_sha: 'abcdef1234', deployed_ref: 'refs/heads/main', deployed_at: 1_700_000_000_000, rotation_overlap_until: null },
  last_deploy: { repository: 'proappstore-online/doordrop', ref: 'refs/heads/main', sha: 'abcdef1234', status: 'deployed', detail: null, created_at: 1_700_000_000_000 },
  invocations: [
    { id: 'e1:1', type: 'scheduled', name: 'reconcile', attempt: 1, status: 'running', http_status: null, error: null, pas_calls: 3, started_at: 1_700_000_000_000, finished_at: null },
  ],
  schedules: [{ name: 'reconcile', cron: '*/5 * * * *', consecutive_failures: 0, schedule_disabled_at: null }],
}
const usage = {
  quotas: { invocations: 1000, cpu_ms: 100_000, hook_deliveries: 500 },
  cpu_ms_source: 'wall', worker_log_limit: 50_000,
  today: { day: '2026-10-11', invocations: 100, cpu_ms: 1000, hook_deliveries: 10, pas_calls: 7, log_entries: 0 },
  days: [],
}
const runs = { runs: [{ run_id: 'r1', action_name: 'worker:reconcile', source: 'code', due_at: 1_700_000_000_000, claimed_at: null, finished_at: null, status: 'queued', changes: null, error: null }] }
const hooks = { hooks: [{ name: 'github', url: 'https://api.proappstore.online/v1/apps/doordrop/hooks/github', verify_kind: 'github-hmac', secret_name: 'GITHUB_WEBHOOK_SECRET', secret_set: true, secret_value: 'hunter2-should-never-render', to: { worker: true } }] }
const deliveries = { deliveries: [{ id: 'd1', hook: 'github', delivery_id: 'gh-1', replay_key: 'gh-1', event: 'push', received_at: 1_700_000_000_000, status: 'failed', attempts: 3, finished_at: 1_700_000_000_100, error: 'handler threw: boom' }] }
const visibility = { mode: 'private', allowed: true }

type Overrides = Partial<Record<'worker' | 'usage' | 'runs' | 'hooks' | 'deliveries' | 'visibility' | 'connectors', () => Response>>

function mockApi(overrides: Overrides = {}) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    const path = new URL(url).pathname
    const pick = (key: keyof Overrides, body: unknown) => (overrides[key] ?? (() => response(body)))()
    if (path.endsWith('/worker/usage')) return pick('usage', usage)
    if (path.endsWith('/worker')) return pick('worker', worker)
    if (path.endsWith('/scheduled-runs')) return pick('runs', runs)
    if (path.endsWith('/hooks')) return pick('hooks', hooks)
    if (path.endsWith('/hook-deliveries')) return pick('deliveries', deliveries)
    if (path.endsWith('/visibility/me')) return pick('visibility', visibility)
    if (path.endsWith('/connectors')) return pick('connectors', { configured: true, connectors: [], installations: [] })
    return response({ error: 'unexpected' }, 500)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const paths = (fetchMock: ReturnType<typeof mockApi>) => fetchMock.mock.calls.map((c) => new URL(c[0]))

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Server tab routing', () => {
  it('is an app tab that round-trips through the hash', () => {
    expect(APP_TABS.some((t) => t.key === 'server')).toBe(true)
    const hash = hashFor('app-detail', 'doordrop', 'server')
    expect(hash).toBe('#/apps/doordrop/server')
    expect(parseHash(hash)).toEqual({ view: 'app-detail', param: 'doordrop', tab: 'server', settingsTab: null })
  })
})

describe('AppServer', () => {
  it('reads the owner routes with the bearer in the header, never the URL', async () => {
    const fetchMock = mockApi()
    render(<AppServer appId="doordrop" getToken={() => 'top-secret-token'} />)
    await screen.findByText('handler threw: boom')
    const seen = paths(fetchMock).map((u) => u.pathname)
    for (const p of ['/worker', '/worker/usage', '/scheduled-runs', '/hooks', '/hook-deliveries', '/visibility/me', '/connectors']) {
      expect(seen).toContain(`/v1/apps/doordrop${p}`)
    }
    expect(paths(fetchMock).find((u) => u.pathname.endsWith('/worker/usage'))!.searchParams.get('days')).toBe('30')
    expect(fetchMock.mock.calls.every((c) => !c[0].includes('top-secret-token'))).toBe(true)
    expect((fetchMock.mock.calls[0]![1] ?? {}).headers).toMatchObject({ Authorization: 'Bearer top-secret-token' })
  })

  it('sends the delivery status filter as a query param', async () => {
    const fetchMock = mockApi()
    render(<AppServer appId="doordrop" getToken={() => 'tok'} />)
    await screen.findByText('handler threw: boom')
    fireEvent.change(screen.getByLabelText('Delivery status'), { target: { value: 'failed' } })
    await waitFor(() => expect(paths(fetchMock).some((u) => u.pathname.endsWith('/hook-deliveries') && u.searchParams.get('status') === 'failed')).toBe(true))
  })

  it('labels running invocations and queued worker runs as in progress', async () => {
    mockApi()
    render(<AppServer appId="doordrop" getToken={() => 'tok'} />)
    await screen.findByText('handler threw: boom')
    expect(screen.getAllByText('in progress').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('worker run')).toBeTruthy()
    expect(screen.queryByText('running')).toBeNull()
  })

  it('shows the breaker banner with the re-enable instruction and disables Run now', async () => {
    mockApi({ worker: () => response({ ...worker, schedules: [{ name: 'reconcile', cron: '*/5 * * * *', consecutive_failures: 5, schedule_disabled_at: 1_700_000_000_000 }] }) })
    render(<AppServer appId="doordrop" getToken={() => 'tok'} />)
    const banner = await screen.findByTestId('breaker-banner')
    expect(banner.textContent).toContain('5 consecutive')
    expect(banner.textContent).toContain('redeploy the manifest')
    expect((screen.getByRole('button', { name: 'Run now' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('warns at 80% of a daily quota and labels cpu as wall-clock', async () => {
    mockApi({ usage: () => response({ ...usage, today: { ...usage.today, invocations: 800 } }) })
    render(<AppServer appId="doordrop" getToken={() => 'tok'} />)
    const tile = await screen.findByTestId('quota-invocations')
    expect(tile.textContent).toContain("80% of today's quota")
    expect(screen.getByTestId('quota-hook_deliveries').textContent).not.toContain('quota —')
    expect(screen.getByText('Wall-clock ms')).toBeTruthy()
  })

  it('explains quota_exceeded deliveries', async () => {
    mockApi({ deliveries: () => response({ deliveries: [{ ...deliveries.deliveries[0], status: 'quota_exceeded', error: null }] }) })
    render(<AppServer appId="doordrop" getToken={() => 'tok'} />)
    await screen.findByText(/recorded but not processed/)
    expect(screen.getByText(/Redeliver them from the sender after 00:00 UTC/)).toBeTruthy()
  })

  it('queues a run now (202) and refreshes the runs', async () => {
    const fetchMock = mockApi()
    render(<AppServer appId="doordrop" getToken={() => 'tok'} />)
    await screen.findByText('handler threw: boom')
    const before = paths(fetchMock).filter((u) => u.pathname.endsWith('/scheduled-runs')).length
    const impl = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === 'POST' ? response({ run_id: 'r2', status: 'queued' }, 202) : impl(url, init))
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }))
    await screen.findByText(/Queued/)
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')!
    expect(new URL(post[0]).pathname).toBe('/v1/apps/doordrop/worker/schedules/reconcile/run')
    await waitFor(() => expect(paths(fetchMock).filter((u) => u.pathname.endsWith('/scheduled-runs')).length).toBeGreaterThan(before))
  })

  it('explains a rate-limited run now (429)', async () => {
    const fetchMock = mockApi()
    render(<AppServer appId="doordrop" getToken={() => 'tok'} />)
    await screen.findByText('handler threw: boom')
    const impl = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === 'POST' ? response({ error: 'one manual run per schedule per minute' }, 429) : impl(url, init))
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }))
    await screen.findByText(/try again in a minute/)
  })

  it('rotates keys only after confirmation and shows the new config version', async () => {
    const fetchMock = mockApi()
    render(<AppServer appId="doordrop" getToken={() => 'tok'} />)
    await screen.findByText('handler threw: boom')
    const impl = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === 'POST' ? response({ ok: true, config_version: 7 }) : impl(url, init))

    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    fireEvent.click(screen.getByRole('button', { name: 'Rotate keys' }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(false)

    confirm.mockReturnValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: 'Rotate keys' }))
    await screen.findByText('Keys rotated — config version 7.')
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')!
    expect(new URL(post[0]).pathname).toBe('/v1/apps/doordrop/worker/rotate')
  })

  it('offers the worker toggle only to admins and surfaces its refusal', async () => {
    const fetchMock = mockApi()
    const view = render(<AppServer appId="doordrop" getToken={() => 'tok'} />)
    await screen.findByText('handler threw: boom')
    expect(screen.queryByRole('button', { name: /worker \(admin\)/ })).toBeNull()

    view.rerender(<AppServer appId="doordrop" getToken={() => 'tok'} isAdmin />)
    const impl = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === 'PUT' ? response({ error: 'app worker cap reached (5)' }, 409) : impl(url, init))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Disable worker (admin)' }))
    await screen.findByText('app worker cap reached (5)')
    const put = fetchMock.mock.calls.find((c) => c[1]?.method === 'PUT')!
    expect(new URL(put[0]).pathname).toBe('/v1/admin/apps/doordrop/worker-enabled')
    expect(put[1]!.body).toBe(JSON.stringify({ enabled: false }))
  })

  it('shows a denied state and no data on 403', async () => {
    mockApi({ worker: () => response({ error: 'forbidden' }, 403) })
    render(<AppServer appId="doordrop" getToken={() => 'tok'} />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain("only to this app's owner")
    expect(screen.queryByText('Hooks')).toBeNull()
    expect(screen.queryByText('handler threw: boom')).toBeNull()
  })

  it('shows a per-section failure without hiding the rest', async () => {
    mockApi({ deliveries: () => response({ error: 'boom' }, 500) })
    render(<AppServer appId="doordrop" getToken={() => 'tok'} />)
    await screen.findByText(/Could not load hook deliveries \(500\)/)
    expect(screen.getByText('github')).toBeTruthy()
  })

  it('clears the previous app data when the app changes', async () => {
    const fetchMock = mockApi()
    const view = render(<AppServer appId="doordrop" getToken={() => 'tok'} />)
    await screen.findByText('handler threw: boom')
    // The new app's reads never answer: nothing of the old app may stay on screen meanwhile.
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}))
    view.rerender(<AppServer appId="other" getToken={() => 'tok'} />)
    await waitFor(() => expect(screen.queryByText('handler threw: boom')).toBeNull())
    expect(screen.queryByText('github')).toBeNull()
  })

  it('never renders a secret value, even if the API sent one', async () => {
    mockApi()
    const { container } = render(<AppServer appId="doordrop" getToken={() => 'tok'} />)
    const hooksPanel = (await screen.findByText('github-hmac', { exact: false })).closest('div')!
    expect(within(hooksPanel.parentElement!).getByText('GITHUB_WEBHOOK_SECRET')).toBeTruthy()
    expect(container.textContent).not.toContain('hunter2-should-never-render')
  })
})
