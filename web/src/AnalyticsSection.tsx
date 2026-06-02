/**
 * Analytics section for AppDetail — visitor stats + BYO tag config.
 * Split out of AppDetailSections.tsx.
 */
import { useState, useEffect, useMemo } from "react"
import {
  fetchAnalyticsConfig,
  fetchAnalyticsDiagnostics,
  fetchAnalyticsEvents,
  fetchAnalyticsLive,
  fetchAnalyticsStats,
  updateAnalyticsConfig,
  formatViewCount,
  type AnalyticsConfig,
  type AnalyticsStats,
  type DiagnosticsResponse,
  type EventKindSummary,
  type LiveResponse,
} from "./analytics"
import { Kpi, UsageSkeleton, type SaveState } from "./AppDetailSections"

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
        <p className="text-sm text-[var(--error)]">Couldn't load analytics. {statsError}</p>
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

/**
 * Lists custom event kinds (anything except 'pageview') sorted by count.
 * Empty state explains how to fire one — most creators don't realise the
 * SDK exposes window.pasAnalytics.event() until they're told.
 */
function CustomEventsPanel({
  events,
  days,
  onPickKind,
}: {
  events: EventKindSummary[]
  days: number
  onPickKind: (kind: string) => void
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
        Custom events
      </h4>
      {events.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">
          No custom events fired in the last {days} days. Fire one from your app code:
          <code className="block mt-1 px-2 py-1 bg-[var(--panel)] rounded text-[10px] font-mono">
            window.pasAnalytics.event('purchase', {`{ amount: 999 }`})
          </code>
        </p>
      ) : (
        <ul className="space-y-1">
          {events.map((e) => (
            <li key={e.kind}>
              <button type="button"
                onClick={() => onPickKind(e.kind)}
                className="w-full text-left rounded px-2 py-1.5 hover:bg-[var(--panel)] transition-colors flex items-baseline justify-between"
              >
                <span className="font-mono text-sm text-[var(--ink)]">{e.kind}</span>
                <span className="text-xs text-[var(--muted)] tabular-nums">{formatViewCount(e.count)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AnalyticsBody({
  stats,
  days,
  kind = 'pageview',
  bucket = 'day',
  appId,
  getToken,
  activePath = '',
  onPickPath,
}: {
  stats: AnalyticsStats
  days: number
  kind?: string
  bucket?: 'hour' | 'day'
  appId: string
  getToken: () => string | null
  activePath?: string
  onPickPath?: (path: string) => void
}) {
  const isCustom = kind !== 'pageview'
  const isPathFiltered = activePath !== ''
  const noun = isCustom ? `${kind} events` : 'page views'
  const windowLabel = days === 1 ? 'in the last 24h' : `in the last ${days} days`
  if (stats.total_views === 0) {
    return (
      <DiagnosticsHint
        appId={appId}
        getToken={getToken}
        noun={noun}
        windowLabel={windowLabel}
        isCustom={isCustom}
        kind={kind}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi
          label={`${isCustom ? noun : 'Page views'} (${days === 1 ? '24h' : `${days}d`})`}
          value={formatViewCount(stats.total_views)}
        />
        <Kpi label={isCustom ? 'Unique paths fired on' : 'Unique paths'} value={String(stats.unique_paths)} />
        <Kpi label="Top country" value={stats.top_countries[0]?.country || '—'} />
      </div>

      <DailyViewsChart series={stats.series} bucket={bucket} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Top pages: hidden when we're already filtered to one path (the
            list would just be the active path with itself). Each row is a
            button that drills into that path when there's an onPickPath
            handler — turns the dashboard from "look at numbers" into
            "click into the hot page to see its referrers + chart." */}
        {!isPathFiltered && (
          <RankedList
            title={isCustom ? 'Top pages firing event' : 'Top pages'}
            rows={stats.top_paths.map((r) => ({ label: r.path || '/', value: r.views }))}
            onPick={!isCustom && onPickPath ? (label) => onPickPath(label) : undefined}
          />
        )}
        <RankedList title="Top referrers" rows={stats.top_referrers.map((r) => ({ label: r.referrer || '(direct)', value: r.views }))} />
        <RankedList title="Top countries" rows={stats.top_countries.map((r) => ({ label: r.country || '—', value: r.views }))} />
        <RankedList title="Device" rows={stats.device_split.map((r) => ({ label: r.device, value: r.views }))} />
      </div>
    </div>
  )
}

/**
 * Live view: polls /v1/apps/:id/analytics/live every 30s and shows a
 * pulsing "X right now" counter + the hottest paths in the last 5 minutes.
 * Renders nothing while loading the first response so we don't flash 0 →
 * real-count on every navigation.
 */
/**
 * Smart empty-state. When `total_views == 0`, we fetch /analytics/diagnostics
 * and render a hint based on the *worst still-actionable* cause. The default
 * "no data yet :)" is a UX dead-end; this turns the empty state into a
 * checklist that tells the creator exactly what to do next.
 *
 * Three rendered shapes, by verdict:
 *   - no_dataset_binding | no_stats_query: platform-side config missing.
 *     Render the deploy checklist; the creator can't fix this, but at least
 *     they know it isn't their app's fault.
 *   - never_seen_event: dataset is bound + queryable, but no event has ever
 *     been written for this app. Most likely the loader script isn't in the
 *     app's HTML. Render the loader URL + a "paste this into <head>" snippet.
 *   - silent_24h: events have been written before but nothing in 24h. App
 *     might be deployed but offline / domain misconfigured / 100% bot
 *     traffic getting dropped server-side.
 *
 * If the diagnostics endpoint itself errors (eg 503 because dataset binding
 * isn't there yet), fall back to the simple "no data yet" message.
 */
function DiagnosticsHint({
  appId,
  getToken,
  noun,
  windowLabel,
  isCustom,
  kind,
}: {
  appId: string
  getToken: () => string | null
  noun: string
  windowLabel: string
  isCustom: boolean
  kind: string
}) {
  const [diag, setDiag] = useState<DiagnosticsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const token = getToken()
    if (!token) return
    fetchAnalyticsDiagnostics(token, appId)
      .then((r) => { if (!cancelled) setDiag(r) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [appId, getToken])

  // Diagnostics still loading or unavailable — render the simple message.
  if (!diag) {
    return (
      <div className="py-6 text-center space-y-2">
        <p className="text-sm text-[var(--muted)]">
          No {noun} {windowLabel}.{' '}
          {isCustom
            ? `Once your app calls window.pasAnalytics.event("${kind}", ...) and a visitor triggers it, the counts will appear here.`
            : 'Once visitors land on your app, the chart will fill in.'}
        </p>
        {error && (
          <p className="text-xs text-[var(--muted)]">
            (Diagnostics unavailable — usually means the analytics dataset isn't wired in the backend yet.)
          </p>
        )}
      </div>
    )
  }

  if (diag.verdict === 'ok') {
    // Verdict says ok but total_views is 0 — happens when we're viewing a
    // custom-event kind that nobody's fired. Just say so.
    return (
      <p className="text-sm text-[var(--muted)] py-6 text-center">
        No {noun} {windowLabel}.{' '}
        {isCustom
          ? `Once your app calls window.pasAnalytics.event("${kind}", ...) and a visitor triggers it, the counts will appear here.`
          : 'Once visitors land on your app, the chart will fill in.'}
      </p>
    )
  }

  return (
    <div className="py-4 space-y-3">
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <h4 className="text-sm font-semibold text-[var(--ink)] mb-2">
          No {noun} {windowLabel}. Here's why:
        </h4>
        <DiagnosticsBody diag={diag} />
      </div>
    </div>
  )
}

function DiagnosticsBody({ diag }: { diag: DiagnosticsResponse }) {
  const Step = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <li className="flex items-start gap-2 text-sm">
      <span
        aria-label={ok ? 'pass' : 'fail'}
        className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          ok ? 'bg-[var(--success)]/15 text-[var(--success)]' : 'bg-[var(--error)]/15 text-[var(--error)]'
        }`}
      >
        {ok ? '✓' : '✕'}
      </span>
      <span className="text-[var(--ink)]">{children}</span>
    </li>
  )

  if (diag.verdict === 'no_dataset_binding') {
    return (
      <div className="space-y-2">
        <ul className="space-y-1.5">
          <Step ok={diag.checks.dataset_bound}>
            Workers Analytics Engine dataset bound on the backend Worker.
          </Step>
          <Step ok={diag.checks.stats_queryable}>
            CF Analytics SQL API credentials present.
          </Step>
        </ul>
        <p className="text-xs text-[var(--muted)] pt-1">
          Platform-side config — the dashboard can't show numbers until the
          dataset binding is added to <code className="font-mono">wrangler.toml</code>.
          See <code className="font-mono">ANALYTICS-GO-LIVE.md</code> step 3.
        </p>
      </div>
    )
  }

  if (diag.verdict === 'no_stats_query') {
    return (
      <div className="space-y-2">
        <ul className="space-y-1.5">
          <Step ok={true}>Workers Analytics Engine dataset bound.</Step>
          <Step ok={false}>
            CF Analytics SQL API credentials missing — set <code className="font-mono">CF_ACCOUNT_ID</code> + <code className="font-mono">CF_ANALYTICS_API_TOKEN</code> as worker secrets.
          </Step>
        </ul>
      </div>
    )
  }

  if (diag.verdict === 'never_seen_event') {
    return (
      <div className="space-y-3">
        <ul className="space-y-1.5">
          <Step ok={true}>Backend wired (dataset bound + queryable).</Step>
          <Step ok={false}>
            No event has ever been recorded for this app — the loader script is probably missing from your HTML.
          </Step>
        </ul>
        <p className="text-xs text-[var(--muted)]">Paste this into <code className="font-mono">web/index.html</code> &lt;head&gt;:</p>
        <pre className="text-xs font-mono bg-[var(--panel)] p-2 rounded overflow-x-auto">
{`<script src="${diag.loader_url}" defer></script>`}
        </pre>
      </div>
    )
  }

  if (diag.verdict === 'silent_24h') {
    return (
      <div className="space-y-2">
        <ul className="space-y-1.5">
          <Step ok={true}>Loader has fired before (events recorded historically).</Step>
          <Step ok={false}>No events in the last 24 hours.</Step>
        </ul>
        <p className="text-xs text-[var(--muted)]">
          Either the app has no traffic right now, or the loader broke. Open
          your app and check the browser console; or hit the loader URL directly:{' '}
          <a className="font-mono underline" href={diag.loader_url} target="_blank" rel="noreferrer">
            {diag.loader_url}
          </a>
        </p>
      </div>
    )
  }

  return null
}

function LiveView({ appId, getToken }: { appId: string; getToken: () => string | null }) {
  const [data, setData] = useState<LiveResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const tick = () => {
      const token = getToken()
      if (!token) return
      fetchAnalyticsLive(token, appId)
        .then((r) => {
          if (!cancelled) {
            setData(r)
            setError(null)
          }
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message)
        })
    }
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [appId, getToken])

  if (error && !data) return null // silent if live endpoint isn't deployed yet
  if (!data) return null

  return (
    <div className="mt-5 flex items-center gap-3 rounded-xl bg-[var(--panel)] border border-[var(--line)] px-4 py-2">
      <span className="relative inline-flex h-2.5 w-2.5">
        <span
          className={`absolute inline-flex h-full w-full rounded-full bg-[var(--success)] ${data.views > 0 ? 'animate-ping opacity-60' : 'opacity-30'}`}
        />
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${data.views > 0 ? 'bg-[var(--success)]' : 'bg-[var(--muted)]'}`}
        />
      </span>
      <div className="text-sm">
        <span className="font-bold text-[var(--ink)] tabular-nums">{formatViewCount(data.views)}</span>{' '}
        <span className="text-[var(--muted)]">page view{data.views === 1 ? '' : 's'} in the last 5 min</span>
        {data.top_paths.length > 0 && (
          <>
            {' · hot now: '}
            {data.top_paths.slice(0, 3).map((p, i) => (
              <span key={p.path}>
                {i > 0 && ', '}
                <span className="font-mono text-xs">{p.path || '/'}</span>
                <span className="text-[var(--muted)] text-xs">{` (${p.views})`}</span>
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function DailyViewsChart({
  series,
  bucket,
}: {
  series: AnalyticsStats['series']
  bucket: 'hour' | 'day'
}) {
  const { bars, maxViews } = useMemo(() => {
    const vs = series.map((d) => d.views)
    return { bars: vs, maxViews: Math.max(1, ...vs) }
  }, [series])

  if (series.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        No {bucket === 'hour' ? 'hourly' : 'daily'} data in this window.
      </p>
    )
  }

  // For hour buckets the `t` looks like "2026-05-21 14:00:00"; show just
  // "14:00". For day buckets it's "2026-05-21"; show "05-21".
  const labelFor = (t: string): string => {
    if (bucket === 'hour') return t.slice(11, 16) || t
    return t.slice(5, 10) || t
  }

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
        aria-label={`${bucket === 'hour' ? 'Hourly' : 'Daily'} page views (${series.length} ${bucket}s)`}
        className="w-full h-32 block"
      >
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="currentColor" strokeOpacity="0.15" />
        {bars.map((v, i) => {
          const h = (v / maxViews) * (H - 2)
          return (
            <rect
              key={i}
              x={i * slot}
              y={H - h}
              width={barW}
              height={h}
              fill="var(--accent)"
              opacity={v > 0 ? 0.85 : 0.2}
            >
              <title>{`${series[i].t}: ${v} view${v === 1 ? '' : 's'}`}</title>
            </rect>
          )
        })}
      </svg>
      <div className="flex justify-between mt-1 text-[10px] text-[var(--muted)]">
        <span>{labelFor(series[0]?.t ?? '')}</span>
        <span>peak {maxViews}</span>
        <span>{labelFor(series[series.length - 1]?.t ?? '')}</span>
      </div>
    </div>
  )
}

function RankedList({
  title,
  rows,
  onPick,
}: {
  title: string
  rows: Array<{ label: string; value: number }>
  /** When provided, each row becomes a button that calls onPick(label).
   *  Used by the Top pages list to drill into a specific path. */
  onPick?: (label: string) => void
}) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  const renderRow = (r: { label: string; value: number }, i: number) => {
    const inner = (
      <>
        <div className="flex justify-between mb-0.5">
          <span className="text-[var(--ink)] truncate">{r.label}</span>
          <span className="text-[var(--muted)] tabular-nums">{formatViewCount(r.value)}</span>
        </div>
        <div className="h-1 bg-[var(--line)] rounded overflow-hidden">
          <div className="h-1 bg-[var(--accent)]" style={{ width: `${(r.value / max) * 100}%` }} />
        </div>
      </>
    )
    return (
      <li key={i} className="text-xs">
        {onPick ? (
          <button type="button"
            onClick={() => onPick(r.label)}
            className="w-full text-left rounded px-1.5 py-1 -mx-1.5 hover:bg-[var(--panel)] transition-colors"
            title={`Drill into ${r.label}`}
          >
            {inner}
          </button>
        ) : (
          inner
        )}
      </li>
    )
  }
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
        {title}
      </h4>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">No data.</p>
      ) : (
        <ul className="space-y-1">{rows.slice(0, 5).map(renderRow)}</ul>
      )}
    </div>
  )
}

function AnalyticsConfigForm({
  appId,
  config,
  onSaved,
  getToken,
}: {
  appId: string
  config: AnalyticsConfig | null
  onSaved: (c: AnalyticsConfig) => void
  getToken: () => string | null
}) {
  const [ga4, setGa4] = useState(config?.ga4 ?? '')
  const [plausible, setPlausible] = useState(config?.plausible ?? '')
  const [customHead, setCustomHead] = useState(config?.customHead ?? '')
  const [state, setState] = useState<SaveState>('idle')

  useEffect(() => {
    setGa4(config?.ga4 ?? '')
    setPlausible(config?.plausible ?? '')
    setCustomHead(config?.customHead ?? '')
  }, [config])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = getToken()
    if (!token) return
    setState('saving')
    try {
      const fresh = await updateAnalyticsConfig(token, appId, {
        ga4: ga4.trim() || null,
        plausible: plausible.trim() || null,
        custom_head: customHead.trim() || null,
      })
      onSaved(fresh)
      setState('saved')
      setTimeout(() => setState('idle'), 2000)
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : 'failed' })
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
        Add your own tags (optional)
      </h4>
      <p className="text-xs text-[var(--muted)]">
        Wire Google Analytics, Plausible, or a custom &lt;head&gt; snippet on top of the
        cookieless first-party tracking already in place. The platform CF Web Analytics token
        {config?.cfBeaconToken ? ' is active' : ' will be auto-provisioned at next publish'}.
      </p>
      <label className="block">
        <span className="text-xs text-[var(--muted)]">Google Analytics 4 ID</span>
        <input
          type="text"
          placeholder="G-XXXXXXXXXX"
          value={ga4}
          onChange={(e) => setGa4(e.target.value)}
          className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] placeholder-[var(--muted)]"
        />
      </label>
      <label className="block">
        <span className="text-xs text-[var(--muted)]">Plausible domain</span>
        <input
          type="text"
          placeholder="mysite.com"
          value={plausible}
          onChange={(e) => setPlausible(e.target.value)}
          className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] placeholder-[var(--muted)]"
        />
      </label>
      <label className="block">
        <span className="text-xs text-[var(--muted)]">Custom &lt;head&gt; snippet (max 4 KB)</span>
        <textarea
          rows={3}
          placeholder='<meta name="custom" content="..." />'
          value={customHead}
          onChange={(e) => setCustomHead(e.target.value)}
          className="mt-1 w-full px-3 py-2 font-mono text-xs rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] placeholder-[var(--muted)]"
        />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit"
          disabled={state === 'saving'}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--accent)] text-[var(--paper)] disabled:opacity-50"
        >
          {state === 'saving' ? 'Saving…' : 'Save analytics tags'}
        </button>
        {state === 'saved' && <span className="text-xs text-[var(--success)]">Saved.</span>}
        {typeof state === 'object' && state.error && (
          <span className="text-xs text-[var(--error)]">{state.error}</span>
        )}
      </div>
    </form>
  )
}
