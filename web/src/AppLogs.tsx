import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ApiError } from './api'
import {
  fetchAppLogGroups, fetchAppLogs, fetchLatestBuild, fetchTelemetryHealth, fetchTraceTimeline,
  type AppLog, type AppLogFilters, type AppLogGroup, type LogContext, type SourceFrame,
  type SymbolicationStatus, type TelemetryHealth, type TraceTimeline,
} from './appLogsApi'
import { Kpi } from './sectionPrimitives'

interface Props {
  appId: string
  getToken: () => string | null
}

type Range = '1h' | '24h' | '7d' | '30d'
const HOUR = 60 * 60 * 1000
const rangeMs: Record<Range, number> = { '1h': HOUR, '24h': 24 * HOUR, '7d': 7 * 24 * HOUR, '30d': 30 * 24 * HOUR }
/** Windows for the summary cards. */
const SUMMARY_WINDOWS: { label: string; ms: number }[] = [{ label: '1h', ms: HOUR }, { label: '24h', ms: 24 * HOUR }, { label: '7d', ms: 7 * 24 * HOUR }]

const blankFilters = (): AppLogFilters => ({ level: '', category: '', phase: '', clientId: '', userId: '', fingerprint: '', source: '', traceId: '' })
/** The tab opens on errors; Clear shows every level. The API filters one level at a time. */
const initialFilters = (): AppLogFilters => ({ ...blankFilters(), level: 'error' })

/** Keys whose values may identify or authenticate someone: never shown, whatever their value. */
const HIDDEN_KEY = /pass|token|secret|email|phone|ssn|key|cookie|auth|session|body|address|birth|dob|name/i

/**
 * The fields of a log's `data` (or `build`) that are safe to show: top-level
 * scalars only, never a sensitive-looking key, every value through safeLogText.
 * Nested objects and arrays are counted, not rendered.
 */
export function safeFields(value: unknown): { fields: [string, string][]; hidden: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { fields: [], hidden: 0 }
  const fields: [string, string][] = []
  let hidden = 0
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (HIDDEN_KEY.test(key) || (v !== null && typeof v === 'object')) { hidden += 1; continue }
    if (typeof v === 'string') fields.push([safeLogText(key), safeLogText(v)])
    else if (typeof v === 'number' || typeof v === 'boolean') fields.push([safeLogText(key), String(v)])
  }
  return { fields, hidden }
}

interface Summary { label: string; count: number; capped: boolean; top: AppLogGroup | null }

/** Defence in depth for legacy rows: logs should be sanitized at ingestion, but
 * this viewer never renders credential-shaped content or query strings. */
export function safeLogText(value: unknown): string {
  if (typeof value !== 'string') return '—'
  return value
    // Header values can contain spaces (Basic auth) and several cookies. Hide
    // the full value rather than trying to preserve a safe-looking fragment.
    .replace(/\b(authorization|cookie|set-cookie)\s*[:=]\s*[^\r\n]*/gi, '$1: [redacted]')
    .replace(/\b(?:bearer|basic)\s+[A-Za-z0-9._~+/-]+=*/gi, '[redacted]')
    .replace(/\b(?:pas_[a-z]+|eyJ[a-zA-Z0-9_-]+)[a-zA-Z0-9._-]*/g, '[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(https?:\/\/[^\s?#]+|\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+)\?[^\s)\]}]+/g, '$1?[redacted]')
    .slice(0, 500)
}

function formatTime(value: number): string {
  return Number.isFinite(value) ? new Date(value).toLocaleString() : '—'
}

function buildLabel(build: unknown): string {
  if (!build || typeof build !== 'object') return '—'
  const row = build as Record<string, unknown>
  const candidate = row.version ?? row.sha ?? row.build
  return typeof candidate === 'string' ? safeLogText(candidate) : '—'
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has expired. Sign in again to inspect app logs.'
    if (error.status === 403) return 'App logs are available only to this app’s owner.'
    if (error.status === 429) return 'The log service is rate-limited. Wait a moment and try again.'
    return `Could not load app logs (${error.status}). Try again.`
  }
  return 'Could not reach the log service. Check your connection and try again.'
}

/** Matches the backend's own per-stack cap (MAX_FRAMES in lib/sourcemap.ts). */
const MAX_RENDERED_FRAMES = 50
const HOP_ORDER = ['browser', 'host', 'api', 'data-worker', 'app-worker'] as const
const HOP_LABEL: Record<string, string> = { browser: 'Browser', host: 'Host', api: 'API', 'data-worker': 'Data worker', 'app-worker': 'App worker' }

