// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AppContributions } from './AppContributions'
import {
  loadContributions, rangeError, sharePct, utcDaysAgo,
  type ContributionData, type ContributionLoader, type ContributionPerson,
} from './contributionsApi'
import { appTabsFor, parseHash, hashFor } from './nav'

const person = (n: number, added: number, over: Partial<ContributionPerson> = {}): ContributionPerson =>
  ({ id: `p${n}`, displayName: `Person ${n}`, added, removed: 10 * n, commits: n, ...over })

function data(over: Partial<ContributionData> = {}): ContributionData {
  return {
    status: 'complete', asOf: '2026-11-05T00:00:00Z',
    policy: { version: 'v1', summary: 'Source files only; lockfiles and generated files are excluded.' },
    additionsDenominator: 1000,
    people: [person(1, 600), person(2, 250)],
    buckets: { automation: { added: 100, removed: 5, commits: 4 }, unmatched: { added: 50, removed: 1, commits: 2 } },
    next: null, ...over,
  }
}
const ok = (d: ContributionData) => ({ kind: 'ok' as const, data: d })

afterEach(cleanup)

describe('contribution helpers', () => {
  it('share is additions ÷ the period denominator, with one decimal, and unknown when the denominator is zero', () => {
    expect(sharePct(600, 1000)).toBe(60)
    expect(sharePct(1, 3)).toBe(33.3)
    expect(sharePct(0, 1000)).toBe(0)
    expect(sharePct(5, 0)).toBeNull()
    expect(sharePct(5, Number.NaN)).toBeNull()
    expect(sharePct(2000, 1000)).toBe(100) // never above 100
  })
  it('validates explicit UTC date ranges', () => {
    expect(rangeError('', '')).toBeNull()
    expect(rangeError('2026-01-01', '2026-01-31')).toBeNull()
    expect(rangeError('2026-02-01', '2026-01-31')).toMatch(/on or before/)
    expect(rangeError('01/02/2026', '')).toMatch(/dates like/)
    expect(rangeError('2026-13-45', '')).toMatch(/dates like/)
  })
  it('counts N days back in UTC', () => {
    expect(utcDaysAgo(30, Date.parse('2026-11-05T23:30:00Z'))).toBe('2026-10-06')
  })
})

describe('contributions tab routing', () => {
  it('is a deep-linkable app tab', () => {
    expect(parseHash('#/apps/x/contributions')).toMatchObject({ view: 'app-detail', param: 'x', tab: 'contributions' })
    expect(hashFor('app-detail', 'x', 'contributions')).toBe('#/apps/x/contributions')
    expect(appTabsFor(undefined).map((t) => t.key)).toContain('contributions')
  })
  it('is not offered for an app the caller only administers', () => {
    const adminOnly = { id: 'x', name: 'X', createdAt: '', adminOnly: true }
    expect(appTabsFor(adminOnly, 'allowed').map((t) => t.key)).toEqual(['operator'])
  })
})

describe('AppContributions — API not deployed (default loader)', () => {
  it('says unavailable, shows no people or figures, and keeps the policy statement', async () => {
    render(<AppContributions appId="a" loader={loadContributions} />)
    await screen.findByText('Contributions are not available yet')
    expect(screen.queryByRole('list', { name: 'Contributor ranking' })).toBeNull()
    expect(document.body.textContent).toMatch(/not surviving-code ownership/)
    expect(document.body.textContent).not.toMatch(/\d+%/)
  })
})

