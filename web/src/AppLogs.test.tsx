/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AppLogs, safeLogText } from './AppLogs'

const entry = {
  ts: 1_700_000_000_000, level: 'error', category: 'auth.session_lost', message: 'Session invalidated',
  data: { phase: 'auth_me' }, clientId: 'install-abc12345', build: { version: '1.16.75' },
  fingerprint: 'deadbeef', traceId: 'a'.repeat(32), source: 'mediated',
}

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('AppLogs', () => {
  it('wires owner filters through the supported query params and keeps the bearer out of URLs', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes('/groups?')) return response({ groups: [] })
      return response({ logs: [entry], nextCursor: null })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<AppLogs appId="chess-clubs" getToken={() => 'top-secret-token'} />)
    await screen.findByText('Session invalidated')

    fireEvent.change(screen.getByLabelText('Level'), { target: { value: 'error' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'auth.session_lost' } })
    fireEvent.change(screen.getByLabelText('Phase'), { target: { value: 'auth_me' } })
    fireEvent.change(screen.getByLabelText('Client ID'), { target: { value: 'install-abc12345' } })
    fireEvent.change(screen.getByLabelText('Trace ID'), { target: { value: 'a'.repeat(32) } })
    fireEvent.submit(screen.getByRole('form', { name: 'Log filters' }))

    await waitFor(() => expect(fetchMock.mock.calls.filter((call) => new URL(call[0]).pathname.endsWith('/logs'))).toHaveLength(2))
    const logCall = fetchMock.mock.calls.filter((call) => new URL(call[0]).pathname.endsWith('/logs')).at(-1)!
    const url = new URL(logCall[0])
    expect(url.pathname).toBe('/v1/apps/chess-clubs/logs')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ level: 'error', category: 'auth.session_lost', phase: 'auth_me', client_id: 'install-abc12345', trace_id: 'a'.repeat(32), limit: '50' })
    expect(url.href).not.toContain('top-secret-token')
    expect((logCall[1] ?? {}).headers).toMatchObject({ Authorization: 'Bearer top-secret-token' })
  })

  it('renders grouped errors and trace incidents, then filters by the selected correlation', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/groups?')) return response({ groups: [{ fingerprint: 'deadbeef', occurrences: 4, affected: 2, first_seen: 1, last_seen: 2, level: 'error', category: 'auth', sample_message: 'Session invalidated' }] })
      return response({ logs: [entry, { ...entry, ts: entry.ts - 1, message: 'Host invalidated cookie' }], nextCursor: null })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<AppLogs appId="chess-clubs" getToken={() => 'tok'} />)
    await screen.findByText(/4\s+occurrences/)
    expect(screen.getByText('2 entries · latest', { exact: false })).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'a'.repeat(32) })[0]!)
    await waitFor(() => expect(fetchMock.mock.calls.filter((call) => new URL(call[0]).pathname.endsWith('/logs')).at(-1)![0]).toContain(`trace_id=${'a'.repeat(32)}`))
  })

  it('paginates only with the bounded cursor the server returns', async () => {
    let logReads = 0
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/groups?')) return response({ groups: [] })
      logReads += 1
      return response(logReads === 1 ? { logs: [entry], nextCursor: '1700000000000:9' } : { logs: [{ ...entry, ts: entry.ts - 2, message: 'Older event' }], nextCursor: null })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<AppLogs appId="chess-clubs" getToken={() => 'tok'} />)
    await screen.findByText('Session invalidated')
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByText('Older event')
    expect(fetchMock.mock.calls.at(-1)![0]).toContain('cursor=1700000000000%3A9')
  })

  it('explains owner denial and clears stale app data while a different app loads', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/groups?')) return response({ groups: [] })
      if (url.includes('/apps/other/logs')) return response({ error: 'forbidden' }, 403)
      return response({ logs: [{ ...entry, message: 'Only first app' }], nextCursor: null })
    })
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<AppLogs appId="first" getToken={() => 'tok'} />)
    await screen.findByText('Only first app')
    view.rerender(<AppLogs appId="other" getToken={() => 'tok'} />)
    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toContain('only to this app’s owner')
    expect(screen.queryByText('Only first app')).toBeNull()
  })

  it('does not render credential, cookie, query, or email-shaped legacy text', () => {
    const displayed = safeLogText('Authorization: Basic c2VjcmV0 Cookie: a=one; session=two /auth/callback?token=abc person@example.test')
    expect(displayed).not.toContain('c2VjcmV0')
    expect(displayed).not.toContain('session=two')
    expect(displayed).not.toContain('token=abc')
    expect(displayed).not.toContain('person@example.test')
    expect(displayed).toContain('[redacted]')
  })

  it('ignores an older same-app response after filters change', async () => {
    const pending: Array<{ resolve: (value: Response) => void }> = []
    // The per-app overview (build + summary groups, no level filter) answers at once;
    // only the log list's own reads are held so their order can be controlled.
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const u = new URL(url)
      if (u.pathname.endsWith('/logs/build')) return Promise.resolve(response({ build: null }))
      if (u.pathname.endsWith('/groups') && !u.searchParams.has('level')) return Promise.resolve(response({ groups: [] }))
      return new Promise<Response>((resolve) => pending.push({ resolve }))
    }))
    render(<AppLogs appId="chess-clubs" getToken={() => 'tok'} />)
    await waitFor(() => expect(pending).toHaveLength(2))

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'auth.session_lost' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Log filters' }))
    await waitFor(() => expect(pending).toHaveLength(4))

    pending[2]!.resolve(response({ logs: [{ ...entry, message: 'New filtered event' }], nextCursor: null }))
    pending[3]!.resolve(response({ groups: [] }))
    await screen.findByText('New filtered event')

    pending[0]!.resolve(response({ logs: [{ ...entry, message: 'Stale event' }], nextCursor: null }))
    pending[1]!.resolve(response({ groups: [] }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText('Stale event')).toBeNull()
  })

  describe('overview, detail and empty states (console#1)', () => {
    type Handler = (u: URL) => Response
    function api(handlers: { logs?: Handler; groups?: Handler; build?: Handler } = {}) {
      const fetchMock = vi.fn(async (url: string) => {
        const u = new URL(url)
        if (u.pathname.endsWith('/logs/build')) return (handlers.build ?? (() => response({ build: { version: '1.16.75', sha: 'abc1234' }, ts: entry.ts })))(u)
        if (u.pathname.endsWith('/logs/groups')) return (handlers.groups ?? (() => response({ groups: [] })))(u)
        return (handlers.logs ?? (() => response({ logs: [entry], nextCursor: null })))(u)
      })
      vi.stubGlobal('fetch', fetchMock)
      return fetchMock
    }
    const group = (occurrences: number, extra: Partial<Record<string, unknown>> = {}) =>
      ({ fingerprint: `f${occurrences}`, occurrences, affected: 2, first_seen: 1, last_seen: 2, level: 'error', category: 'auth', sample_message: 'Session invalidated', ...extra })

    it('opens on errors and shows warn+error counts for 1h, 24h and 7d', async () => {
      const fetchMock = api({
        groups: (u) => {
          if (u.searchParams.has('level')) return response({ groups: [] })
          const age = Date.now() - Number(u.searchParams.get('since'))
          return response({ groups: age < 2 * 60 * 60 * 1000 ? [group(3)] : age < 2 * 24 * 60 * 60 * 1000 ? [group(10, { category: 'action.failed', affected: 4 }), group(5)] : [group(40), group(2)] })
        },
      })
      render(<AppLogs appId="chess-clubs" getToken={() => 'tok'} />)
      const cards = await screen.findByLabelText('Warnings and errors')
      expect(cards.textContent).toContain('Warnings + errors · 1h3')
      expect(cards.textContent).toContain('Warnings + errors · 24h15')
      expect(cards.textContent).toContain('Warnings + errors · 7d42')
      expect(screen.getByText(/Most common in 24h/).textContent).toContain('action.failed')
      expect(screen.getByText(/Most common in 24h/).textContent).toContain('4 affected')
      const firstLogRead = fetchMock.mock.calls.map((c) => new URL(c[0])).find((u) => u.pathname.endsWith('/logs'))!
      expect(firstLogRead.searchParams.get('level')).toBe('error')
      expect((screen.getByLabelText('Level') as HTMLSelectElement).value).toBe('error')
    })

    it('shows the latest build, or that none has been reported yet', async () => {
      api()
      const view = render(<AppLogs appId="chess-clubs" getToken={() => 'tok'} />)
      const card = await screen.findByTestId('build-card')
      await waitFor(() => expect(card.textContent).toContain('1.16.75'))
      expect(card.textContent).toContain('abc1234')
      view.unmount()

      api({ build: () => response({ build: null }) })
      render(<AppLogs appId="chess-clubs" getToken={() => 'tok'} />)
      await waitFor(() => expect(screen.getByTestId('build-card').textContent).toContain('No build metadata yet'))
    })

    it('says logs were never received when there is no build and no rows, and "no matching" otherwise', async () => {
      api({ logs: () => response({ logs: [], nextCursor: null }), build: () => response({ build: null }) })
      const view = render(<AppLogs appId="chess-clubs" getToken={() => 'tok'} />)
      await screen.findByText('No logs received yet. Wire the SDK (platform#105/#106) to start capturing errors.')
      view.unmount()

      api({ logs: () => response({ logs: [], nextCursor: null }) })
      render(<AppLogs appId="chess-clubs" getToken={() => 'tok'} />)
      await screen.findByText('No matching log entries.')
    })

    it('opens a detail panel that shows safe scalar data and hides sensitive or nested fields', async () => {
      api({
        logs: () => response({
          logs: [{
            ...entry, userId: 'gh:42',
            data: { phase: 'auth_me', status: 401, retry: false, password: 'hunter2', api_key: 'k-1', email: 'kid@example.test', student_name: 'Ada', request: { body: 'raw' }, note: 'Bearer abc.def' },
          }],
          nextCursor: null,
        }),
      })
      render(<AppLogs appId="chess-clubs" getToken={() => 'tok'} />)
      await screen.findByText('Session invalidated')
      expect(screen.getByText('gh:42')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Details for Session invalidated' }))

      const panel = screen.getByRole('region', { name: 'Log entry details' })
      const data = within(panel).getByTestId('log-data').textContent!
      expect(data).toContain('auth_me')
      expect(data).toContain('401')
      expect(data).toContain('false')
      expect(data).toContain('[redacted]')
      for (const leaked of ['hunter2', 'k-1', 'kid@example.test', 'Ada', 'raw', 'abc.def']) expect(panel.textContent).not.toContain(leaked)
      expect(within(panel).getByText('5 fields hidden (nested or possibly sensitive).')).toBeTruthy()
      fireEvent.click(within(panel).getByRole('button', { name: 'Close' }))
      expect(screen.queryByRole('region', { name: 'Log entry details' })).toBeNull()
    })

    it('filters by user id', async () => {
      const fetchMock = api()
      render(<AppLogs appId="chess-clubs" getToken={() => 'tok'} />)
      await screen.findByText('Session invalidated')
      fireEvent.change(screen.getByLabelText('User ID'), { target: { value: 'gh:42' } })
      fireEvent.submit(screen.getByRole('form', { name: 'Log filters' }))
      await waitFor(() => expect(fetchMock.mock.calls.map((c) => new URL(c[0])).some((u) => u.pathname.endsWith('/logs') && u.searchParams.get('user_id') === 'gh:42')).toBe(true))
      const groupCalls = fetchMock.mock.calls.map((c) => new URL(c[0])).filter((u) => u.pathname.endsWith('/groups'))
      expect(groupCalls.every((u) => !u.searchParams.has('user_id'))).toBe(true)
    })

    it('offers a one-hour range', async () => {
      const fetchMock = api()
      render(<AppLogs appId="chess-clubs" getToken={() => 'tok'} />)
      await screen.findByText('Session invalidated')
      const before = Date.now()
      fireEvent.change(screen.getByLabelText('Time range'), { target: { value: '1h' } })
      await waitFor(() => {
        const last = fetchMock.mock.calls.map((c) => new URL(c[0])).filter((u) => u.pathname.endsWith('/logs')).at(-1)!
        expect(Number(last.searchParams.get('since'))).toBeGreaterThanOrEqual(before - 60 * 60 * 1000 - 1000)
      })
    })
  })
})
