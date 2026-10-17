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
