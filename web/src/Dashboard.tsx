// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

import { useState, useEffect } from 'react'
import type { User, Subscription } from '@proappstore/sdk'
import { pro } from './sdk'
import type { AppEntry } from './nav'
import { fetchOwnerSummary, formatNumber, type OwnerSummary } from './usage'
import { PlanBadge, StatCard, AppStatusBadge } from './dashboardShared'

export function Dashboard({
  user, apps, onOpenApp, onPublishNew, onNewApp,
}: {
  user: User
  apps: AppEntry[]
  onOpenApp: (id: string, tab?: 'overview' | 'agents') => void
  onPublishNew: () => void
  onNewApp: () => void
}) {
  const [sub, setSub] = useState<Subscription | null>(null)
  const [summary, setSummary] = useState<OwnerSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      pro.subscription.status().catch(() => null),
      fetchOwnerSummary(pro.auth.token, 30),
    ])
      .then(([s, sum]) => {
        if (cancelled) return
        setSub(s)
        setSummary(sum)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <p className="text-[var(--muted)] py-12 text-center">Loading dashboard...</p>
  }

  return (
    <div className="space-y-8">
      {/* Welcome card */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-4">
          {user.avatarUrl && (
            <img src={user.avatarUrl} alt="" className="h-14 w-14 rounded-full ring-2 ring-[var(--line-strong)]" />
          )}
          <div>
            <h2 className="display-font text-2xl font-bold text-[var(--ink)]">
              Welcome, {user.login}
            </h2>
            <div className="mt-1 flex items-center gap-2">
              <PlanBadge sub={sub} />
            </div>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Apps" value={apps.length} />
        <StatCard
          label="Active 30d"
          value={summary ? formatNumber(summary.activeUsers) : '—'}
        />
        <StatCard label="Plan" value={sub?.status === 'active' ? 'Pro' : 'Free'} />
      </div>

      {/* Apps list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="display-font text-xl font-bold text-[var(--ink)]">Your Apps</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPublishNew}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]"
            >
              Publish existing
            </button>
            <button
              type="button"
              onClick={onNewApp}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              + New app
            </button>
          </div>
        </div>

        {apps.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line-strong)] p-12 text-center">
            <p className="text-[var(--muted)]">
              No apps yet.{' '}
              <button type="button" onClick={onNewApp} className="text-[var(--accent)] font-semibold underline">
                Create your first app
              </button>{' '}
              — your agent team builds it.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {apps.map((a) => (
              <button
                key={a.id}
                onClick={() => onOpenApp(a.id, 'agents')}
                className="text-left rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 hover:bg-[var(--panel-hover)] shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--ink)] truncate">{a.name}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {a.published === false && (
                      <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Building</span>
                    )}
                    {a.published !== false && a.hasAgentTeam && (
                      <span className="rounded-full border border-[var(--line-strong)] text-[var(--muted)] px-2 py-0.5 text-[10px] font-semibold">Agents</span>
                    )}
                    <AppStatusBadge submissionStatus={a.submissionStatus} hasSubmission={a.hasSubmission} />
                  </div>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)] font-mono">{a.id}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {a.published === false ? 'In progress · ' : ''}Created {new Date(a.createdAt).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
