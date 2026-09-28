/**
 * Operator view (#240) — the owner's oversight surface for one app they own.
 * This is the shell: baseline context the platform already has, plus the
 * panels later children fill in (users, reports, ID checks, metrics, actions).
 * Ownership is enforced by the API; this only renders what it returns.
 */

import { useState, useEffect } from 'react'
import { ApiError } from './api'
import { fetchOperatorContext, type OperatorContext } from './operator'
import { formatNumber, formatDuration } from './usage'
import { Kpi } from './sectionPrimitives'

const UPCOMING: { title: string; body: string }[] = [
  { title: 'Users', body: 'Everyone using the app, across tenants.' },
  { title: 'Reports & suspensions', body: 'Problem reports and suspended accounts the app exposes.' },
  { title: 'ID verification', body: 'The verification queue, with re-authentication before viewing a document.' },
  { title: 'App-wide metrics', body: 'Aggregate metrics beyond a single tenant.' },
  { title: 'Account actions', body: 'Investigate and act on a flagged account, audit-logged.' },
]

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'Your session has expired. Sign in again to open the operator view.'
    if (e.status === 403) return "Only the app's owner can open the operator view."
    if (e.status === 404) return 'This app is not published yet, so there is nothing to operate.'
  }
  return `Couldn't load the operator view. ${(e as Error).message}`
}

export function OperatorView({ appId, appName, getToken }: {
  appId: string
  appName: string | null
  getToken: () => string | null
}) {
  const [data, setData] = useState<OperatorContext | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const token = getToken()
    setData(null)
    setError(null)
    if (!token) { setError(errorMessage(new ApiError(401, null))); return }
    fetchOperatorContext(token, appId)
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => { if (!cancelled) setError(errorMessage(e)) })
    return () => { cancelled = true }
  }, [appId, getToken])

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2 flex-wrap">
        <h2 className="display-font text-lg font-bold text-[var(--ink)]">{appName ?? appId} — Operator view</h2>
        <span className="rounded-full border border-[var(--line-strong)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">Owner only</span>
      </header>

      {error && <p role="alert" className="text-sm text-[var(--error)]">{error}</p>}
      {!error && !data && <p className="text-sm text-[var(--muted)]">Loading...</p>}

      {data && (
        <>
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="display-font text-base font-bold text-[var(--ink)]">Overview</h3>
              <span className="text-xs text-[var(--muted)]">Last {data.baseline.activity.days} days · signed in as {data.operator.login}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Kpi label="Users with roles" value={formatNumber(data.baseline.usersWithRoles)} />
              <Kpi label="Active users" value={formatNumber(data.baseline.activity.activeUsers)} />
              <Kpi label="Session time" value={formatDuration(data.baseline.activity.sessionSeconds)} />
              <Kpi label="API calls" value={formatNumber(data.baseline.activity.apiCalls)} />
            </div>
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {UPCOMING.map((p) => (
              <section key={p.title} className="rounded-2xl border border-dashed border-[var(--line-strong)] p-5">
                <h3 className="text-sm font-semibold text-[var(--ink)]">{p.title}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">{p.body}</p>
                <p className="mt-2 text-xs text-[var(--muted)]">Not available yet.</p>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
