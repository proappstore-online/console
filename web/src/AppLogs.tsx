import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ApiError } from './api'
import { fetchAppLogGroups, fetchAppLogs, fetchLatestBuild, type AppLog, type AppLogFilters, type AppLogGroup } from './appLogsApi'
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
  useEffect(() => () => { requestVersion.current += 1; overviewVersion.current += 1 }, [])

  // Per app, not per filter: the latest build and the 1h/24h/7d warn+error counts.
  // A failure here leaves the cards out; the log list reports its own errors.
  useEffect(() => {
    const version = ++overviewVersion.current
    setBuild(null); setSummary(null)
    const token = getToken()
    if (!token) return
    fetchLatestBuild(appId, token).then((b) => { if (version === overviewVersion.current) setBuild(b) }, () => {})
    const now = Date.now()
    Promise.all(SUMMARY_WINDOWS.map(async (w) => {
      const { groups: g } = await fetchAppLogGroups(appId, token, { since: now - w.ms })
      return { label: w.label, count: g.reduce((n, x) => n + x.occurrences, 0), capped: g.length >= 50, top: g[0] ?? null }
    })).then((s) => { if (version === overviewVersion.current) setSummary(s) }, () => {})
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
              {selected && <LogDetail log={selected} onClose={() => setSelected(null)} />}
              <BuildCard build={build} />
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4"><h3 className="text-sm font-semibold text-[var(--ink)]">Error groups</h3>{groups.length === 0 ? <p className="mt-2 text-sm text-[var(--muted)]">No warning or error groups in this range.</p> : <ul className="mt-3 space-y-3">{groups.map((group) => <li key={group.fingerprint} className="border-t border-[var(--line)] pt-3 first:border-0 first:pt-0"><p className="font-medium text-[var(--ink)]">{safeLogText(group.sample_message)}</p><p className="mt-1 text-xs text-[var(--muted)]">{group.occurrences} occurrences · latest {formatTime(group.last_seen)}</p><button type="button" onClick={() => { const next = { ...filters, fingerprint: group.fingerprint }; setFilters(next); setApplied(next) }} className="mt-1 font-mono text-xs text-[var(--accent)]">{safeLogText(group.fingerprint)}</button></li>)}</ul>}</div>
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4"><h3 className="text-sm font-semibold text-[var(--ink)]">Trace incidents</h3>{incidents.length === 0 ? <p className="mt-2 text-sm text-[var(--muted)]">No correlation IDs in this page.</p> : <ul className="mt-3 space-y-2">{incidents.map((incident) => <li key={incident.traceId}><button type="button" onClick={() => { const next = { ...filters, traceId: incident.traceId }; setFilters(next); setApplied(next) }} className="font-mono text-xs text-[var(--accent)] break-all">{safeLogText(incident.traceId)}</button><p className="text-xs text-[var(--muted)]">{incident.occurrences} entries · latest {formatTime(incident.latest)}</p></li>)}</ul>}</div>
            </aside>
          </div>
        </>
      )}
    </section>
  )
}

function LogDetail({ log, onClose }: { log: AppLog; onClose: () => void }) {
  const { fields, hidden } = safeFields(log.data)
  const rows: [string, string][] = [
    ['Time', formatTime(log.ts)], ['Level', safeLogText(log.level)], ['Category', safeLogText(log.category)],
    ['Message', safeLogText(log.message)], ['Source', safeLogText(log.source)], ['User', log.userId ? safeLogText(log.userId) : '—'],
    ['Client', safeLogText(log.clientId)], ['Build', buildLabel(log.build)], ['Trace', safeLogText(log.traceId)], ['Fingerprint', safeLogText(log.fingerprint)],
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