const SYMBOLICATION_LABEL: Record<SymbolicationStatus, string> = {
  ok: 'Mapped to source',
  missing: 'No source map for this release',
  mismatched: 'Source map does not match this release (hash mismatch)',
  unavailable: 'Source map unavailable (expired or unreachable)',
  skipped: 'Not symbolicated (per-request limit reached)',
}

function formatMs(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString()} ms` : '—'
}

/** The row's own release — never the app's newest build — so an incident always reads against the code that ran. */
function contextRows(context: LogContext | null | undefined): [string, string][] {
  if (!context) return []
  const rows: [string, string][] = []
  if (context.operation) rows.push(['Operation', safeLogText(context.operation)])
  if (context.result) rows.push(['Result', safeLogText(context.result)])
  if (context.errorCode) rows.push(['Error code', safeLogText(context.errorCode)])
  if (typeof context.durationMs === 'number') rows.push(['Duration', formatMs(context.durationMs)])
  if (context.spanId) rows.push(['Span', safeLogText(context.spanId)])
  if (context.parentSpanId) rows.push(['Parent span', safeLogText(context.parentSpanId)])
  if (context.sdkVersion) rows.push(['SDK', safeLogText(context.sdkVersion)])
  return rows
}

function frameLabel(frame: SourceFrame): string {
  const at = safeLogText(frame.source)
  const original = frame.originalSource
    ? `${safeLogText(frame.originalSource)}:${frame.originalLine ?? '?'}:${frame.originalCol ?? '?'}${frame.name ? ` (${safeLogText(frame.name)})` : ''}`
    : null
  return original ? `${at}:${frame.line}:${frame.col} → ${original}` : `${at}:${frame.line}:${frame.col}`
}

/** Defence in depth: an unexpectedly shaped health response degrades to "unavailable" rather than crashing the panel. */
function isTelemetryHealth(v: unknown): v is TelemetryHealth {
  if (!v || typeof v !== 'object') return false
  const r = v as Partial<TelemetryHealth>
  return typeof r.status === 'string' && typeof r.countsReliable === 'boolean' && !!r.alertCoverage && !!r.components && !!r.windows && !!r.requests
}

/** Defence in depth: an unexpectedly shaped incident response degrades to an error state rather than crashing the panel. */
function isTraceTimeline(v: unknown): v is TraceTimeline {
  if (!v || typeof v !== 'object') return false
  const r = v as Partial<TraceTimeline>
  return typeof r.traceId === 'string' && !!r.hops && Array.isArray(r.records)
}

function incidentGroups(logs: AppLog[]): Array<{ traceId: string; occurrences: number; latest: number }> {
  const groups = new Map<string, { occurrences: number; latest: number }>()
  for (const log of logs) {
    if (!log.traceId) continue
    const current = groups.get(log.traceId) ?? { occurrences: 0, latest: 0 }
    current.occurrences += 1
    current.latest = Math.max(current.latest, log.ts)
    groups.set(log.traceId, current)
  }
  return [...groups.entries()]
    .map(([traceId, value]) => ({ traceId, ...value }))
    .sort((a, b) => b.occurrences - a.occurrences || b.latest - a.latest)
}

export function AppLogs({ appId, getToken }: Props) {
  const [range, setRange] = useState<Range>('24h')
  const [filters, setFilters] = useState<AppLogFilters>(initialFilters)
  const [applied, setApplied] = useState<AppLogFilters>(initialFilters)
  const [logs, setLogs] = useState<AppLog[]>([])
  const [groups, setGroups] = useState<AppLogGroup[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const [selected, setSelected] = useState<AppLog | null>(null)
  const [build, setBuild] = useState<{ build: unknown; ts: number | null } | null>(null)
  const [summary, setSummary] = useState<Summary[] | null>(null)
  const overviewVersion = useRef(0)
  const [health, setHealth] = useState<TelemetryHealth | null>(null)
  const [healthUnavailable, setHealthUnavailable] = useState(false)
  const [trace, setTrace] = useState<TraceTimeline | null>(null)
  const [traceLoading, setTraceLoading] = useState(false)
  const [traceError, setTraceError] = useState<string | null>(null)
  const traceVersion = useRef(0)

  // Do not calculate this during every render: a changing timestamp would
  // change `load`, retrigger the effect, and turn a refresh into a request loop.
  const since = useMemo(() => Date.now() - rangeMs[range], [range])
  const load = useCallback(async (next: AppLogFilters, append = false) => {
    const version = ++requestVersion.current
    const token = getToken()
    if (!token) {
      setLogs([]); setGroups([]); setNextCursor(null); setLoading(false)
      setError('Sign in to inspect owner-only app logs.')
      return
    }
    if (append) setLoadingMore(true)
    else { setLoading(true); setError(null); setLogs([]); setGroups([]); setNextCursor(null); setSelected(null) }
    try {
      const effective = { ...next, since, limit: 50 }
      const [page, grouped] = await Promise.all([
        fetchAppLogs(appId, token, effective),
        append ? Promise.resolve(null) : fetchAppLogGroups(appId, token, effective),
      ])
      if (version !== requestVersion.current) return
      setLogs((previous) => append ? [...previous, ...page.logs] : page.logs)
      setNextCursor(page.nextCursor)
      if (grouped) setGroups(grouped.groups)
    } catch (e) {
      if (version !== requestVersion.current) return
      if (!append) setLogs([])
      setError(errorMessage(e))
    } finally {
      if (version !== requestVersion.current) return
      setLoading(false); setLoadingMore(false)
    }
  }, [appId, getToken, since])

  // appId is intentionally a dependency: switching projects immediately clears
  // prior rows and cannot leak stale data from another app while this fetch runs.
  useEffect(() => { void load(applied) }, [appId, range, applied, load])
  useEffect(() => () => { requestVersion.current += 1; overviewVersion.current += 1; traceVersion.current += 1 }, [])

  // Per app, not per filter: the latest build, the 1h/24h/7d warn+error counts, and
  // telemetry health. A failure here leaves the cards out; the log list reports its own errors.
  useEffect(() => {
    const version = ++overviewVersion.current
    setBuild(null); setSummary(null); setHealth(null); setHealthUnavailable(false)
    const token = getToken()
    if (!token) return
    fetchLatestBuild(appId, token).then((b) => { if (version === overviewVersion.current) setBuild(b) }, () => {})
    const now = Date.now()
    Promise.all(SUMMARY_WINDOWS.map(async (w) => {
      const { groups: g } = await fetchAppLogGroups(appId, token, { since: now - w.ms })
      return { label: w.label, count: g.reduce((n, x) => n + x.occurrences, 0), capped: g.length >= 50, top: g[0] ?? null }
    })).then((s) => { if (version === overviewVersion.current) setSummary(s) }, () => {})
    // Degrade, never throw: a stale, unreachable or unexpectedly shaped health
    // response shows an explicit "unavailable" card rather than crashing or
    // hiding telemetry health entirely.
    fetchTelemetryHealth(appId, token).then(
      (h) => { if (version === overviewVersion.current) { if (isTelemetryHealth(h)) setHealth(h); else setHealthUnavailable(true) } },
      () => { if (version === overviewVersion.current) setHealthUnavailable(true) },
    )
  }, [appId, getToken])

  // appId is a dependency for the same reason as the log list: never leak app A's
  // trace timeline into app B's view while a fetch from the old app is still in flight.
  useEffect(() => { traceVersion.current += 1; setTrace(null); setTraceError(null); setTraceLoading(false) }, [appId])

  const loadTrace = useCallback(async (traceId: string) => {
    const version = ++traceVersion.current
    const token = getToken()
    setTraceLoading(true); setTraceError(null); setTrace(null)
    if (!token) { setTraceLoading(false); setTraceError('Sign in to inspect owner-only trace timelines.'); return }
    try {
      const timeline = await fetchTraceTimeline(appId, token, traceId)
      if (version !== traceVersion.current) return
      if (isTraceTimeline(timeline)) setTrace(timeline)
      else setTraceError('Could not read the trace timeline. Try again.')
    } catch (e) {
      if (version !== traceVersion.current) return
      setTraceError(errorMessage(e))
    } finally {
      if (version === traceVersion.current) setTraceLoading(false)
    }
  }, [appId, getToken])

  const update = (key: keyof AppLogFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }))
  const apply = (event: FormEvent) => { event.preventDefault(); setApplied({ ...filters, cursor: undefined }) }
  const reset = () => { const next = blankFilters(); setFilters(next); setApplied(next) }
  const neverLogged = build !== null && build.build === null
  const more = () => { if (nextCursor) void load({ ...applied, cursor: nextCursor }, true) }
  const incidents = incidentGroups(logs)

  return (
    <section className="max-w-7xl space-y-4 overflow-y-auto min-h-0 flex-1" aria-labelledby="app-logs-heading">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 id="app-logs-heading" className="display-font text-lg font-bold text-[var(--ink)]">Logs</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Owner-only, sanitized app diagnostics. Trace IDs connect SDK session events to host invalidation.</p>
            <p className="mt-1 text-xs text-[var(--muted)]">The SDK captures runtime errors (platform#105) and failed actions and sign-ins (platform#106); an app sends logs once it runs an SDK version with them.</p>
          </div>
          <label className="text-xs font-semibold text-[var(--muted)]">Time range
            <select aria-label="Time range" value={range} onChange={(e) => setRange(e.target.value as Range)} className="ml-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 text-sm text-[var(--ink)]">
              <option value="1h">Last hour</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option>
            </select>
          </label>
        </div>
        <form onSubmit={apply} className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Log filters">
          <select aria-label="Level" value={filters.level} onChange={(e) => update('level', e.target.value)} className="log-control"><option value="">All levels</option><option value="error">Error</option><option value="warn">Warn</option><option value="info">Info</option><option value="debug">Debug</option></select>
          <input aria-label="Category" placeholder="Category" maxLength={80} value={filters.category} onChange={(e) => update('category', e.target.value)} className="log-control" />
          <input aria-label="Phase" placeholder="Phase (e.g. api_request)" maxLength={48} value={filters.phase} onChange={(e) => update('phase', e.target.value)} className="log-control" />
          <input aria-label="Client ID" placeholder="Anonymous client ID" maxLength={128} value={filters.clientId} onChange={(e) => update('clientId', e.target.value)} className="log-control" />
          <input aria-label="User ID" placeholder="User ID" maxLength={128} value={filters.userId} onChange={(e) => update('userId', e.target.value)} className="log-control" />
          <input aria-label="Fingerprint" placeholder="Fingerprint" maxLength={128} value={filters.fingerprint} onChange={(e) => update('fingerprint', e.target.value)} className="log-control" />
          <select aria-label="Source" value={filters.source} onChange={(e) => update('source', e.target.value)} className="log-control"><option value="">All sources</option><option value="mediated">Mediated</option><option value="direct">Direct</option><option value="server">Server</option><option value="worker">Worker</option><option value="worker-console">Worker console</option></select>
          <input aria-label="Trace ID" placeholder="Trace / correlation ID" maxLength={128} value={filters.traceId} onChange={(e) => update('traceId', e.target.value)} className="log-control" />
          <div className="flex gap-2"><button type="submit" className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white">Apply</button><button type="button" onClick={reset} className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm text-[var(--muted)]">Clear</button></div>
        </form>
      </div>

      {summary && (
        <div className="space-y-1">
          <div className="grid gap-3 sm:grid-cols-3" aria-label="Warnings and errors">
            {summary.map((w) => <Kpi key={w.label} label={`Warnings + errors · ${w.label}`} value={`${w.count.toLocaleString()}${w.capped ? '+' : ''}`} />)}
          </div>
          {summary[1]?.top && (
            <p className="text-xs text-[var(--muted)]">
              Most common in 24h: <span className="text-[var(--ink)]">{safeLogText(summary[1].top.category)}</span> — {safeLogText(summary[1].top.sample_message)} · {summary[1].top.affected} affected
            </p>
          )}
        </div>
      )}

      {error && <p role="alert" className="rounded-xl border border-[var(--error)]/30 bg-[var(--panel)] p-4 text-sm text-[var(--error)]">{error}</p>}
      {loading && <p className="py-12 text-center text-sm text-[var(--muted)]">Loading app logs…</p>}

      {!loading && !error && (
        <>
          <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-x-auto">
              {logs.length === 0 ? (
                <p className="p-8 text-center text-sm text-[var(--muted)]">
                  {neverLogged
                    ? 'No logs received yet. Wire the SDK (platform#105/#106) to start capturing errors.'
                    : 'No matching log entries.'}
                </p>
              ) : (
                <table className="w-full min-w-[920px] text-left text-xs"><thead className="border-b border-[var(--line)] text-[var(--muted)]"><tr><th className="p-3">Timestamp</th><th className="p-3">Level</th><th className="p-3">Category / message</th><th className="p-3">SDK / build</th><th className="p-3">Source</th><th className="p-3">User</th><th className="p-3">Trace / correlation</th><th className="p-3">Fingerprint</th></tr></thead><tbody>
                  {logs.map((log, index) => <tr key={`${log.ts}-${log.traceId ?? 'none'}-${index}`} onClick={() => setSelected(log)} className={`border-b border-[var(--line)] align-top cursor-pointer hover:bg-[var(--panel-hover)] ${selected === log ? 'bg-[var(--panel-hover)]' : ''}`}><td className="p-3 whitespace-nowrap text-[var(--muted)]"><button type="button" onClick={(e) => { e.stopPropagation(); setSelected(log) }} aria-label={`Details for ${safeLogText(log.message)}`} className="text-left hover:text-[var(--ink)]">{formatTime(log.ts)}</button></td><td className="p-3 font-semibold text-[var(--ink)]">{safeLogText(log.level)}</td><td className="p-3"><div className="font-medium text-[var(--ink)]">{safeLogText(log.category)}</div><div className="mt-1 max-w-[300px] text-[var(--muted)]">{safeLogText(log.message)}</div></td><td className="p-3 text-[var(--muted)]">{buildLabel(log.build)}</td><td className="p-3 text-[var(--muted)]">{safeLogText(log.source)}</td><td className="p-3 font-mono text-[var(--muted)]">{log.userId ? safeLogText(log.userId) : '—'}</td><td className="p-3 font-mono text-[var(--muted)]">{safeLogText(log.traceId)}</td><td className="p-3 font-mono text-[var(--muted)]">{safeLogText(log.fingerprint)}</td></tr>)}
                </tbody></table>
              )}
              {nextCursor && <div className="border-t border-[var(--line)] p-3"><button type="button" onClick={more} disabled={loadingMore} className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-50">{loadingMore ? 'Loading…' : 'Load more'}</button></div>}
            </div>
            <aside className="space-y-4">
              {selected && <LogDetail log={selected} onClose={() => setSelected(null)} onViewTrace={loadTrace} />}
              <BuildCard build={build} />
              <TelemetryHealthCard health={health} unavailable={healthUnavailable} />
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4"><h3 className="text-sm font-semibold text-[var(--ink)]">Error groups</h3>{groups.length === 0 ? <p className="mt-2 text-sm text-[var(--muted)]">No warning or error groups in this range.</p> : <ul className="mt-3 space-y-3">{groups.map((group) => <li key={group.fingerprint} className="border-t border-[var(--line)] pt-3 first:border-0 first:pt-0"><p className="font-medium text-[var(--ink)]">{safeLogText(group.sample_message)}</p><p className="mt-1 text-xs text-[var(--muted)]">{group.occurrences} occurrences · latest {formatTime(group.last_seen)}</p><button type="button" onClick={() => { const next = { ...filters, fingerprint: group.fingerprint }; setFilters(next); setApplied(next) }} className="mt-1 font-mono text-xs text-[var(--accent)]">{safeLogText(group.fingerprint)}</button></li>)}</ul>}</div>
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4"><h3 className="text-sm font-semibold text-[var(--ink)]">Trace incidents</h3>{incidents.length === 0 ? <p className="mt-2 text-sm text-[var(--muted)]">No correlation IDs in this page.</p> : <ul className="mt-3 space-y-2">{incidents.map((incident) => <li key={incident.traceId}><button type="button" onClick={() => { const next = { ...filters, traceId: incident.traceId }; setFilters(next); setApplied(next); void loadTrace(incident.traceId) }} className="font-mono text-xs text-[var(--accent)] break-all">{safeLogText(incident.traceId)}</button><p className="text-xs text-[var(--muted)]">{incident.occurrences} entries · latest {formatTime(incident.latest)}</p></li>)}</ul>}</div>
              {(traceLoading || traceError || trace) && (
                <TraceTimelineCard appId={appId} trace={trace} loading={traceLoading} error={traceError} onClose={() => { traceVersion.current += 1; setTrace(null); setTraceError(null); setTraceLoading(false) }} />
              )}
            </aside>
          </div>
        </>
      )}
    </section>
  )
}

function LogDetail({ log, onClose, onViewTrace }: { log: AppLog; onClose: () => void; onViewTrace: (traceId: string) => void }) {
  const { fields, hidden } = safeFields(log.data)
  const context = contextRows(log.context)
  const symbolication = log.symbolication
  // The row's own build names the release these frames were mapped against — never the app's newest build.
  const rows: [string, string][] = [
    ['Time', formatTime(log.ts)], ['Level', safeLogText(log.level)], ['Category', safeLogText(log.category)],
    ['Message', safeLogText(log.message)], ['Source', safeLogText(log.source)], ['User', log.userId ? safeLogText(log.userId) : '—'],
    ['Client', safeLogText(log.clientId)], ['Release', buildLabel(log.build)], ['Trace', safeLogText(log.traceId)], ['Fingerprint', safeLogText(log.fingerprint)],
  ]
  return (
    <section aria-label="Log entry details" className="rounded-2xl border border-[var(--accent)] bg-[var(--panel)] p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--ink)]">Entry details</h3>
        <button type="button" onClick={onClose} className="text-xs text-[var(--muted)] hover:text-[var(--ink)]">Close</button>
      </div>
      <dl className="mt-2 space-y-1 text-xs">
        {rows.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="w-20 flex-shrink-0 text-[var(--muted)]">{k}</dt><dd className="min-w-0 break-all text-[var(--ink)]">{v}</dd></div>)}
      </dl>
      {log.traceId && <button type="button" onClick={() => onViewTrace(log.traceId!)} className="mt-2 rounded-lg border border-[var(--line-strong)] px-2 py-1 text-xs text-[var(--accent)]">View trace timeline</button>}

      {context.length > 0 && (
        <>
          <h4 className="mt-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Request context</h4>
          <dl className="mt-1 space-y-1 text-xs">
            {context.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="w-20 flex-shrink-0 text-[var(--muted)]">{k}</dt><dd className="min-w-0 break-all text-[var(--ink)]">{v}</dd></div>)}
          </dl>
        </>
      )}

      {symbolication && (
        <>
          <h4 className="mt-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Source frames</h4>
          <p data-testid="symbolication-status" className="mt-1 text-xs text-[var(--ink)]">{SYMBOLICATION_LABEL[symbolication.status]}</p>
          {symbolication.frames.length === 0 ? (
            <p className="mt-1 text-xs text-[var(--muted)]">No frames.</p>
          ) : (
            <ol data-testid="source-frames" className="mt-1 space-y-1 text-xs font-mono">
              {symbolication.frames.slice(0, MAX_RENDERED_FRAMES).map((frame, i) => (
                <li key={i} className="break-all text-[var(--ink)]">
                  {frameLabel(frame)}
                  {frame.unresolved && <span className="ml-1 text-[var(--muted)]">(unresolved)</span>}
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      <h4 className="mt-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Data</h4>
      {fields.length === 0 ? <p className="mt-1 text-xs text-[var(--muted)]">No displayable fields.</p> : (
        <dl data-testid="log-data" className="mt-1 space-y-1 text-xs font-mono">
          {fields.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="text-[var(--muted)]">{k}</dt><dd className="min-w-0 break-all text-[var(--ink)]">{v}</dd></div>)}
        </dl>
      )}
      {hidden > 0 && <p className="mt-1 text-[11px] text-[var(--muted)]">{hidden} field{hidden === 1 ? '' : 's'} hidden (nested or possibly sensitive).</p>}
    </section>
  )
}

function BuildCard({ build }: { build: { build: unknown; ts: number | null } | null }) {
  const { fields } = safeFields(build?.build)
  return (
    <div data-testid="build-card" className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <h3 className="text-sm font-semibold text-[var(--ink)]">Latest build</h3>
      {!build && <p className="mt-2 text-sm text-[var(--muted)]">Loading…</p>}
      {build && build.build === null && (
        <p className="mt-2 text-sm text-[var(--muted)]">No build metadata yet. The SDK reports it with each log once wired (platform#105/#106).</p>
      )}
      {build && build.build !== null && (
        <>
          <dl className="mt-2 space-y-1 text-xs">
            {fields.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="text-[var(--muted)]">{k}</dt><dd className="font-mono text-[var(--ink)] break-all">{v}</dd></div>)}
          </dl>
          {build.ts && <p className="mt-1 text-[11px] text-[var(--muted)]">Seen {formatTime(build.ts)}</p>}
        </>
      )}
    </div>
  )
}

function componentRow(label: string, c: { status: string; lastOkAt: number | null; lastFailureAt: number | null }): [string, string] {
  const when = c.status === 'degraded' ? c.lastFailureAt : c.lastOkAt
  return [label, `${c.status}${when ? ` · ${formatTime(when)}` : ''}`]
}

/**
 * #391: aggregate counts, throttling/loss and staleness — never implying a
 * complete count when the evaluator is behind or request volume is sampled.
 */
function TelemetryHealthCard({ health, unavailable }: { health: TelemetryHealth | null; unavailable: boolean }) {
  return (
    <div data-testid="telemetry-health" className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <h3 className="text-sm font-semibold text-[var(--ink)]">Telemetry health</h3>
      {!health && !unavailable && <p className="mt-2 text-sm text-[var(--muted)]">Loading…</p>}
      {!health && unavailable && <p className="mt-2 text-sm text-[var(--muted)]">Telemetry health is unavailable right now. This does not mean the app is unhealthy — only that this check could not be read.</p>}
      {health && (
        <>
          <p className="mt-2 text-sm text-[var(--ink)]">Status: <strong>{health.status}</strong>{!health.countsReliable && <span className="ml-1 text-[var(--muted)]">(counts may be stale — unknown, not confirmed zero)</span>}</p>
          {!health.alertCoverage.complete && (
            <p className="mt-1 text-xs text-[var(--muted)]">Alerts were not evaluated for part of the last day{health.alertCoverage.gap?.start ? ` (gap starting ${formatTime(health.alertCoverage.gap.start)})` : ''}.</p>
          )}
          <dl className="mt-2 space-y-1 text-xs">
            {([componentRow('Evaluator', health.components.evaluator), componentRow('Prune', health.components.prune), componentRow('Ingest (aggregates)', health.components.aggregates)] as const)
              .map(([k, v]) => <div key={k} className="flex gap-2"><dt className="w-32 flex-shrink-0 text-[var(--muted)]">{k}</dt><dd className="min-w-0 text-[var(--ink)]">{v}</dd></div>)}
          </dl>
          <h4 className="mt-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Signals (last hour / last day)</h4>
          <dl className="mt-1 space-y-1 text-xs">
            {Object.keys(health.windows.lastDay.signals).filter((signal) => health.windows.lastHour.signals[signal] || health.windows.lastDay.signals[signal]).map((signal) => (
              <div key={signal} className="flex gap-2"><dt className="w-32 flex-shrink-0 text-[var(--muted)]">{safeLogText(signal)}</dt><dd className="text-[var(--ink)]">{health.windows.lastHour.signals[signal] ?? 0} / {health.windows.lastDay.signals[signal] ?? 0}</dd></div>
            ))}
            <div className="flex gap-2"><dt className="w-32 flex-shrink-0 text-[var(--muted)]">Detail dropped</dt><dd className="text-[var(--ink)]">client {health.windows.lastDay.detailDropped.client} · server {health.windows.lastDay.detailDropped.server} (last day)</dd></div>
          </dl>
          <h4 className="mt-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Requests (sampled, approximate)</h4>
          {health.requests.status === 'unknown' ? (
            <p className="mt-1 text-xs text-[var(--muted)]">Request volume is unavailable — not a confirmed zero.</p>
          ) : (
            <p className="mt-1 text-xs text-[var(--ink)]">
              Last hour: {health.requests.lastHour.total} total, {health.requests.lastHour.serverErrors} server errors
              {health.requests.lastHour.serverErrorRate !== null && ` (${(health.requests.lastHour.serverErrorRate * 100).toFixed(1)}%)`}
              · Last day: {health.requests.lastDay.total} total, {health.requests.lastDay.serverErrors} server errors
              {health.requests.lastDay.serverErrorRate !== null && ` (${(health.requests.lastDay.serverErrorRate * 100).toFixed(1)}%)`}
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** A safe reference an owner can quote to support: app, trace and when it was generated — never a token or raw URL. */
function supportReference(appId: string, traceId: string, generatedAt: number): string {
  return `app=${safeLogText(appId)} trace=${safeLogText(traceId)} generated=${new Date(generatedAt).toISOString()}`
}

/** A bounded, sanitized export: release/time/evidence references only — no raw envelope, credentials or personal data. */
function exportHref(trace: TraceTimeline, generatedAt: number): string {
  const payload = {
    traceId: trace.traceId,
    generatedAt: new Date(generatedAt).toISOString(),
    truncated: trace.truncated,
    hops: trace.hops,
    records: trace.records.map((r) => ({
      ts: r.ts, hop: r.hop, level: safeLogText(r.level), category: safeLogText(r.category),
      message: safeLogText(r.message), release: buildLabel(r.build), fingerprint: r.fingerprint ? safeLogText(r.fingerprint) : null,
      operation: r.context?.operation ? safeLogText(r.context.operation) : null,
      result: r.context?.result ?? null,
      errorCode: r.context?.errorCode ? safeLogText(r.context.errorCode) : null,
    })),
    invocation: trace.invocation ? {
      type: safeLogText(trace.invocation.type), name: safeLogText(trace.invocation.name), status: safeLogText(trace.invocation.status),
      httpStatus: trace.invocation.httpStatus, outcome: trace.invocation.outcome ? safeLogText(trace.invocation.outcome) : null,
      cpuMs: trace.invocation.cpuMs, wallMs: trace.invocation.wallMs,
    } : null,
  }
  return `data:application/json,${encodeURIComponent(JSON.stringify(payload, null, 2))}`
}

/**
 * #394: a bounded, server-side incident timeline across every hop — not current-page
 * counts. A hop absent from `hops` is reported as a gap, never implied healthy.
 */
function TraceTimelineCard({ appId, trace, loading, error, onClose }: { appId: string; trace: TraceTimeline | null; loading: boolean; error: string | null; onClose: () => void }) {
  const generatedAt = useMemo(() => Date.now(), [trace])
  return (
    <section aria-label="Trace timeline" className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--ink)]">Trace timeline</h3>
        <button type="button" onClick={onClose} className="text-xs text-[var(--muted)] hover:text-[var(--ink)]">Close</button>
      </div>
      {loading && <p className="mt-2 text-sm text-[var(--muted)]">Loading trace…</p>}
      {error && <p role="alert" className="mt-2 text-sm text-[var(--error)]">{error}</p>}
      {trace && (
        <>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
            {HOP_ORDER.map((hop) => (
              <li key={hop} className="flex justify-between gap-2"><span className="text-[var(--muted)]">{HOP_LABEL[hop]}</span><span className="text-[var(--ink)]">{trace.hops[hop] ? trace.hops[hop] : <span title="A hop with no row is a gap, not confirmed healthy.">— (no evidence)</span>}</span></li>
            ))}
          </ul>
          {trace.truncated && <p className="mt-2 text-xs text-[var(--muted)]">Showing the first {trace.records.length} records; this incident has more.</p>}
          {trace.records.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">No evidence for this trace yet.</p>
          ) : (
            <ol data-testid="trace-records" className="mt-2 space-y-2 text-xs">
              {trace.records.map((r, i) => (
                <li key={i} className="border-t border-[var(--line)] pt-2 first:border-0 first:pt-0">
                  <span className="text-[var(--muted)]">{formatTime(r.ts)} · {HOP_LABEL[r.hop] ?? safeLogText(r.hop)} · {safeLogText(r.level)}</span>
                  <p className="text-[var(--ink)]">{safeLogText(r.category)} — {safeLogText(r.message)}</p>
                </li>
              ))}
            </ol>
          )}
          {trace.invocation && (
            <>
              <h4 className="mt-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Invocation</h4>
              <dl className="mt-1 space-y-1 text-xs">
                {([['Type', safeLogText(trace.invocation.type)], ['Name', safeLogText(trace.invocation.name)], ['Status', safeLogText(trace.invocation.status)],
                  ['HTTP', trace.invocation.httpStatus != null ? String(trace.invocation.httpStatus) : '—'], ['Outcome', trace.invocation.outcome ? safeLogText(trace.invocation.outcome) : '—'],
                  ['CPU', formatMs(trace.invocation.cpuMs)], ['Wall', formatMs(trace.invocation.wallMs)]] as [string, string][])
                  .map(([k, v]) => <div key={k} className="flex gap-2"><dt className="w-16 flex-shrink-0 text-[var(--muted)]">{k}</dt><dd className="min-w-0 break-all text-[var(--ink)]">{v}</dd></div>)}
              </dl>
            </>
          )}
          <p className="mt-3 text-[11px] text-[var(--muted)] break-all">Support reference: {supportReference(appId, trace.traceId, generatedAt)}</p>
          <a href={exportHref(trace, generatedAt)} download={`incident-${trace.traceId}.json`} className="mt-1 inline-block text-xs text-[var(--accent)]">Export sanitized incident</a>
        </>
      )}
    </section>
  )
}
