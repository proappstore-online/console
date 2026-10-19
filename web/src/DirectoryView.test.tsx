/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DirectoryView } from './DirectoryView'
import { directoryPath } from './directoryApi'

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }

const base = {
  lastDeployAt: null, submissionStatus: null, teamRole: null, pendingTransfer: null, routeHealth: null, createdAt: 1,
}
const alpha = {
  ...base, id: 'alpha', displayName: 'Alpha Notes', lifecycle: 'live', deployStatus: 'deployed', lastDeployAt: 1_700_000_000_000,
  accessLevel: 'owner', teamRole: 'owner', routeUrl: 'https://alpha.proappstore.online', repoRef: 'proappstore-online/alpha',
  links: {
    details: 'https://console.proappstore.online/#/apps/alpha', deployHistory: 'https://github.com/proappstore-online/alpha/actions',
    ownership: '/v1/apps/alpha/ownership', storePage: 'https://proappstore.online/apps/alpha/', repository: 'https://github.com/proappstore-online/alpha',
  },
}
const ops = {
  ...base, id: 'ops', displayName: 'Ops Desk', lifecycle: 'unpublished', deployStatus: 'not_deployed', accessLevel: 'operator',
  routeUrl: 'https://ops.proappstore.online', repoRef: null,
  links: { details: 'https://console.proappstore.online/#/apps/ops/operator', deployHistory: null, ownership: '/v1/apps/ops/ownership', storePage: null, repository: null },
}
const offer = {
  ...ops, id: 'offer', displayName: 'Offered App', accessLevel: 'transfer_recipient', pendingTransfer: 'incoming',
  links: { ...ops.links, details: null, ownership: '/v1/apps/offer/ownership' },
}
const theirs = {
  ...base, id: 'theirs', displayName: 'theirs', lifecycle: 'live', deployStatus: null, accessLevel: 'inaccessible',
  routeUrl: 'https://theirs.proappstore.online', repoRef: null,
  links: { details: null, deployHistory: null, ownership: '/v1/apps/theirs/ownership', storePage: 'https://proappstore.online/apps/theirs/', repository: null },
}
const page = (items: unknown[], extra: Record<string, unknown> = {}) => ({ query: null, lookup: null, total: items.length, items, truncated: false, ...extra })

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('directoryPath', () => {
  it('sends only what is set, lists comma-joined', () => {
    expect(directoryPath({})).toBe('/apps/directory')
    expect(directoryPath({ q: '  chess ', status: ['live', 'archived'], access: ['mine'], limit: 5 }))
      .toBe('/apps/directory?q=chess&status=live%2Carchived&access=mine&limit=5')
  })
})

