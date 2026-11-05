import { apiFetch, ApiError } from './api'
// Historical code activity, never surviving-code ownership or an authorization claim.
export type ContributionState = 'unavailable' | 'error' | 'partial' | 'stale' | 'empty' | 'ok'
export interface ContributionOptions { from?: string; to?: string; limit?: number; cursor?: string }
export interface ContributionBucket { additions: number; deletions: number; commits: number }
export interface ContributionPeriod { from: number | null; to: number | null; from_iso: string | null; to_iso: string | null; rule: string }
export interface ContributionFreshness {
 refresh_mode: string; last_success_at: number | null; last_success_iso: string | null
 last_attempt_at: number | null; next_refresh_at: number | null; age_ms: number | null
 rate_limited_until: number | null; backfill_complete: boolean; head_sha: string | null
 rewrite_detected_at: number | null; note: string
}
export interface ContributionPolicy {
 version: number; counts: string; tests: string; documentation: string; excluded: string[]
 merge_commits: string; authorship: string; period: string
}
export interface ContributionSummary {
 app_id: string; state: ContributionState; state_reason: string; complete: boolean
 repository: { full_name: string; status: string; default_branch: string | null; verified_at: number | null } | null
 period: ContributionPeriod; policy: ContributionPolicy; policy_version: number; freshness: ContributionFreshness | null
 totals: ContributionBucket & { people: number; truncated_commits: number; co_authored_commits: number }
 buckets: { bots: ContributionBucket; unlinked: ContributionBucket }
 excluded: { unreachable_commits: number; merge_commits_not_counted: number }; share_basis: string
}
export interface ContributionPerson {
 rank: number; github_account_id: number; github_login: string | null; matched: boolean; user_id: string | null
 additions: number; deletions: number; commits: number; last_commit_at: number; last_commit_iso: string | null
 share: { numerator: number; denominator: number; ratio: number; percent: number; basis: string }
}
export interface PeopleResponse {
 app_id: string; state: ContributionState; state_reason: string; complete: boolean; period: ContributionPeriod
 freshness: ContributionFreshness | null; policy_version: number; share_basis: string; tie_order: string
 eligible_additions: number; people: ContributionPerson[]; next: { cursor: string } | null
}
export type AccessState = 'ok' | 'denied' | 'not-found' | 'unavailable' | 'error'
// Failures carry no project data, rather than inventing a summary or retaining cached figures.
export type ContributionsResult =
 | { accessState: 'ok'; summary: ContributionSummary; people: PeopleResponse }
 | { accessState: Exclude<AccessState, 'ok'>; summary: null; people: null; message: string }
export function contributionFailure(e: unknown): Extract<ContributionsResult, { summary: null }> {
 const status = e instanceof ApiError ? e.status : 0
 return { accessState: status === 401 || status === 403 ? 'denied' : status === 404 ? 'not-found' : status === 503 ? 'unavailable' : 'error', summary: null, people: null, message: e instanceof Error ? e.message : 'Could not load contributions.' }
}
function query(opts: ContributionOptions, people: boolean) {
 const q = new URLSearchParams()
 if (opts.from) q.set('from', opts.from)
 if (opts.to) q.set('to', opts.to)
 if (people && opts.limit !== undefined) q.set('limit', String(opts.limit))
 if (people && opts.cursor) q.set('cursor', opts.cursor)
 return q.size ? '?' + q : ''
}
function read<T>(appId: string, token: string | null, suffix: string, opts: ContributionOptions) {
 return apiFetch<T>('/apps/' + encodeURIComponent(appId) + '/contributions' + suffix + query(opts, suffix === '/people'), { credentials: 'include', cache: 'no-store', token })
}
export async function loadMorePeople(appId: string, token: string | null, cursor: string, opts: ContributionOptions = {}): Promise<PeopleResponse> {
 const page = await read<PeopleResponse>(appId, token, '/people', { ...opts, cursor })
 if (page.app_id !== appId) throw new Error('Contribution app context mismatch.')
 return page
}
export async function loadContributions(appId: string, token: string | null, opts: ContributionOptions = {}): Promise<ContributionsResult> {
 try {
  const [s, p] = await Promise.allSettled([read<ContributionSummary>(appId, token, '', opts), read<PeopleResponse>(appId, token, '/people', opts)])
  // A concurrent denial takes precedence over transient failures.
  const denied = [s, p].find(r => r.status === 'rejected' && r.reason instanceof ApiError && [401, 403].includes(r.reason.status))
  if (denied?.status === 'rejected') throw denied.reason
  if (s.status === 'rejected') throw s.reason
  if (p.status === 'rejected') throw p.reason
  if (s.value.app_id !== appId || p.value.app_id !== appId) throw new Error('Contribution app context mismatch.')
  if (s.value.policy_version !== p.value.policy_version || s.value.totals.additions !== p.value.eligible_additions ||
      s.value.period.from !== p.value.period.from || s.value.period.to !== p.value.period.to ||
      s.value.freshness?.head_sha !== p.value.freshness?.head_sha ||
      s.value.freshness?.last_success_at !== p.value.freshness?.last_success_at) {
   throw new Error('Contribution figures changed during this read. Refresh contributions to try again.')
  }
  return { accessState: 'ok', summary: s.value, people: p.value }
 } catch (e) { return contributionFailure(e) }
}
export function rangeError(from: string, to: string): string | null {
 for (const v of [from, to]) {
  if (v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v + 'T00:00:00Z')) || new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v)) return 'Use valid dates like 2026-01-31.'
 }
 return from && to && from >= to ? 'The start date must be before the exclusive end date.' : null
}
export function utcDaysAgo(days: number, now = Date.now()): string { return new Date(now - days * 86400000).toISOString().slice(0, 10) }
export const POLICY_NOTE = 'These figures reflect historical code activity and do not establish ownership, access, roles, or payouts. They measure additions and removals in counted commits, not surviving-code ownership.'
