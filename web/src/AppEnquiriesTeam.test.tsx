/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AppEnquiries } from './AppEnquiries'

const base = { email: 'sam@example.com', status: 'new', created_at: 1_700_000_000_000, handled_at: null, handled_by: null }
const general = { ...base, id: 'g1', type: 'general', name: 'Gina General', message: 'Pricing?' }
const join = { ...base, id: 't1', type: 'team_join', name: 'Tim Translator', message: 'I can help translate.' }
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const counts = { counts: { new: 2, total: 5 }, new_count: 2, new_general_count: 1, new_team_join_count: 1 }

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('AppEnquiries — team-join requests (console#11)', () => {
  it('shows both kinds by default, marks team requests, and reports per-type new counts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ enquiries: [general, join], ...counts })))
    render(<AppEnquiries appId="a" getToken={() => 't'} />)
    await screen.findByLabelText('Enquiry from Gina General')
    const row = screen.getByLabelText('Enquiry from Tim Translator')
    expect(within(row).getByText('Team request')).toBeTruthy()
    expect(within(screen.getByLabelText('Enquiry from Gina General')).queryByText('Team request')).toBeNull()
    expect(screen.getByText(/2 new · 5 total · 1 new general · 1 new team requests/)).toBeTruthy()
  })

  it('filters by type via the API and keeps the status filter', async () => {
    const fetchMock = vi.fn(async (url: string) => response({ enquiries: new URL(url).searchParams.get('type') === 'team_join' ? [join] : [general, join], ...counts }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AppEnquiries appId="a" getToken={() => 't'} />)
    await screen.findByLabelText('Enquiry from Gina General')
    expect(new URL(fetchMock.mock.calls[0]![0]).searchParams.has('type')).toBe(false)
    fireEvent.click(screen.getByRole('tab', { name: 'Team requests' }))
    await waitFor(() => expect(screen.queryByLabelText('Enquiry from Gina General')).toBeNull())
    const url = new URL(fetchMock.mock.calls.at(-1)![0])
    expect(url.searchParams.get('type')).toBe('team_join')
    expect(url.searchParams.get('status')).toBe('new')
    fireEvent.click(screen.getByRole('tab', { name: 'General' }))
    await waitFor(() => expect(new URL(fetchMock.mock.calls.at(-1)![0]).searchParams.get('type')).toBe('general'))
  })

  it('pages a typed list by the stable cursor, never a timestamp', async () => {
    const fetchMock = vi.fn(async (url: string) => response(new URL(url).searchParams.get('before_id')
      ? { enquiries: [{ ...join, id: 't2', name: 'Second' }], ...counts, next: null }
      : { enquiries: [join], ...counts, next: { before_id: 't1' } }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AppEnquiries appId="a" getToken={() => 't'} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Team requests' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))
    await screen.findByLabelText('Enquiry from Second')
    const url = new URL(fetchMock.mock.calls.at(-1)![0])
    expect(url.searchParams.get('before_id')).toBe('t1')
    expect(url.searchParams.get('type')).toBe('team_join')
    expect(url.searchParams.has('before')).toBe(false)
  })

  it('says reviewing a team request adds nobody, and marking it handled adjusts only the team count', async () => {
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => init?.method === 'PATCH' ? response({ id: 't1', status: 'handled' }) : response({ enquiries: [general, join], ...counts }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AppEnquiries appId="a" getToken={() => 't'} />)
    fireEvent.click(await screen.findByLabelText('Enquiry from Tim Translator'))
    const detail = screen.getByRole('region', { name: 'Enquiry' })
    expect(within(detail).getByText(/does not add this person/)).toBeTruthy()
    fireEvent.click(within(detail).getByRole('button', { name: 'Mark handled' }))
    await within(detail).findByRole('button', { name: 'Mark as new' })
    expect(screen.getByText(/1 new · 5 total · 1 new general · 0 new team requests/)).toBeTruthy()
    // only the status PATCH was sent: no invitation or membership call
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method && c[1].method !== 'GET')).toHaveLength(1)
  })

  it('does not show the join notice on general enquiries, and treats a missing type as general', async () => {
    const legacy = { ...general, id: 'old', name: 'Legacy' } as Record<string, unknown>
    delete legacy.type
    vi.stubGlobal('fetch', vi.fn(async () => response({ enquiries: [legacy], counts: { new: 1, total: 1 } })))
    render(<AppEnquiries appId="a" getToken={() => 't'} />)
    fireEvent.click(await screen.findByLabelText('Enquiry from Legacy'))
    expect(screen.queryByText(/does not add this person/)).toBeNull()
    expect(screen.queryByText('Team request')).toBeNull()
    expect(screen.getByText('1 new · 1 total')).toBeTruthy() // no per-type text without the new fields
  })

  it('ignores a slow response for the previous app after an app switch', async () => {
    let releaseA: (r: Response) => void = () => {}
    const fetchMock = vi.fn((url: string) => url.includes('/apps/a/')
      ? new Promise<Response>((r) => { releaseA = r })
      : Promise.resolve(response({ enquiries: [{ ...general, id: 'b1', name: 'From B' }], ...counts })))
    vi.stubGlobal('fetch', fetchMock)
    const { rerender } = render(<AppEnquiries appId="a" getToken={() => 't'} />)
    rerender(<AppEnquiries appId="b" getToken={() => 't'} />)
    await screen.findByLabelText('Enquiry from From B')
    releaseA(response({ enquiries: [{ ...general, id: 'a1', name: 'From A' }], ...counts }))
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByLabelText('Enquiry from From A')).toBeNull()
  })

  it('shows an error, then recovers when a filter is chosen; filters are focusable buttons', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response({ enquiries: [join], ...counts }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AppEnquiries appId="a" getToken={() => 't'} />)
    await screen.findByRole('alert')
    const tab = screen.getByRole('tab', { name: 'Team requests' })
    expect(tab.tagName).toBe('BUTTON') // focusable; Enter/Space activates
    fireEvent.click(tab)
    await screen.findByLabelText('Enquiry from Tim Translator')
  })
})
