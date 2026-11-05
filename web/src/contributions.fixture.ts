import type { ContributionPerson, ContributionSummary, PeopleResponse } from './contributionsApi'
export function person(id = 1): ContributionPerson { return { rank: id, github_account_id: id, github_login: 'Person ' + id, matched: id === 1, user_id: id === 1 ? 'gh:1' : null, additions: 80, deletions: 5, commits: 2, last_commit_at: 1, last_commit_iso: '1970-01-01T00:00:00.001Z', share: { numerator: 80, denominator: 100, ratio: .8, percent: 80, basis: 'Eligible additions' } } }
export function summary(): ContributionSummary { return {
 app_id: 'a', state: 'ok', state_reason: 'Complete and fresh.', complete: true, repository: null,
 period: { from: null, to: null, from_iso: null, to_iso: null, rule: 'from <= date < to' },
 policy_version: 1, policy: { version: 1, counts: 'Source and tests', tests: 'counted', documentation: 'excluded', excluded: ['lockfiles'], merge_commits: 'excluded', authorship: 'author', period: 'UTC half-open' },
 freshness: { refresh_mode: 'scheduled', last_success_at: 1, last_success_iso: '1970-01-01T00:00:00.001Z', last_attempt_at: 1, next_refresh_at: 2, age_ms: 1, rate_limited_until: null, backfill_complete: true, head_sha: 'abc', rewrite_detected_at: null, note: 'Scheduled refresh' },
 totals: { additions: 100, deletions: 10, commits: 4, people: 2, truncated_commits: 0, co_authored_commits: 0 }, buckets: { bots: { additions: 10, deletions: 1, commits: 1 }, unlinked: { additions: 10, deletions: 4, commits: 1 } }, excluded: { unreachable_commits: 0, merge_commits_not_counted: 0 }, share_basis: 'All eligible additions including bots and unlinked authors.'
} }
export function people(): PeopleResponse { const s = summary(); return { app_id: 'a', state: 'ok', state_reason: s.state_reason, complete: true, period: s.period, freshness: s.freshness, policy_version: 1, share_basis: s.share_basis, tie_order: 'additions then id', eligible_additions: 100, people: [person()], next: null } }
