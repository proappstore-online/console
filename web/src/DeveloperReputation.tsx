import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './api'
import { fetchDeveloperReputation, type DeveloperReputation as Reputation } from './developerReputationApi'

const date = (value: number | null) => value === null ? 'Unknown' : new Date(value).toLocaleDateString()

export function DeveloperReputation({ token }: { token: string | null }) {
  const [data, setData] = useState<Reputation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const generation = useRef(0)
  const load = useCallback(async () => {
    const current = ++generation.current
    setData(null); setError(null); setLoading(true)
    try {
      const result = await fetchDeveloperReputation(token)
      if (current === generation.current) setData(result)
    } catch (e) {
      if (current !== generation.current) return
      setError(e instanceof ApiError && [401, 403].includes(e.status)
        ? 'Sign in again as yourself to read your contribution profile.'
        : e instanceof ApiError && e.status === 404 ? 'Your contribution profile is not available on this deployment yet.'
          : 'Could not load your contribution profile. Please try again.')
    } finally { if (current === generation.current) setLoading(false) }
  }, [token])
  useEffect(() => { void load(); return () => { generation.current += 1 } }, [load])

  return <section aria-labelledby="developer-reputation-title" className="rounded-2xl border border-line bg-panel p-4 sm:p-6 space-y-4 min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 id="developer-reputation-title" className="display-font text-lg font-bold text-ink">Your developer contributions</h3>
      <button type="button" onClick={() => void load()} disabled={loading} className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm text-ink disabled:opacity-50">Refresh contribution profile</button>
    </div>
    <p className="text-sm text-muted">Private to you. Current app participation and recorded code activity.</p>
    {loading && <p role="status" className="text-sm text-muted">Loading contribution profile…</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {data && <>
      <p className="text-sm text-ink">Current apps: {data.summary.current_apps} · Repositories with verified contributions: {data.summary.verified_contributed_repositories}</p>
      {data.identity === 'unlinked' && <p className="text-sm text-muted">This sign-in has no verified GitHub identity. Accounts are not matched by name or email.</p>}
      {data.summary.incomplete_apps > 0 && <p role="status" className="text-sm text-muted">{data.summary.incomplete_apps} apps have incomplete or unavailable evidence. They do not count toward badges.</p>}
      {data.badges.length > 0 ? <ul aria-label="Contribution badges" className="flex flex-wrap gap-2">{data.badges.map((badge) => <li key={badge.id} className="rounded-xl border border-line p-3 text-sm">
        <strong className="text-ink">{badge.label}</strong><p className="mt-1 text-muted">{badge.evidence}</p>
      </li>)}</ul> : <p className="text-sm text-muted">No badges from current verified evidence yet.</p>}
      {data.apps.length === 0 ? <p className="text-sm text-muted">You do not currently own or belong to an app team.</p> : <ul aria-label="Your current app contributions" className="space-y-3">{data.apps.map((a) => <li key={a.app_id} className="rounded-xl border border-line p-3 space-y-2 break-words">
        <div className="flex flex-wrap gap-x-3 gap-y-1"><strong className="text-ink">{a.app_id}</strong><span className="text-sm text-muted">Current role: {a.role}</span></div>
        <p className="text-xs text-muted">Current membership since: {date(a.membership_observed_since)}</p>
        <p className="text-sm text-muted">{a.state_reason}</p>
        {a.counts === null ? <p className="text-sm text-muted">Code totals unavailable</p> : <p className="text-sm text-ink">{a.verified ? 'Verified' : 'Recorded so far'}: {a.counts.commits} commits · {a.counts.additions} lines added · {a.counts.deletions} removed</p>}
        {a.first_recorded_commit_at !== null && <p className="text-xs text-muted">Recorded code activity: {date(a.first_recorded_commit_at)} – {date(a.last_recorded_commit_at)}</p>}
        <p className="text-xs text-muted">Last refreshed: {date(a.last_refreshed_at)}</p>
      </li>)}</ul>}
      <p className="text-xs text-muted">{data.history_note}</p>
    </>}
  </section>
}
