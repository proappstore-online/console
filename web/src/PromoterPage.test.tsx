// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { User } from '@proappstore/sdk'

const auth = vi.hoisted(() => ({ signIn: vi.fn(), authError: null as string | null }))
vi.mock('./sdk', () => ({ pro: { auth } }))

import { PromoterPage, PromoterSignIn } from './PromoterPage'
import { AppPromoters } from './AppPromoters'
import { loadPromoterAccess, loadOwnerPromoters, type PromoterAccess, type PromoterLoader } from './promoterApi'
import { parseHash, isPromoterReturn, promoterAppFromHash, promoterHash, appTabsFor } from './nav'

const user = { id: 'g:1', login: 'pat', avatarUrl: null, dateOfBirth: null } as User
const noop = () => {}

function enrolled(over: Partial<Extract<PromoterAccess, { kind: 'enrolled' }>> = {}): PromoterAccess {
  return {
    kind: 'enrolled',
    apps: [{ id: 'app-a', name: 'App A' }, { id: 'app-b', name: 'App B' }],
    link: 'https://example.test/r/CODE1',
    code: 'CODE1',
    stats: { pending: 2, confirmed: 3, denominator: 12, sharePct: 25, asOf: '2026-11-05T00:00:00Z' },
    standings: [{ rank: 1, sharePct: 40, you: false }, { rank: 2, sharePct: 25, you: true }],
    activity: { items: [{ id: 'a1', at: '2026-11-04T00:00:00Z', status: 'confirmed' }], nextCursor: null },
    ...over,
  }
}

function page(load: PromoterLoader, ownedApps: { id: string; name: string }[] = [], extra: Partial<Parameters<typeof PromoterPage>[0]> = {}) {
  return render(<PromoterPage user={user} ownedApps={ownedApps} initialAppId={null} onSwitchAccount={noop} onSignOut={noop} load={load} {...extra} />)
}

beforeEach(() => { auth.signIn.mockReset(); auth.authError = null; history.replaceState(null, '', '#/') })
afterEach(cleanup)

describe('promoter routes (nav)', () => {
  it('routes #/promoter and #/promoter/return, ignoring a query, and nothing deeper', () => {
    expect(parseHash('#/promoter').view).toBe('promoter')
    expect(parseHash('#/promoter/return').view).toBe('promoter')
    expect(parseHash('#/promoter?app=x').view).toBe('promoter')
    expect(parseHash('#/promoter/other').view).toBe('dashboard')
    expect(isPromoterReturn('#/promoter/return?x=1')).toBe(true)
    expect(isPromoterReturn('#/promoter')).toBe(false)
  })
  it('carries only a well-formed app slug', () => {
    expect(promoterAppFromHash('#/promoter?app=my-app')).toBe('my-app')
    expect(promoterAppFromHash('#/promoter?app=../x')).toBeNull()
    expect(promoterAppFromHash('#/promoter?app=A')).toBeNull()
    expect(promoterHash('my-app')).toBe('#/promoter?app=my-app')
    expect(promoterHash('bad slug')).toBe('#/promoter')
  })
  it('confers no creator tabs: the promoter view is not an app view', () => {
    expect(parseHash('#/promoter').param).toBeNull()
    expect(appTabsFor(undefined).some((t) => t.key === 'operator')).toBe(false)
  })
})

