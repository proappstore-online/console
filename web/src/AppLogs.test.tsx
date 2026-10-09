/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => pending.push({ resolve }))))
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
})
