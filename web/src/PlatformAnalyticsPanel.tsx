import { useState, useEffect } from 'react'
import {
  fetchPlatformAnalytics,
  formatViewCount,
  type PlatformAnalyticsResponse,
} from './analytics'

// ---------------------------------------------------------------------------
// PlatformAnalyticsPanel — cross-app aggregate. Admin-only by virtue of the
// backend gating (the endpoint 403s for non-admins). We still gracefully
// hide the panel if the fetch fails so a 503-during-deploy doesn't break
// the rest of the admin view.
// ---------------------------------------------------------------------------

export function PlatformAnalyticsPanel({ getToken }: { getToken: () => string | null }) {
  const [data, setData] = useState<PlatformAnalyticsResponse | null>(null)
  const [days, setDays] = useState<1 | 7 | 30 | 90>(7)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const token = getToken()
    if (!token) return
    setLoading(true)
    setError(null)
    fetchPlatformAnalytics(token, days)
      .then((r) => { if (!cancelled) setData(r) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [getToken, days])

  // Hide the entire panel if the endpoint isn't responding — the rest of
  // the admin view (submissions queue) is more critical and shouldn't be
  // overshadowed by a noisy error here.
  if (error && !data) return null

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h2 className="display-font text-xl font-bold text-[var(--ink)]">Platform totals</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Aggregated across every app on this backend. Cookieless, no PII.
          </p>
        </div>
        <div className="flex gap-1 text-xs">
          {[1, 7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d as 1 | 7 | 30 | 90)}
              className={`px-2 py-1 rounded ${days === d ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading && !data && (
        <div className="grid grid-cols-3 gap-3">
          <div className="h-20 rounded-xl border border-[var(--line)] bg-[var(--panel)] animate-pulse" />
          <div className="h-20 rounded-xl border border-[var(--line)] bg-[var(--panel)] animate-pulse" />
          <div className="h-20 rounded-xl border border-[var(--line)] bg-[var(--panel)] animate-pulse" />
        </div>
      )}

      {data && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <PlatformKpi label={`Page views (${days === 1 ? '24h' : `${days}d`})`} value={formatViewCount(data.total_views)} />
            <PlatformKpi label="Active apps" value={String(data.active_apps)} />
            <PlatformKpi label="Custom events" value={formatViewCount(data.custom_events)} />
          </div>

          <PlatformSeriesChart series={data.series} bucket={data.bucket} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PlatformRankedList
              title="Top apps"
              rows={data.top_apps.map((r) => ({ label: r.app, value: r.views }))}
              monospace
            />
            <PlatformRankedList
              title="Top countries"
              rows={data.top_countries.map((r) => ({ label: r.country || '—', value: r.views }))}
            />
          </div>
        </div>
      )}
    </section>
  )
}

function PlatformKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">{label}</p>
      <p className="mt-1 display-font text-2xl font-bold text-[var(--ink)]">{value}</p>
    </div>
  )
}

function PlatformSeriesChart({
  series,
  bucket,
}: {
  series: PlatformAnalyticsResponse['series']
  bucket: 'hour' | 'day'
}) {
  if (series.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        No {bucket === 'hour' ? 'hourly' : 'daily'} platform data in this window.
      </p>
    )
  }
  const W = 600
  const H = 100
  const gap = 2
  const slot = W / series.length
  const barW = Math.max(1, slot - gap)
  const maxV = Math.max(1, ...series.map((d) => d.views))
  const labelFor = (t: string) =>
    bucket === 'hour' ? t.slice(11, 16) || t : t.slice(5, 10) || t
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Platform-wide ${bucket}ly page views`}
        className="w-full h-24 block"
      >
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="currentColor" strokeOpacity="0.15" />
        {series.map((d, i) => {
          const h = (d.views / maxV) * (H - 2)
          return (
            <rect
              key={d.t}
              x={i * slot}
              y={H - h}
              width={barW}
              height={h}
              fill="var(--accent)"
              opacity={d.views > 0 ? 0.85 : 0.2}
            >
              <title>{`${d.t}: ${d.views} view${d.views === 1 ? '' : 's'}`}</title>
            </rect>
          )
        })}
      </svg>
      <div className="flex justify-between mt-1 text-[10px] text-[var(--muted)]">
        <span>{labelFor(series[0]?.t ?? '')}</span>
        <span>peak {maxV}</span>
        <span>{labelFor(series[series.length - 1]?.t ?? '')}</span>
      </div>
    </div>
  )
}

function PlatformRankedList({
  title,
  rows,
  monospace,
}: {
  title: string
  rows: Array<{ label: string; value: number }>
  monospace?: boolean
}) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
        {title}
      </h4>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">No data.</p>
      ) : (
        <ul className="space-y-1">
          {rows.slice(0, 10).map((r) => (
            <li key={r.label} className="text-xs">
              <div className="flex justify-between mb-0.5">
                <span className={`text-[var(--ink)] truncate ${monospace ? 'font-mono' : ''}`}>{r.label}</span>
                <span className="text-[var(--muted)] tabular-nums">{formatViewCount(r.value)}</span>
              </div>
              <div className="h-1 bg-[var(--line)] rounded overflow-hidden">
                <div className="h-1 bg-[var(--accent)]" style={{ width: `${(r.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