describe('PromoterSignIn (auth return)', () => {
  it('offers Google then GitHub with their own providers and sets the return route first', () => {
    render(<PromoterSignIn />)
    expect(screen.getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Sign in with Google', 'Sign in with GitHub'])
    fireEvent.click(screen.getByRole('button', { name: /google/i }))
    expect(auth.signIn).toHaveBeenLastCalledWith('google')
    expect(location.hash).toBe('#/promoter/return')
    fireEvent.click(screen.getByRole('button', { name: /github/i }))
    expect(auth.signIn).toHaveBeenLastCalledWith('github')
  })
  it('says no app is needed and surfaces a failed sign-in', () => {
    auth.authError = 'access_denied'
    render(<PromoterSignIn />)
    expect(document.body.textContent).toContain('don’t need to build or publish an app')
    expect(screen.getByRole('alert').textContent).toContain('access_denied')
  })
})

describe('PromoterPage — backend not deployed (default loader)', () => {
  it('says unavailable, never fabricates a link, code, QR or figures, and disables Enroll', async () => {
    page(loadPromoterAccess)
    await screen.findByText('Enrollment unavailable')
    expect(screen.getByText(/Unavailable — referral tracking is not live yet/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Enroll' }) as HTMLButtonElement).disabled).toBe(true)
    for (const name of ['Copy link', 'Copy code', 'Share', 'Download materials']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true)
    }
    expect(screen.getByText('QR code not available yet')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/https?:\/\/(?!proappstore)/)
  })
  it('handles a user with no apps gracefully', async () => {
    page(loadPromoterAccess, [])
    await screen.findByText('You don’t own any apps')
    expect(screen.queryByRole('combobox', { name: /app/i })).toBeNull()
  })
  it('shows no creator or admin controls', async () => {
    page(loadPromoterAccess, [{ id: 'mine', name: 'Mine' }])
    await screen.findByText('Enrollment unavailable')
    expect(document.body.textContent).not.toMatch(/Settings|Operator|Publish|Payouts|Danger|Suspend|Delete/)
  })
  it('keeps account switch and sign-out reachable', async () => {
    const onSwitchAccount = vi.fn(), onSignOut = vi.fn()
    page(loadPromoterAccess, [], { onSwitchAccount, onSignOut })
    await screen.findByText('Enrollment unavailable')
    expect(document.body.textContent).toContain('Signed in as pat')
    fireEvent.click(screen.getByRole('button', { name: 'Switch account' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onSwitchAccount).toHaveBeenCalledTimes(1)
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })
})

describe('PromoterPage — contract states (loader injected)', () => {
  it.each(['suspended', 'revoked', 'withdrawn'] as const)('%s: explains, and shows no link or stats', async (kind) => {
    page(async () => ({ kind }))
    await screen.findByText(kind === 'suspended' ? /access is suspended/ : kind === 'revoked' ? /access was removed/ : /left this promotion/)
    expect(screen.queryByText('Your link and code')).toBeNull()
    expect(screen.queryByText('Your referrals')).toBeNull()
  })

  it('zero state: states zero honestly with denominator and freshness', async () => {
    page(async () => enrolled({ stats: { pending: 0, confirmed: 0, denominator: 0, sharePct: 0, asOf: '2026-11-05T00:00:00Z' }, standings: [], activity: { items: [], nextCursor: null } }))
    await screen.findByText(/No referrals in this period yet/)
    expect(document.body.textContent).toContain('÷ 0 confirmed new users')
    expect(document.body.textContent).toContain('Updated')
    expect(screen.getByText('No activity in this period.')).toBeTruthy()
  })

  it('error state: shows the error and retries', async () => {
    const load = vi.fn<PromoterLoader>().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(enrolled())
    page(load)
    await screen.findByText(/Couldn’t load your referrals: boom/)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('CODE1')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('own-only scope: standings are anonymous and activity has no invitee identity', async () => {
    page(async () => enrolled())
    await screen.findByText('Standings (anonymous)')
    expect(document.body.textContent).toContain('#1 — 40%')
    expect(document.body.textContent).toContain('#2 — 25% (you)')
    expect(document.body.textContent).not.toMatch(/@|email|owner analytics/i)
  })

  it('period filter reloads with the chosen range', async () => {
    const load = vi.fn<PromoterLoader>(async () => enrolled())
    page(load)
    await screen.findByText('CODE1')
    fireEvent.change(screen.getByLabelText(/Period/), { target: { value: '7d' } })
    await waitFor(() => expect(load).toHaveBeenLastCalledWith({ appId: null, range: '7d' }))
  })

  it('paginates activity by cursor and appends', async () => {
    const load = vi.fn<PromoterLoader>(async (q) => q.cursor
      ? enrolled({ activity: { items: [{ id: 'a2', at: '2026-11-03T00:00:00Z', status: 'pending' }], nextCursor: null } })
      : enrolled({ activity: { items: [{ id: 'a1', at: '2026-11-04T00:00:00Z', status: 'confirmed' }], nextCursor: 'c1' } }))
    page(load)
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getAllByText(/ — (confirmed|pending)$/)).toHaveLength(2))
    expect(load).toHaveBeenLastCalledWith({ appId: null, range: '30d', cursor: 'c1' })
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('multi-app isolation: switching apps reloads, preserves context, and drops a stale response', async () => {
    let releaseA: (a: PromoterAccess) => void = noop
    const load = vi.fn<PromoterLoader>((q) => q.appId === 'app-a'
      ? new Promise<PromoterAccess>((r) => { releaseA = r })
      : Promise.resolve(enrolled({ code: 'CODE-B' })))
    const onSelectApp = vi.fn()
    page(load, [{ id: 'app-a', name: 'App A' }, { id: 'app-b', name: 'App B' }], { initialAppId: 'app-a', onSelectApp })
    fireEvent.change(await screen.findByLabelText(/^App/), { target: { value: 'app-b' } })
    await screen.findByText('CODE-B')
    expect(onSelectApp).toHaveBeenCalledWith('app-b')
    releaseA(enrolled({ code: 'CODE-A' })) // arrives late
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByText('CODE-A')).toBeNull()
    expect(screen.getByText('CODE-B')).toBeTruthy()
  })
})

describe('AppPromoters (owner view)', () => {
  it('is unavailable by default and exposes no control', async () => {
    render(<AppPromoters appId="x" load={loadOwnerPromoters} />)
    await screen.findByText(/Unavailable —/)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
  it('shows app-scoped totals when a contract provides them, and errors with retry', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('nope')).mockResolvedValue({
      kind: 'ready', programme: 'enabled', totals: { promoters: 4, pending: 1, confirmed: 9, asOf: '2026-11-05T00:00:00Z' }, reviewQueue: 2,
    })
    render(<AppPromoters appId="x" load={load} />)
    await screen.findByText(/Couldn’t load promoters: nope/)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText(/4 promoters · 1 pending · 9 confirmed/)
    expect(load).toHaveBeenCalledWith('x')
  })
})
