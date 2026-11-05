/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { User } from '@proappstore/sdk'
import { PromoterPage, PromoterSignIn } from './PromoterPage'
import { AppPromoters } from './AppPromoters'
import * as api from './promoterApi'
import { promoterOAuthReturn, promoterSignInUrl, promoterHash, parseHash } from './nav'
vi.mock('./sdk', () => ({ pro: { auth: { token: 'person-token', signIn: vi.fn(), authError: null } } }))
vi.mock('@proappstore/sdk/ui', () => ({ SignInButton: ({ app, provider }: { app: { auth: { signIn: (p: string) => void } }; provider: string }) => <button onClick={() => app.auth.signIn(provider)}>Sign in with {provider}</button> }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async (link: string) => 'data:image/png;base64,' + btoa(link)) } }))
const user = { id: 'google:1', name: 'Pat', login: 'old-name' } as User
const counts = { pending: 1, confirmed: 2, reversed: 0, expired: 0 }
export const promoter: api.Promoter = { promoter_id: 'p1', app_id: 'a', status: 'active', code: '23456789', code_active: true, display_name: 'Pat', share_path: '/apps/a?ref=23456789', share_url: 'https://proappstore.online/apps/a?ref=23456789', app_public: true, status_reason: null, consented_at: 1, created_at: 1, updated_at: 1 }
const share = { numerator: 2, denominator: 8, percent: 25, ratio: .25, basis: 'among promoters' }
const report: api.ContributionReport = { version: 1, app_id: 'a', freshness: { as_of: 1770000000000, referrals_recorded_since: 1760000000000, note: 'Earlier users are not reconstructed.' }, contributions: { promotion: { promoter_status: 'active', recorded: true, first_confirmed_at: 1, counts, share_of_referred_users: share, standing: { rank: 2, ranked_promoters: 3, tied_on_count: false } }, code: { available: false, reason: 'Code is reported separately.' } } }
function enrolled(overrides: Partial<Extract<api.PromoterAccess, { kind: 'enrolled' }>> = {}): api.PromoterAccess { return { kind: 'enrolled', apps: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }], appId: 'a', promoter, report, activity: { promoter_status: 'active', counts, referrals: [], next: null }, ...overrides } }
function page(load: api.PromoterLoader = async () => enrolled(), initialAppId: string | null = 'a') {
  const onSwitchAccount = vi.fn(), onSignOut = vi.fn()
  render(<PromoterPage user={user} initialAppId={initialAppId} load={load} onSwitchAccount={onSwitchAccount} onSignOut={onSignOut} />)
  return { onSwitchAccount, onSignOut }
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
beforeEach(() => { vi.stubGlobal('fetch', async () => new Response('not deployed', { status: 404 })) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); history.replaceState(null, '', '/') })

