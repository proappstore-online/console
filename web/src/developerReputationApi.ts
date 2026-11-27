import { apiFetch } from './api'

export interface DeveloperEvidence {
  app_id: string; role: string; membership_observed_since: number | null
  state: 'ok' | 'empty' | 'partial' | 'stale' | 'unavailable' | 'error'; state_reason: string; verified: boolean
  counts: { commits: number; additions: number; deletions: number } | null
  first_recorded_commit_at: number | null; last_recorded_commit_at: number | null; last_refreshed_at: number | null
}
export interface DeveloperReputation {
  version: 1; policy_version: number; generated_at: number; identity: 'verified_github' | 'unlinked'; scope: 'current_authorized_apps'
  apps: DeveloperEvidence[]
  summary: { current_apps: number; verified_contributed_repositories: number; incomplete_apps: number }
  badges: { id: string; label: string; evidence: string }[]; history_note: string
}

const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const count = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0
const time = (x: unknown) => x === null || count(x)

/** Refuse an incomplete/malformed contract instead of rendering missing evidence as zero. */
export async function fetchDeveloperReputation(token: string | null): Promise<DeveloperReputation> {
  const x = await apiFetch<unknown>('/me/developer-reputation', { token, credentials: 'omit', cache: 'no-store' })
  if (!record(x) || x.version !== 1 || x.scope !== 'current_authorized_apps' || !['verified_github', 'unlinked'].includes(String(x.identity))
    || !count(x.generated_at) || !count(x.policy_version) || typeof x.history_note !== 'string' || !Array.isArray(x.apps) || !Array.isArray(x.badges)
    || !record(x.summary) || !count(x.summary.current_apps) || !count(x.summary.verified_contributed_repositories) || !count(x.summary.incomplete_apps)
    || x.summary.current_apps !== x.apps.length || x.summary.incomplete_apps > x.apps.length
    || !x.apps.every((a) => record(a) && typeof a.app_id === 'string' && /^[a-z][a-z0-9-]*$/.test(a.app_id)
      && ['owner', 'admin', 'developer', 'po', 'viewer'].includes(String(a.role)) && time(a.membership_observed_since)
      && ['ok', 'empty', 'partial', 'stale', 'unavailable', 'error'].includes(String(a.state)) && typeof a.state_reason === 'string' && typeof a.verified === 'boolean'
      && (a.counts === null || record(a.counts) && count(a.counts.commits) && count(a.counts.additions) && count(a.counts.deletions))
      && time(a.first_recorded_commit_at) && time(a.last_recorded_commit_at) && time(a.last_refreshed_at))
    || new Set(x.apps.map((a) => (a as Record<string, unknown>).app_id)).size !== x.apps.length
    || !x.badges.every((b) => record(b) && ['code-contributor', 'multi-app-contributor'].includes(String(b.id)) && typeof b.label === 'string' && typeof b.evidence === 'string')) {
    throw new Error('The contribution profile response could not be read.')
  }
  return x as unknown as DeveloperReputation
}
