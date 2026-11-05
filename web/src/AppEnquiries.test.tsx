/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AppEnquiries, EnquiriesSummary } from './AppEnquiries'

const enquiry = {
  id: 'enq-1', name: 'Ada Lovelace', email: 'ada@example.com', message: 'Do you offer team plans?\nThanks!',
  status: 'new', created_at: 1_700_000_000_000, handled_at: null, handled_by: null,
}

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('AppEnquiries (console#9)', () => {
  it.each([true, false])('keeps same-time enquiries across pages (server cursor: %s)', async withCursor => {
    const row = (n: number) => ({ ...enquiry, id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, name: `Applicant ${n}` })
    const first = Array.from({ length: 50 }, (_, index) => row(index + 1))
    const fetchMock = vi.fn(async (url: string) => {
      const cursor = new URL(url).searchParams.get('before_id')
      return response(cursor
        ? { enquiries: [row(51)], counts: { new: 51, total: 51 }, next: null }
        : { enquiries: first, counts: { new: 51, total: 51 }, ...(withCursor ? { next: { before_id: row(50).id } } : {}) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<AppEnquiries appId="chess-clubs" getToken={() => 'tok'} />)
    fireEvent.click(await screen.findByText('Load more', { selector: 'button' }))
    await screen.findByLabelText('Enquiry from Applicant 51')
    expect(screen.getAllByLabelText(/^Enquiry from Applicant/)).toHaveLength(51)
    const url = new URL(fetchMock.mock.calls[1]![0])
    expect(url.searchParams.get('before_id')).toBe(row(50).id)
    expect(url.searchParams.has('before')).toBe(false)
    expect(screen.queryByText('Load more', { selector: 'button' })).toBeNull()
  })
  it('lists new enquiries, opens one and marks it handled', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return response({ id: 'enq-1', status: 'handled' })
      return response({ enquiries: [enquiry], counts: { new: 1, total: 4 } })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<AppEnquiries appId="chess-clubs" getToken={() => 'tok'} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Enquiry from Ada Lovelace' }))
    const url = new URL(fetchMock.mock.calls[0]![0])
    expect(url.pathname).toBe('/v1/apps/chess-clubs/enquiries')
    expect(url.searchParams.get('status')).toBe('new')
    expect(screen.getByText('1 new · 4 total')).toBeTruthy()

    const detail = screen.getByRole('region', { name: 'Enquiry' })
    expect(within(detail).getByText('ada@example.com').getAttribute('href')).toBe('mailto:ada@example.com')
    fireEvent.click(within(detail).getByRole('button', { name: 'Mark handled' }))

    await within(detail).findByRole('button', { name: 'Mark as new' })
    const patch = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH')!
    expect(new URL(patch[0]).pathname).toBe('/v1/apps/chess-clubs/enquiries/enq-1')
    expect(JSON.parse(String(patch[1]!.body))).toEqual({ status: 'handled' })
    expect(screen.getByText('0 new · 4 total')).toBeTruthy()
  })

  it('switches to handled enquiries and shows an empty state', async () => {
    const fetchMock = vi.fn(async (_url: string) => response({ enquiries: [], counts: { new: 0, total: 0 } }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AppEnquiries appId="chess-clubs" getToken={() => 'tok'} />)
    await screen.findByText('No new enquiries.')
    fireEvent.click(screen.getByRole('tab', { name: 'Handled' }))
    await screen.findByText('No handled enquiries yet.')
    expect(new URL(fetchMock.mock.calls.at(-1)![0]).searchParams.get('status')).toBe('handled')
  })

  it('explains a refusal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'forbidden' }, 403)))
    render(<AppEnquiries appId="chess-clubs" getToken={() => 'tok'} />)
    expect((await screen.findByRole('alert')).textContent).toContain('owner')
  })
})

describe('EnquiriesSummary (console#9)', () => {
  it('shows the new count and latest enquiries, linking to the full list', async () => {
    const fetchMock = vi.fn(async (_url: string) => response({ enquiries: [enquiry], counts: { new: 7, total: 9 } }))
    vi.stubGlobal('fetch', fetchMock)
    const onOpen = vi.fn()
    render(<EnquiriesSummary appId="chess-clubs" getToken={() => 'tok'} onOpen={onOpen} />)
    await screen.findByText('7 new')
    expect(screen.getByText('Ada Lovelace')).toBeTruthy()
    const url = new URL(fetchMock.mock.calls[0]![0])
    expect(Object.fromEntries(url.searchParams)).toEqual({ status: 'new', limit: '3' })
    fireEvent.click(screen.getByRole('button', { name: /View all enquiries/ }))
    expect(onOpen).toHaveBeenCalled()
  })

  it('stays out of the way when enquiries cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'nope' }, 500)))
    const { container } = render(<EnquiriesSummary appId="chess-clubs" getToken={() => 'tok'} onOpen={() => {}} />)
    await waitFor(() => expect(container.innerHTML).toBe(''))
  })
})