describe('promoter contract client', () => {
  function fixture(options: { status?: api.PromoterStatus; activityError?: boolean; noOwn?: boolean } = {}) {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const u = new URL(url); calls.push(u.pathname + u.search)
      if (u.pathname.includes('/storefront/')) return json({ apps: [{ appId: 'a' }, { appId: 'b' }], next: null })
      expect(init.credentials).toBe('include')
      expect(init.headers).toMatchObject({ Authorization: 'Bearer person-token' })
      if (u.pathname === '/v1/promoters/me') return json({ promoters: options.noOwn ? [] : [promoter] })
      if (u.pathname.endsWith('/contributions')) return json({ ...report, contributions: { ...report.contributions, promotion: { ...report.contributions.promotion, promoter_status: options.status ?? 'active' } } })
      if (u.pathname.endsWith('/referrals')) return options.activityError ? new Response('offline', { status: 503 }) : json({ promoter_status: options.status ?? 'active', counts, referrals: [], next: null })
      return options.noOwn ? new Response('not found', { status: 404 }) : json({ promoter: { ...promoter, status: options.status ?? 'active' } })
    }))
    return calls
  }
  it('loads public discovery plus own relationships, then own-only reporting with exact half-open bounds', async () => {
    const calls = fixture()
    const result = await api.loadPromoterAccess({ appId: 'a', range: '7d', now: 1770000000000 })
    expect(result.kind).toBe('enrolled')
    expect(calls).toContain('/v1/apps/a/promoters/me/contributions?from=1769395200000&to=1770000000000')
    expect(calls.some((u) => u === '/v1/apps/a/promoters/contributions')).toBe(false)
    expect(calls.some((u) => u.startsWith('/v1/apps/a/referrals'))).toBe(false)
  })
  it('lets a new person with no owned apps choose discovery apps', async () => {
    fixture({ noOwn: true })
    const result = await api.loadPromoterAccess({ appId: 'a', range: 'all' })
    expect(result).toMatchObject({ kind: 'not-enrolled', apps: [{ id: 'a' }, { id: 'b' }] })
  })
  it.each(['suspended', 'withdrawn'] as const)('keeps %s own reporting readable', async (status) => {
    fixture({ status })
    expect(await api.loadPromoterAccess({ appId: 'a', range: 'all' })).toMatchObject({ kind: 'enrolled', promoter: { status } })
  })
  it('preserves totals when activity alone fails', async () => {
    fixture({ activityError: true })
    expect(await api.loadPromoterAccess({ appId: 'a', range: 'all' })).toMatchObject({ kind: 'enrolled', activity: null, activityError: 'offline' })
  })
  it('encodes activity cursors and never sends a client promoter identity', async () => {
    const fetch = vi.fn(async (_url: string) => json({ referrals: [], next: null }))
    vi.stubGlobal('fetch', fetch)
    await api.ownActivity('a', 'x/y')
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.proappstore.online/v1/apps/a/promoters/me/referrals?limit=50&before_id=x%2Fy')
  })
  it('enrollment carries exact consent and a local return path; corrections use deployed methods only', async () => {
    const calls: { url: string; body: unknown; method: string }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => { calls.push({ url, body: init.body && JSON.parse(String(init.body)), method: init.method! }); return json({ promoter }) })
    await api.enrollPromoter('a', ' Pat ')
    await api.correctReferral('a', 'r/1', 'reverse', 'fraud_invalid', 'Invalid')
    await api.correctReferral('a', 'r/1', 'restore', 'correction', 'Reviewed')
    expect(calls[0]?.body).toEqual({ consent: true, display_name: 'Pat', return_path: '/#/promoter?app=a' })
    expect(calls[1]).toMatchObject({ method: 'POST', body: { kind: 'fraud_invalid', reason: 'Invalid' } })
    expect(calls[2]?.body).toEqual({ reason: 'Reviewed' })
  })
  it('paginates discovery and includes closed-enrollment own relationships without duplicates', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.endsWith('/promoters/me')) return json({ promoters: [{ ...promoter, app_id: 'closed' }] })
      if (url.includes('after=')) return json({ apps: [{ appId: 'b' }], next: null })
      return json({ apps: [{ appId: 'a' }], next: { after: 'a' } })
    })
    expect((await api.loadPromoterChoices()).map((a) => a.id)).toEqual(['closed', 'a', 'b'])
  })
  it('rejects cross-app report payloads', async () => {
    fixture()
    const original = globalThis.fetch
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => url.includes('/contributions') ? json({ ...report, app_id: 'b' }) : original(url, init))
    await expect(api.loadPromoterAccess({ appId: 'a', range: 'all' })).rejects.toThrow('App context mismatch')
  })
  it('handles a forbidden first-party session explicitly', async () => {
    vi.stubGlobal('fetch', async () => new Response('sign in as yourself', { status: 403 }))
    await expect(api.loadPromoterAccess({ appId: null, range: 'all' })).rejects.toThrow('sign in as yourself')
  })
})

