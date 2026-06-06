/**
 * Analytics section for AppDetail — visitor stats + BYO tag config.
 * Split out of AppDetailSections.tsx.
 */
import { useState, useEffect } from "react"
import {
  fetchAnalyticsConfig,
  fetchAnalyticsEvents,
  fetchAnalyticsStats,
  type AnalyticsConfig,
  type AnalyticsStats,
  type EventKindSummary,
} from "./analytics"
import { UsageSkeleton } from "./AppDetailSections"
import { AnalyticsBody } from "./AnalyticsBody"
import { CustomEventsPanel } from "./AnalyticsCustomEventsPanel"
import { LiveView } from "./AnalyticsLiveView"
import { AnalyticsConfigForm } from "./AnalyticsConfigForm"

// ---------------------------------------------------------------------------
// Analytics — visitor stats + BYO tag config. Pulls from the backend's
// `/analytics` (config) and `/analytics/stats` (Workers Analytics Engine
// aggregates) endpoints. Owner-only — relies on the bearer-token auth.
// ---------------------------------------------------------------------------

export function AnalyticsSection({ appId, getToken }: { appId: string; getToken: () => string | null }) {
  const [stats, setStats] = useState<AnalyticsStats | null>(null)
  const [config, setConfig] = useState<AnalyticsConfig | null>(null)
  // Active event kind being graphed. 'pageview' is the default; clicking a
  // custom-event row in the panel below swaps it. Switching kind reuses the
  // same stats query + body component — one less thing to maintain.
  const [kind, setKind] = useState<string>('pageview')
  // Active path drill-down. Empty string means "no filter" (aggregate view);
  // clicking a row in the Top pages list sets this to that path. The whole
  // dashboard then re-renders narrowed to that single page.
  const [path, setPath] = useState<string>('')
  const [events, setEvents] = useState<EventKindSummary[]>([])
  const [days, setDays] = useState<1 | 7 | 30 | 90>(7)
  // Server defaults the bucket — `hour` when days=1, `day` otherwise. The
  // response tells us which it used so the chart labels match.
  const [bucket, setBucket] = useState<'hour' | 'day'>('day')
  const [loading, setLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const token = getToken()
    if (!token) return
    setLoading(true)
    setStatsError(null)
    Promise.all([
      fetchAnalyticsStats(token, appId, days, kind, undefined, path || undefined),
      fetchAnalyticsConfig(token, appId),
      fetchAnalyticsEvents(token, appId, days).then((r) => r.events).catch(() => [] as EventKindSummary[]),
    ])
      .then(([statsRes, c, ev]) => {
        if (!cancelled) {
          setStats(statsRes.stats)
          setBucket(statsRes.bucket)
          setConfig(c)
          setEvents(ev)
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setStatsError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [appId, getToken, days, kind, path])

  const isCustomKind = kind !== 'pageview'
  const isPathFiltered = path !== ''

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="display-font text-lg font-bold text-[var(--ink)]">
          {isPathFiltered ? (
            <>
              Path:{' '}
              <span className="font-mono text-base">{path}</span>{' '}
              <button type="button"
                onClick={() => setPath('')}
                className="text-xs font-normal text-[var(--muted)] hover:text-[var(--ink)] underline ml-1"
              >
                ← back to all pages
              </button>
            </>
          ) : isCustomKind ? (
            <>
              Event:{' '}
              <span className="font-mono text-base">{kind}</span>{' '}
              <button type="button"
                onClick={() => setKind('pageview')}
                className="text-xs font-normal text-[var(--muted)] hover:text-[var(--ink)] underline ml-1"
              >
                ← back to pageviews
              </button>
            </>
          ) : (
            'Visitor analytics'
          )}
        </h3>
        <div className="flex gap-1 text-xs">
          {[1, 7, 30, 90].map((d) => (
            <button type="button"
              key={d}
              onClick={() => setDays(d as 1 | 7 | 30 | 90)}
              className={`px-2 py-1 rounded ${days === d ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-[var(--muted)] mb-4">
        {isPathFiltered
          ? `Pageviews on ${path} only. Click "back to all pages" to widen.`
          : isCustomKind
            ? `Custom event tracked from app code via window.pasAnalytics.event("${kind}", ...).`
            : 'First-party page-view stats powered by Workers Analytics Engine. Cookieless, no PII.'}
      </p>

      {loading && <UsageSkeleton />}
      {!loading && statsError && (
        statsError.includes('not configured') || statsError.includes('503')
          ? <p className="text-sm text-[var(--muted)]">Analytics not yet configured for this project. Stats will appear here after the platform admin enables the analytics integration.</p>
          : <p className="text-sm text-[var(--error)]">Couldn't load analytics. {statsError}</p>
      )}
      {!loading && !statsError && stats && (
        <AnalyticsBody
          stats={stats}
          days={days}
          kind={kind}
          bucket={bucket}
          appId={appId}
          getToken={getToken}
          activePath={path}
          onPickPath={(p) => setPath(p)}
        />
      )}

      <LiveView appId={appId} getToken={getToken} />

      {!loading && !statsError && !isCustomKind && (
        <div className="mt-6 pt-6 border-t border-[var(--line)]">
          <CustomEventsPanel events={events} days={days} onPickKind={setKind} />
        </div>
      )}

      <div className="mt-6 pt-6 border-t border-[var(--line)]">
        <AnalyticsConfigForm
          appId={appId}
          config={config}
          onSaved={setConfig}
          getToken={getToken}
        />
      </div>
    </section>
  )
}