describe('AppContributions — contract states (loader injected)', () => {
  it('ranks in server order with additions, separate removals, commits and share; states denominator and freshness', async () => {
    render(<AppContributions appId="a" loader={async () => ok(data())} />)
    const list = await screen.findByRole('list', { name: 'Contributor ranking' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows[0]!.textContent).toContain('Person 1')
    expect(rows[0]!.textContent).toContain('+600 / −10 · 1 commit · 60%')
    expect(rows[1]!.textContent).toContain('+250 / −20 · 2 commits · 25%')
    expect(document.body.textContent).toContain('÷ 1,000 eligible lines')
    expect(document.body.textContent).toContain('Refreshed')
    expect(document.body.textContent).toContain('Counting policy v1: Source files only')
  })

  it('keeps automation and unmatched authors out of the ranking', async () => {
    render(<AppContributions appId="a" loader={async () => ok(data())} />)
    const list = await screen.findByRole('list', { name: 'Contributor ranking' })
    expect(within(list).queryByText(/Automation|Unmatched/)).toBeNull()
    expect(screen.getByText(/Automation: \+100 \/ −5 · 4 commits/)).toBeTruthy()
    expect(screen.getByText(/Unmatched authors: \+50 \/ −1 · 2 commits/)).toBeTruthy()
  })

  it('zero state: no counted commits; and an unknown (zero) denominator never invents a percentage', async () => {
    const zero = data({ people: [], additionsDenominator: 0, buckets: { automation: { added: 0, removed: 0, commits: 0 }, unmatched: { added: 0, removed: 0, commits: 0 } } })
    const { unmount } = render(<AppContributions appId="a" loader={async () => ok(zero)} />)
    await screen.findByText('No counted commits in this period.')
    unmount()
    render(<AppContributions appId="a" loader={async () => ok(data({ additionsDenominator: 0 }))} />)
    await screen.findByRole('list', { name: 'Contributor ranking' })
    expect(document.body.textContent).toContain('share unknown')
    expect(document.body.textContent).not.toMatch(/\d%/)
  })

  it.each([
    ['incomplete_backfill', 'History is still being counted'],
    ['stale', 'These figures are out of date'],
  ] as const)('%s is announced, with the numbers still shown', async (status, title) => {
    render(<AppContributions appId="a" loader={async () => ok(data({ status }))} />)
    await screen.findByText(title)
    expect(screen.getByRole('list', { name: 'Contributor ranking' })).toBeTruthy()
  })

  it('a complete result shows no status banner', async () => {
    render(<AppContributions appId="a" loader={async () => ok(data())} />)
    await screen.findByRole('list', { name: 'Contributor ranking' })
    expect(screen.queryByText(/still being counted|out of date/)).toBeNull()
  })

  it('error state offers retry and recovers', async () => {
    const loader = vi.fn<ContributionLoader>().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(ok(data()))
    render(<AppContributions appId="a" loader={loader} />)
    await screen.findByText(/Couldn’t load contributions: boom/)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByRole('list', { name: 'Contributor ranking' })
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('forbidden/revoked: shows a refusal and no project data', async () => {
    render(<AppContributions appId="a" loader={async () => ({ kind: 'forbidden' })} />)
    await screen.findByText(/don’t have access/)
    expect(screen.queryByRole('list', { name: 'Contributor ranking' })).toBeNull()
    expect(document.body.textContent).not.toMatch(/Person|\+\d/)
  })
})

describe('AppContributions — periods and pagination', () => {
  it('defaults to all history (no bounds) and sends explicit UTC bounds for presets and custom ranges', async () => {
    const loader = vi.fn<ContributionLoader>(async () => ok(data()))
    render(<AppContributions appId="a" loader={loader} />)
    await screen.findByRole('list', { name: 'Contributor ranking' })
    expect(loader).toHaveBeenLastCalledWith({ appId: 'a' })
    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }))
    await waitFor(() => expect(loader.mock.calls.at(-1)![0]).toMatchObject({ appId: 'a', from: utcDaysAgo(30) }))
    expect(loader.mock.calls.at(-1)![0].to).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    fireEvent.change(screen.getByLabelText('From (UTC)'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('To (UTC)'), { target: { value: '2026-01-31' } })
    await waitFor(() => expect(loader).toHaveBeenLastCalledWith({ appId: 'a', from: '2026-01-01', to: '2026-01-31' }))
  })

  it('does not query with an invalid range and says why', async () => {
    const loader = vi.fn<ContributionLoader>(async () => ok(data()))
    render(<AppContributions appId="a" loader={loader} />)
    await screen.findByRole('list', { name: 'Contributor ranking' })
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    const calls = loader.mock.calls.length
    fireEvent.change(screen.getByLabelText('From (UTC)'), { target: { value: '2026-02-01' } })
    fireEvent.change(screen.getByLabelText('To (UTC)'), { target: { value: '2026-01-01' } })
    expect((await screen.findByRole('alert')).textContent).toMatch(/on or before/)
    expect(loader.mock.calls.slice(calls).every((c) => !(c[0].from === '2026-02-01' && c[0].to === '2026-01-01'))).toBe(true)
  })

  it('pages by the server cursor, appends without duplicates, and keeps ranks continuous', async () => {
    const loader = vi.fn<ContributionLoader>(async (q) => q.cursor
      ? ok(data({ people: [person(2, 250), person(3, 250)], next: null })) // person 2 repeats across the boundary
      : ok(data({ people: [person(1, 600), person(2, 250)], next: 'c1' })))
    render(<AppContributions appId="a" loader={loader} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Contributor ranking' })).getAllByRole('listitem')).toHaveLength(3))
    expect(loader).toHaveBeenLastCalledWith({ appId: 'a', cursor: 'c1' })
    const rows = within(screen.getByRole('list', { name: 'Contributor ranking' })).getAllByRole('listitem').map((r) => r.textContent)
    expect(rows[2]).toContain('3.')
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('changing the app clears the old project and ignores its late response', async () => {
    let releaseA: (r: ReturnType<typeof ok>) => void = () => {}
    const loader = vi.fn<ContributionLoader>((q) => q.appId === 'a'
      ? new Promise((r) => { releaseA = r as typeof releaseA })
      : Promise.resolve(ok(data({ people: [person(9, 500, { displayName: 'From B' })] }))))
    const { rerender } = render(<AppContributions appId="a" loader={loader} />)
    rerender(<AppContributions appId="b" loader={loader} />)
    await screen.findByText(/From B/)
    releaseA(ok(data({ people: [person(8, 900, { displayName: 'From A' })] })))
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByText(/From A/)).toBeNull()
    expect(screen.getByText(/From B/)).toBeTruthy()
  })

  it('switching apps never shows the previous app’s people while the next one loads', async () => {
    let releaseB: (r: ReturnType<typeof ok>) => void = () => {}
    const loader = vi.fn<ContributionLoader>((q) => q.appId === 'a'
      ? Promise.resolve(ok(data({ people: [person(1, 100, { displayName: 'Only A' })] })))
      : new Promise((r) => { releaseB = r as typeof releaseB }))
    const { rerender } = render(<AppContributions appId="a" loader={loader} />)
    await screen.findByText(/Only A/)
    rerender(<AppContributions appId="b" loader={loader} />)
    expect(screen.queryByText(/Only A/)).toBeNull()
    releaseB(ok(data({ people: [] })))
  })
})
