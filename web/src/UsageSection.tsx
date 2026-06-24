/**
 * Usage — read-only analytics section. Wired to GET /v1/apps/:id/usage?days=30.
 * Extracted from AppDetailSections.tsx.
 */

import { useState, useEffect, useMemo } from 'react'
import {
  fetchAppUsage,
  formatNumber,
  formatDuration,
  dayOfWeekLabel,
  type UsageResponse,
} from './usage'
import { Kpi } from './sectionPrimitives'

export function UsageSection({ appId, getToken }: { appId: string; getToken: () => string | null }) {
  const [data, setData] = useState<UsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const token = getToken()
    if (!token) {
      setLoading(false)
      setError('Not signed in.')
      return
    }
    setLoading(true)
    setError(null)
    fetchAppUsage(token, appId, 30)
      .then((u) => { if (!cancelled) setData(u) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [appId, getToken])

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="display-font text-lg font-bold text-[var(--ink)]">Usage</h3>
        <span className="text-xs text-[var(--muted)]">Last 30 days</span>
      </div>
      <p className="text-sm text-[var(--muted)] mb-4">
        How subscribers are using your app. Updated daily.
      </p>

      {loading && <UsageSkeleton />}

      {!loading && error && (
        <p className="text-sm text-[var(--error)]">Couldn't load usage. {error}</p>
      )}

      {!loading && !error && data && <UsageBody data={data} />}
    </section>
  )
}

function UsageBody({ data }: { data: UsageResponse }) {
  // Defend against an empty/partial response ({} for a brand-new app) so the
  // tab shows the empty state instead of white-screening.
  const series = data.series ?? []
  const totals = data.totals ?? { users: 0, sessionSeconds: 0, apiCalls: 0 }
  const hasAnyActivity =
    totals.users > 0 || totals.sessionSeconds > 0 || totals.apiCalls > 0

  if (!hasAnyActivity) {
    return (
      <p className="text-sm text-[var(--muted)] py-6 text-center">
        No usage data yet. Once your app is being used by subscribers, daily
        activity will appear here.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi label="Active users" value={formatNumber(totals.users)} />
        <Kpi label="Session time" value={formatDuration(totals.sessionSeconds)} />
        <Kpi label="API calls" value={formatNumber(totals.apiCalls)} />
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
            Daily session minutes
          </h4>
        </div>
        <SessionMinutesChart series={series} />
      </div>

      <div>
        <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Last 7 days · active users
        </h4>
        <WeekStrip series={series} />
      </div>
    </div>
  )
}

function SessionMinutesChart({ series }: { series: UsageResponse['series'] }) {
  // Render bars in a viewBox so they scale to the section's width.
  const { bars, maxMinutes } = useMemo(() => {
    const minutes = series.map((d) => Math.round(d.sessionSeconds / 60))
    const peak = Math.max(1, ...minutes)
    return { bars: minutes, maxMinutes: peak }
  }, [series])

  if (series.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">No daily data in this window.</p>
    )
  }

  // Use a fixed viewBox; bars sit on a baseline at viewBox y = H.
  const W = 600
  const H = 120
  const gap = 2
  const slot = W / series.length
  const barW = Math.max(1, slot - gap)

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Daily session minutes for the last 30 days"
        className="w-full h-32 block"
      >
        {/* Faint baseline */}
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="currentColor" strokeOpacity="0.15" />
        {bars.map((m, i) => {
          const h = (m / maxMinutes) * (H - 4)
          const x = i * slot + gap / 2
          const y = H - h
          const day = series[i]!.day
          return (
            <rect
              key={day}
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={1}
              className="fill-[var(--accent)]"
            >
              <title>{`${day}: ${formatNumber(m)} min · ${formatNumber(series[i]!.users)} users`}</title>
            </rect>
          )
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--muted)] font-mono">
        <span>{series[0]?.day}</span>
        <span>peak {formatNumber(maxMinutes)} min/day</span>
        <span>{series[series.length - 1]?.day}</span>
      </div>
    </div>
  )
}

function WeekStrip({ series }: { series: UsageResponse['series'] }) {
  const last7 = series.slice(-7)
  if (last7.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No recent days.</p>
  }
  return (
    <div className="grid grid-cols-7 gap-2">
      {last7.map((d) => (
        <div
          key={d.day}
          className="rounded-lg border border-[var(--line)] bg-[var(--panel)] py-2 text-center"
          title={`${d.day}: ${formatNumber(d.users)} active users`}
        >
          <div className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide">
            {dayOfWeekLabel(d.day)}
          </div>
          <div className="display-font text-lg font-bold text-[var(--ink)] leading-tight">
            {formatNumber(d.users)}
          </div>
        </div>
      ))}
    </div>
  )
}

export function UsageSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {['a', 'b', 'c'].map((k) => (
          <div key={k} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="h-3 w-20 rounded bg-[var(--line)]" />
            <div className="mt-2 h-6 w-24 rounded bg-[var(--line)]" />
          </div>
        ))}
      </div>
      <div className="h-32 rounded-xl border border-[var(--line)] bg-[var(--panel)]" />
      <div className="grid grid-cols-7 gap-2">
        {['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => (
          <div key={d} className="h-14 rounded-lg border border-[var(--line)] bg-[var(--panel)]" />
        ))}
      </div>
    </div>
  )
}