describe('workspace', () => {
  it('shows own rank, correct denominator, freshness and a QR generated from share_url', async () => {
    page()
    await screen.findByText('Your share: 25%')
    expect(document.body.textContent).toContain('8 confirmed referrals from all promoters')
    expect(document.body.textContent).toContain('#2 of 3')
    expect(document.body.textContent).toContain('Earlier users are not reconstructed')
    expect(screen.queryByText('Standings (anonymous)')).toBeNull()
    expect(await screen.findByAltText('QR code for your personal app link')).toBeTruthy()
    expect(QRCode.toDataURL).toHaveBeenCalledWith(promoter.share_url, expect.objectContaining({ errorCorrectionLevel: 'M' }))
    expect(document.body.textContent).not.toContain('old-name')
  })
  it('requires explicit consent, enrolls and opens the workspace without a second sign-in', async () => {
    const enroll = vi.spyOn(api, 'enrollPromoter').mockResolvedValue({ promoter, created: true, reactivated: false })
    let activated = false
    const load: api.PromoterLoader = async () => activated ? enrolled() : { kind: 'not-enrolled', appId: 'a', apps: [{ id: 'a', name: 'a' }] }
    enroll.mockImplementation(async () => { activated = true; return { promoter, created: true, reactivated: false } })
    page(load)
    const button = await screen.findByRole('button', { name: 'Enroll' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText(/I consent/)); fireEvent.click(button)
    await screen.findByText('Your share: 25%')
    expect(enroll).toHaveBeenCalledWith('a', '')
  })
  it.each(['suspended', 'withdrawn'] as const)('%s disables sharing while preserving own totals', async (status) => {
    page(async () => enrolled({ promoter: { ...promoter, status }, report: { ...report, contributions: { ...report.contributions, promotion: { ...report.contributions.promotion, promoter_status: status } } } }))
    await screen.findByText('Your share: 25%')
    expect(screen.queryByText('Copy link')).toBeNull()
    expect(screen.queryByText('Confirm withdrawal')).toBeNull()
  })
  it('hides link for a private/unavailable app', async () => {
    page(async () => enrolled({ promoter: { ...promoter, app_public: false } }))
    await screen.findByText(/unavailable for sharing/)
    expect(screen.queryByText('Copy link')).toBeNull()
  })
  it('supports account switching and sign-out without creator controls', async () => {
    const callbacks = page()
    fireEvent.click(screen.getByText('Switch account')); fireEvent.click(screen.getByText('Sign out'))
    expect(callbacks.onSwitchAccount).toHaveBeenCalledOnce(); expect(callbacks.onSignOut).toHaveBeenCalledOnce()
    expect(screen.queryByText('Publish')).toBeNull()
  })
  it('shows zero and partial activity with retry', async () => {
    page(async () => enrolled({ report: { ...report, contributions: { ...report.contributions, promotion: { ...report.contributions.promotion, counts: { pending: 0, confirmed: 0, reversed: 0, expired: 0 }, share_of_referred_users: { ...share, numerator: 0, denominator: 0, percent: 0 }, standing: { rank: null, ranked_promoters: 0, tied_on_count: false } } } }, activity: null, activityError: 'offline' }))
    await screen.findByText('Your share: 0%')
    expect(screen.getByText(/No confirmed referrals/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry activity' })).toBeTruthy()
  })
  it('retries a failed load and changes period', async () => {
    const load = vi.fn<api.PromoterLoader>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(enrolled())
    page(load); fireEvent.click(await screen.findByText('Retry')); await screen.findByText('Your share: 25%')
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: '7d' } })
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ appId: 'a', range: '7d' })))
  })
  it('drops late responses across app changes and supports hash history', async () => {
    let release: (data: api.PromoterAccess) => void = () => {}
    const load: api.PromoterLoader = async (q) => q.appId === 'b' ? new Promise((r) => { release = r }) : enrolled()
    page(load); fireEvent.change(await screen.findByLabelText('App'), { target: { value: 'b' } })
    await waitFor(() => expect(screen.getByText('Loading…')).toBeTruthy())
    history.replaceState(null, '', promoterHash('a')); window.dispatchEvent(new HashChangeEvent('hashchange'))
    await screen.findByText('Your share: 25%')
    release(enrolled({ promoter: { ...promoter, code: 'STALE' } }))
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByText('STALE')).toBeNull()
  })
  it('paginates activity without duplicate rows', async () => {
    const item = { referral_id: 'r1', status: 'confirmed' as const, captured_at: 1, expires_at: 2, activated_at: 1, confirmed_at: 1 }
    vi.spyOn(api, 'ownActivity').mockResolvedValue({ promoter_status: 'active', counts, referrals: [item, { ...item, referral_id: 'r2', status: 'reversed' }], next: null })
    page(async () => enrolled({ activity: { promoter_status: 'active', counts, referrals: [item], next: { before_id: 'r1' } } }))
    fireEvent.click(await screen.findByText('Load more activity'))
    await waitFor(() => expect(screen.queryByText('Load more activity')).toBeNull())
    expect(screen.getAllByText(/— confirmed/)).toHaveLength(1)
    expect(screen.getAllByText(/— reversed/)).toHaveLength(1)
  })
  it('starts public profile switches unchecked and sends separate explicit consent', async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => json(init?.method === 'PUT' ? { ok: true } : { appId: 'a', profile: null }))
    vi.stubGlobal('fetch', fetch); page()
    const show = await screen.findByLabelText('Show my public name')
    const promotion = screen.getByLabelText('Show my promotion contribution publicly')
    expect((show as HTMLInputElement).checked).toBe(false); expect((promotion as HTMLInputElement).checked).toBe(false)
    fireEvent.click(show); fireEvent.click(promotion); fireEvent.click(screen.getByText('Save public choices'))
    await waitFor(() => expect(fetch.mock.calls.some((c) => c[1]?.method === 'PUT')).toBe(true))
    expect(JSON.parse(String(fetch.mock.calls.find((c) => c[1]?.method === 'PUT')?.[1]?.body))).toMatchObject({ visible: true, show_promotion: true, display_name: 'Pat' })
  })
  it('reads existing public consent from own profile without requesting owner roster', async () => {
    const fetch = vi.fn(async (_url: string) => json({ appId: 'a', profile: { display_name: 'Saved Pat', label: 'Promoter', visible: true, show_promotion: true, updated_at: '2026-11-06 00:00:00' } }))
    vi.stubGlobal('fetch', fetch); page()
    const visible = await screen.findByLabelText('Show my public name')
    expect((visible as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Show my promotion contribution publicly') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Saved Pat')
    expect(fetch.mock.calls.every((c) => c[0].endsWith('/team/public/me'))).toBe(true)
  })
  it.each([403, 404])('keeps enrollment/stats usable when own preferences return %s', async (status) => {
    vi.stubGlobal('fetch', async () => new Response('not available', { status }))
    page()
    await screen.findByText(/Public preferences are temporarily unavailable/)
    expect(screen.getByText('Your share: 25%')).toBeTruthy()
    expect(screen.queryByLabelText('Show my public name')).toBeNull()
    expect(screen.queryByText('Save public choices')).toBeNull()
  })
  it('withdraws only after preview and explicit confirmation', async () => {
    const withdraw = vi.spyOn(api, 'withdrawPromoter').mockResolvedValue({})
    page(); fireEvent.click(await screen.findByText('Withdraw from promotion'))
    expect(withdraw).not.toHaveBeenCalled()
    expect(screen.getByText(/public promotion consent will be removed/)).toBeTruthy()
    fireEvent.click(screen.getByText('Confirm withdrawal'))
    await waitFor(() => expect(withdraw).toHaveBeenCalledWith('a'))
  })
})