describe('DirectoryView (platform#424)', () => {
  it('lists apps with their summary and only the links each may use', async () => {
    const fetchMock = vi.fn(async (_url: string) => response(page([alpha, ops, offer])))
    vi.stubGlobal('fetch', fetchMock)
    render(<DirectoryView getToken={() => 'tok'} debounceMs={0} />)

    const list = await screen.findByRole('list', { name: 'Apps' })
    expect(new URL(fetchMock.mock.calls[0]![0]).pathname).toBe('/v1/apps/directory')
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: 'Bearer tok' })
    expect(screen.getByText('3 apps')).toBeTruthy()

    const card = within(list).getByRole('listitem', { name: 'Alpha Notes' })
    expect(within(card).getByText('Live')).toBeTruthy()
    expect(within(card).getByText('Owner')).toBeTruthy()
    expect(within(card).getByText('proappstore-online/alpha')).toBeTruthy()
    expect(within(card).getByText(/health not checked/)).toBeTruthy()
    const links = within(card).getByRole('navigation', { name: 'Links for Alpha Notes' })
    expect(within(links).getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('#/apps/alpha')
    expect(within(links).getByRole('link', { name: 'Deploy history' }).getAttribute('href')).toBe('https://github.com/proappstore-online/alpha/actions')
    expect(within(links).getByRole('link', { name: 'Store page' }).getAttribute('href')).toBe('https://proappstore.online/apps/alpha/')

    const opsCard = within(list).getByRole('listitem', { name: 'Ops Desk' })
    expect(within(opsCard).getByRole('link', { name: 'Open operator view' }).getAttribute('href')).toBe('#/apps/ops/operator')
    expect(within(opsCard).queryByRole('link', { name: 'Repository' })).toBeNull()

    const offerCard = within(list).getByRole('listitem', { name: 'Offered App' })
    expect(within(offerCard).getByText(/offered this app to you/)).toBeTruthy()
    expect(within(offerCard).queryByRole('link', { name: 'Open' })).toBeNull()
  })

  it('searches after typing stops, and filters by status and access', async () => {
    const fetchMock = vi.fn(async (_url: string) => response(page([alpha])))
    vi.stubGlobal('fetch', fetchMock)
    render(<DirectoryView getToken={() => 'tok'} debounceMs={20} />)
    await screen.findByRole('list', { name: 'Apps' })

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search apps' }), { target: { value: 'alp' } })
    await waitFor(() => expect(new URL(fetchMock.mock.calls.at(-1)![0]).searchParams.get('q')).toBe('alp'))

    const status = screen.getByRole('group', { name: 'Status' })
    fireEvent.click(within(status).getByRole('button', { name: 'Live' }))
    fireEvent.click(within(status).getByRole('button', { name: 'Archived' }))
    expect(within(status).getByRole('button', { name: 'Live' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(screen.getByRole('group', { name: 'Access' })).getByRole('button', { name: 'Pending transfer' }))
    await waitFor(() => {
      const params = new URL(fetchMock.mock.calls.at(-1)![0]).searchParams
      expect(params.get('status')).toBe('live,archived')
      expect(params.get('access')).toBe('transfer')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(new URL(fetchMock.mock.calls.at(-1)![0]).searchParams.get('status')).toBeNull())
  })

  it('says an unclaimed id is free and points at creating it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(page([], { lookup: { id: 'brand-new', status: 'unclaimed' } }))))
    render(<DirectoryView getToken={() => 'tok'} debounceMs={0} />)
    const banner = await screen.findByRole('status')
    expect(banner.textContent).toContain('brand-new is free')
    expect(within(banner).getByRole('link', { name: 'Create an app with this id' }).getAttribute('href')).toBe('#/provision')
  })

  it('distinguishes an existing app you cannot manage, and files a recovery request', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return response({ transfer: { id: 8, status: 'escalated' } }, 201)
      return response(page([theirs], { lookup: { id: 'theirs', status: 'exists_inaccessible' } }))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<DirectoryView getToken={() => 'tok'} debounceMs={0} />)

    const banner = await screen.findByRole('status')
    expect(banner.textContent).toContain('already exists, and you cannot manage it')
    const card = screen.getByRole('listitem', { name: 'theirs' })
    expect(within(card).getByText('Not yours')).toBeTruthy()
    expect(within(card).queryByRole('link', { name: 'Open' })).toBeNull()
    expect(within(card).getByRole('link', { name: 'Store page' })).toBeTruthy()

    fireEvent.click(within(banner).getByRole('button', { name: 'Request recovery' }))
    fireEvent.change(within(banner).getByLabelText('How can you show you created this app?'), { target: { value: 'I used gh:3' } })
    fireEvent.click(within(banner).getByRole('button', { name: 'Send recovery request' }))
    await within(banner).findByText(/Recovery request sent/)
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')!
    expect(new URL(post[0]).pathname).toBe('/v1/apps/theirs/ownership/recovery')
    expect(JSON.parse(String(post[1]!.body))).toEqual({ evidence: 'I used gh:3' })
  })

  it('shows a refused recovery request', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST'
      ? new Response('you already have an open recovery request for this app', { status: 409 })
      : response(page([theirs], { lookup: { id: 'theirs', status: 'exists_inaccessible' } }))))
    render(<DirectoryView getToken={() => 'tok'} debounceMs={0} />)
    const banner = await screen.findByRole('status')
    fireEvent.click(within(banner).getByRole('button', { name: 'Request recovery' }))
    fireEvent.change(within(banner).getByLabelText('How can you show you created this app?'), { target: { value: 'mine' } })
    fireEvent.click(within(banner).getByRole('button', { name: 'Send recovery request' }))
    expect((await within(banner).findByRole('alert')).textContent).toContain('already have an open recovery request')
  })

  it.each([
    ['reserved', 'console', 'platform hostname'],
    ['yours', 'alpha', 'is your app'],
    ['invalid', 'x', 'not a PAS app id or URL'],
  ])('explains a %s lookup', async (status, id, text) => {
    vi.stubGlobal('fetch', vi.fn(async () => response(page([], { lookup: { id, status } }))))
    render(<DirectoryView getToken={() => 'tok'} debounceMs={0} />)
    expect((await screen.findByRole('status')).textContent).toContain(text)
  })

  it('shows empty, truncated and failed states', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(page([]))))
    render(<DirectoryView getToken={() => 'tok'} debounceMs={0} />)
    await screen.findByText('You have no apps yet.')
    cleanup()

    vi.stubGlobal('fetch', vi.fn(async () => response({ ...page([alpha]), total: 80, truncated: true })))
    render(<DirectoryView getToken={() => 'tok'} debounceMs={0} />)
    await screen.findByText(/80 apps — showing the first 1/)
    cleanup()

    vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'expired' }, 401)))
    render(<DirectoryView getToken={() => 'tok'} debounceMs={0} />)
    expect((await screen.findByRole('alert')).textContent).toContain('session has expired')
  })
})
