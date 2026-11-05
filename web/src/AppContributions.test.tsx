// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AppContributions } from './AppContributions'
import { loadContributions, loadMorePeople, rangeError, type ContributionState } from './contributionsApi'
import { people, person, summary } from './contributions.fixture'
vi.mock('./sdk', () => ({ pro: { auth: { token: 'session', onChange: () => () => {} } } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function backend(status = 200) {
 const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(status === 200 ? url.includes('/people') ? people() : summary() : { error: 'refused' }), { status }))
 vi.stubGlobal('fetch', fetcher); return fetcher
}
describe('contributions HTTP contract', () => {
 it('sends auth, credentials, half-open bounds, page limit and encoded app/cursor; preserves raw shares', async () => {
  const f = backend()
  const r = await loadContributions('a', 'secret', { from: '2026-01-01', to: '2026-02-01', limit: 10 })
  expect(r.accessState).toBe('ok'); expect(r.people?.people[0]?.share.percent).toBe(80)
  expect(f.mock.calls.map(c => c[0])).toEqual(expect.arrayContaining([expect.stringContaining('contributions?from=2026-01-01&to=2026-02-01'), expect.stringContaining('/people?from=2026-01-01&to=2026-02-01&limit=10')]))
  await loadMorePeople('a', 'secret', '1.80.1', { limit: 10 })
  expect(f.mock.calls.at(-1)?.[0]).toContain('cursor=1.80.1')
  const init = (f.mock.calls as unknown as [string, RequestInit][])[0]![1]
  expect(init).toMatchObject({ credentials: 'include', cache: 'no-store', headers: { Authorization: 'Bearer secret' } })
 })
 it.each([[401, 'denied'], [403, 'denied'], [404, 'not-found'], [503, 'unavailable'], [500, 'error']])('maps %s and discards all data', async (status, state) => {
  backend(Number(status)); expect(await loadContributions('a', 's')).toMatchObject({ accessState: state, summary: null, people: null })
 })
 it('rejects app mismatches in initial and later pages', async () => { backend(); expect((await loadContributions('other', 's')).accessState).toBe('error'); await expect(loadMorePeople('other', 's', 'c')).rejects.toThrow(/mismatch/) })
 it.each(['policy', 'denominator', 'period', 'head', 'read'])('fails honestly when initial GETs straddle a refresh (%s)', async field => {
  const p = people()
  if (field === 'policy') p.policy_version++
  if (field === 'denominator') p.eligible_additions++
  if (field === 'period') p.period = { ...p.period, from: 99 }
  if (field === 'head') p.freshness = { ...p.freshness!, head_sha: 'new-head' }
  if (field === 'read') p.freshness = { ...p.freshness!, last_success_at: 99 }
  const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/people') ? p : summary())))
  vi.stubGlobal('fetch', fetcher)
  render(<AppContributions appId="a" />)
  await screen.findByText(/figures changed during this read/)
  expect(screen.queryByRole('list')).toBeNull()
  expect(screen.queryByText(/Total eligible additions/)).toBeNull()
  expect(fetcher).toHaveBeenCalledTimes(2) // no automatic retry loop
  p.policy_version = 1; p.eligible_additions = 100; p.period = summary().period; p.freshness = summary().freshness
  fireEvent.click(screen.getByText('Refresh contributions'))
  await screen.findByText(/Person 1/)
  expect(fetcher).toHaveBeenCalledTimes(4)
 })
 it('prioritizes a concurrent denial over a summary failure', async () => {
  vi.stubGlobal('fetch', async (url: string) => new Response(JSON.stringify({ error: 'failed' }), { status: url.includes('/people') ? 403 : 500 }))
  expect(await loadContributions('a', 's')).toMatchObject({ accessState: 'denied', summary: null, people: null })
 })
 it('validates real calendar dates and exclusive bounds', () => { expect(rangeError('2026-02-30', '')).toBeTruthy(); expect(rangeError('2026-01-01', '2026-01-01')).toMatch(/exclusive/); expect(rangeError('', '')).toBeNull() })
})
describe('contributions UI', () => {
 it.each(['ok', 'partial', 'stale', 'empty', 'error', 'unavailable'] as ContributionState[])('renders backend %s without turning unknown history into zero', async state => {
  const s = { ...summary(), state, state_reason: 'Reason ' + state, complete: !['partial', 'error', 'unavailable'].includes(state) }
  const p = { ...people(), state, state_reason: s.state_reason, people: state === 'empty' ? [] : [person()] }
  if (state === 'empty') {
   p.eligible_additions = 0
   s.totals = { additions: 0, deletions: 0, commits: 0, people: 0, truncated_commits: 0, co_authored_commits: 0 }
   s.buckets = { bots: { additions: 0, deletions: 0, commits: 0 }, unlinked: { additions: 0, deletions: 0, commits: 0 } }
  }
  render(<AppContributions appId="a" loader={async () => ({ accessState: 'ok', summary: s, people: p })} />)
  await screen.findByText('Reason ' + state)
  if (['error', 'unavailable'].includes(state)) expect(screen.queryByRole('list')).toBeNull()
  else if (state === 'empty') expect(screen.getByText('No counted commits in this period.')).toBeTruthy()
  else expect(screen.getByText(/Person 1/)).toBeTruthy()
 })
 it('renders unmatched people, buckets, server percentage and freshness', async () => {
  const s = summary(); s.freshness!.age_ms = 46 * 60000
  render(<AppContributions appId="a" loader={async () => ({ accessState: 'ok', summary: s, people: { ...people(), people: [person(), person(2)] } })} />)
  await screen.findByText('Linked to PAS account'); expect(screen.getByText('Unmatched PAS account')).toBeTruthy()
  expect(screen.getByText(/Bots: \+10/)).toBeTruthy(); expect(screen.getByText(/Unlinked authors: \+10/)).toBeTruthy(); expect(screen.getByText(/Staleness warning/)).toBeTruthy()
 })
 it('filters and pages, then clears every row on revoked access', async () => {
  const loader = vi.fn<typeof loadContributions>(async () => ({ accessState: 'ok', summary: summary(), people: { ...people(), next: { cursor: '1.80.1' } } }))
  const more = vi.fn<typeof loadMorePeople>().mockResolvedValueOnce({ ...people(), people: [person(2)], next: { cursor: '2.80.2' } }).mockRejectedValueOnce(new (await import('./api')).ApiError(403, 'revoked'))
  render(<AppContributions appId="a" loader={loader} moreLoader={more} />)
  fireEvent.click(await screen.findByText('Load more')); await screen.findByText(/Person 2/)
  expect(more).toHaveBeenCalledWith('a', 'session', '1.80.1', {})
  fireEvent.click(screen.getByText('Load more')); await screen.findByText(/Access denied/); expect(screen.queryByText(/Person 1/)).toBeNull(); expect(screen.queryByText(/Bots:/)).toBeNull()
  fireEvent.click(screen.getByText('Last 30 days')); await waitFor(() => expect(loader.mock.calls.at(-1)?.[2]?.from).toMatch(/^\d{4}-/))
 })
 it.each([403, 404])('shows %s for a caller with no app access', async status => { backend(status); render(<AppContributions appId="a" />); await screen.findByText(status === 403 ? /Access denied/ : 'Project not found'); expect(screen.queryByRole('list')).toBeNull() })
 it('hides previous app data synchronously while another app loads', async () => {
  const loader = vi.fn<typeof loadContributions>().mockResolvedValueOnce({ accessState: 'ok', summary: summary(), people: people() }).mockImplementationOnce(() => new Promise(() => {}))
  const view = render(<AppContributions appId="a" loader={loader} />); await screen.findByText(/Person 1/); view.rerender(<AppContributions appId="b" loader={loader} />); expect(screen.queryByText(/Person 1/)).toBeNull()
 })
})