describe('auth return', () => {
  it('carries a validated slug through the SDK hash-dropping return_to', () => {
    const target = new URL(promoterSignInUrl('https://console.proappstore.online/?return_to=//evil#/promoter?app=stash'), 'https://console.proappstore.online')
    target.hash = '#pas_session=fake'
    expect(target.searchParams.has('return_to')).toBe(false)
    expect(promoterOAuthReturn(target.search)).toEqual({ appId: 'stash' })
    expect(parseHash(promoterHash(promoterOAuthReturn(target.search)?.appId)).view).toBe('promoter')
  })
  it.each(['https://evil', '//evil', 'a/b', 'a b'])('does not carry unsafe app context %s', (app) => {
    const target = new URL(promoterSignInUrl('https://console.proappstore.online/#/promoter?app=' + encodeURIComponent(app)), 'https://console.proappstore.online')
    expect(promoterOAuthReturn(target.search)).toEqual({ appId: null })
  })
  it('sets the OAuth marker before invoking SDK sign-in', () => {
    history.replaceState(null, '', '/#/promoter?app=stash')
    render(<PromoterSignIn />)
    fireEvent.click(screen.getByText('Sign in with google'))
    expect(promoterOAuthReturn(location.search)).toEqual({ appId: 'stash' })
  })
  it('retains the app when retrying after SDK cleared a failed callback hash', () => {
    expect(promoterSignInUrl('https://console.proappstore.online/?promoter=1&promoter_app=stash')).toContain('promoter_app=stash')
  })
})

describe('owner controls', () => {
  const owner: api.OwnerPromoters = { settings: { enrollment_open: true }, people: { promoters: [{ ...promoter }], counts: { active: 1, suspended: 0, withdrawn: 0, total: 1 }, next: null }, report: { app_id: 'a', freshness: report.freshness, totals: { ...counts, promoters: 1 }, acquisition: { activations_recorded: 12, referred_confirmed: 2, referred_reversed: 0, organic: 10, note: 'Separate organic bucket.' }, standings: [{ promoter_id: 'p1', display_name: 'Pat', rank: 1, counts, share_of_referred_users: share }], next: null }, referrals: { referrals: [{ referral_id: 'r1', promoter_id: 'p1', status: 'confirmed', captured_at: 1, expires_at: 2, activated_at: 1, confirmed_at: 1, reversal_kind: null, reversal_reason: null }], counts, next: null }, events: { events: [], next: null }, referralEvents: { events: [], next: null } }
  it('requires reason and preview before a correction and reloads audit after it', async () => {
    const correct = vi.spyOn(api, 'correctReferral').mockResolvedValue({ ok: true })
    const load = vi.fn(async () => owner)
    render(<AppPromoters appId="a" load={load} />)
    fireEvent.click(await screen.findByText('Reverse referral r1'))
    expect(correct).not.toHaveBeenCalled()
    expect((screen.getByText('Confirm change') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Invalid capture' } })
    fireEvent.click(screen.getByText('Confirm change'))
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    expect(correct).toHaveBeenCalledWith('a', 'r1', 'reverse', 'correction', 'Invalid capture')
    expect(document.body.textContent).toContain('10 organic/unattributed')
  })
  it('previews enrollment and promoter suspension without direct counter edits', async () => {
    const change = vi.spyOn(api, 'setPromoterStatus').mockResolvedValue({})
    render(<AppPromoters appId="a" load={async () => owner} />)
    fireEvent.click(await screen.findByText('Suspend Pat'))
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Review' } })
    fireEvent.click(screen.getByText('Confirm change'))
    await waitFor(() => expect(change).toHaveBeenCalledWith('a', 'p1', 'suspended', 'Review'))
    expect(screen.queryByLabelText('Confirmed count')).toBeNull()
  })
})
