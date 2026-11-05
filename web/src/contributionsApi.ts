// Project contributions: per-person code activity (console#13).
//
// The backend (platform#547, backed by #545/#546) is NOT deployed and its routes and payloads are not
// published, so this module owns the *view-model* the UI renders and the default loader reports
// `unavailable` without a request. Nothing here invents a contributor, a count or a percentage. When the
// platform contract ships, replace `loadContributions` with a real client that maps the response onto
// these types; the view does not change.

export interface ContributionQuery {
  appId: string
  /** Inclusive UTC calendar bounds, `YYYY-MM-DD`. Both absent = all history (the default). */
  from?: string
  to?: string
  cursor?: string
}

export interface ContributionPerson {
  /** Opaque, stable key for list rendering only. */
  id: string
  displayName: string
  /** Eligible lines added / removed and counted commits in the selected period. */
  added: number
  removed: number
  commits: number
}

export interface ContributionBucket { added: number; removed: number; commits: number }

export type ContributionStatus = 'complete' | 'incomplete_backfill' | 'stale'

export interface ContributionData {
  status: ContributionStatus
  /** ISO time of the last refresh. */
  asOf: string
  /** The applied source-file / counting policy, in plain language. */
  policy: { version: string; summary: string }
  /** Total eligible additions in the same period: the denominator for every share. */
  additionsDenominator: number
  people: ContributionPerson[]
  /** Kept apart from people so bots and unmatched authors never rank as contributors. */
  buckets: { automation: ContributionBucket; unmatched: ContributionBucket }
  next: string | null
}

export type ContributionResult =
  | { kind: 'unavailable' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; data: ContributionData }

export type ContributionLoader = (q: ContributionQuery) => Promise<ContributionResult>

/** Default loader: the contributions API is not deployed, so say so. No network call. */
export const loadContributions: ContributionLoader = async () => ({ kind: 'unavailable' })

/** A person's share of the period's eligible additions, 0–100 with one decimal; null when it is unknowable. */
export function sharePct(added: number, denominator: number): number | null {
  if (!Number.isFinite(added) || !Number.isFinite(denominator) || denominator <= 0) return null
  return Math.round((Math.min(added, denominator) / denominator) * 1000) / 10
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Validate an explicit date range. Returns an error message, or null when it is usable (including empty). */
export function rangeError(from: string, to: string): string | null {
  for (const v of [from, to]) {
    if (v && (!DAY.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)))) return 'Use dates like 2026-01-31.'
  }
  if (from && to && from > to) return 'The start date must be on or before the end date.'
  return null
}

/** `YYYY-MM-DD` for N days back from `now`, UTC (matches the explicit UTC bounds the API will use). */
export function utcDaysAgo(days: number, now = Date.now()): string {
  return new Date(now - days * 86_400_000).toISOString().slice(0, 10)
}

export const POLICY_NOTE =
  'These are historical code-activity figures — lines added and removed in counted commits — not surviving-code ownership. They do not set roles, access, ownership or payouts.'
