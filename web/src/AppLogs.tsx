import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ApiError } from './api'
import { fetchAppLogGroups, fetchAppLogs, type AppLog, type AppLogFilters, type AppLogGroup } from './appLogsApi'

interface Props {
  appId: string
  getToken: () => string | null
}

type Range = '24h' | '7d' | '30d'
const rangeMs: Record<Range, number> = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '30d': 30 * 24 * 60 * 60 * 1000 }

const blankFilters = (): AppLogFilters => ({ level: '', category: '', phase: '', clientId: '', fingerprint: '', source: '', traceId: '' })

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
  const [filters, setFilters] = useState<AppLogFilters>(blankFilters)
  const [applied, setApplied] = useState<AppLogFilters>(blankFilters)
  const [logs, setLogs] = useState<AppLog[]>([])
  const [groups, setGroups] = useState<AppLogGroup[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)

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
    else { setLoading(true); setError(null); setLogs([]); setGroups([]); setNextCursor(null) }
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
  useEffect(() => () => { requestVersion.current += 1 }, [])

  const update = (key: keyof AppLogFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }))
  const apply = (event: FormEvent) => { event.preventDefault(); setApplied({ ...filters, cursor: undefined }) }
  const reset = () => { const next = blankFilters(); setFilters(next); setApplied(next) }
  const more = () => { if (nextCursor) void load({ ...applied, cursor: nextCursor }, true) }
  const incidents = incidentGroups(logs)

  return (
    <section className="max-w-7xl space-y-4 overflow-y-auto min-h-0 flex-1" aria-labelledby="app-logs-heading">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 id="app-logs-heading" className="display-font text-lg font-bold text-[var(--ink)]">Logs</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Owner-only, sanitized app diagnostics. Trace IDs connect SDK session events to host invalidation.</p>
          </div>
          <label className="text-xs font-semibold text-[var(--muted)]">Time range
            <select aria-label="Time range" value={range} onChange={(e) => setRange(e.target.value as Range)} className="ml-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 text-sm text-[var(--ink)]">
              <option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option>
            </select>
          </label>
        </div>
        <form onSubmit={apply} className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Log filters">
          <select aria-label="Level" value={filters.level} onChange={(e) => update('level', e.target.value)} className="log-control"><option value="">All levels</option><option value="error">Error</option><option value="warn">Warn</option><option value="info">Info</option><option value="debug">Debug</option></select>
          <input aria-label="Category" placeholder="Category" maxLength={80} value={filters.category} onChange={(e) => update('category', e.target.value)} className="log-control" />
          <input aria-label="Phase" placeholder="Phase (e.g. api_request)" maxLength={48} value={filters.phase} onChange={(e) => update('phase', e.target.value)} className="log-control" />
          <input aria-label="Client ID" placeholder="Anonymous client ID" maxLength={128} value={filters.clientId} onChange={(e) => update('clientId', e.target.value)} className="log-control" />
          <input aria-label="Fingerprint" placeholder="Fingerprint" maxLength={128} value={filters.fingerprint} onChange={(e) => update('fingerprint', e.target.value)} className="log-control" />
          <select aria-label="Source" value={filters.source} onChange={(e) => update('source', e.target.value)} className="log-control"><option value="">All sources</option><option value="mediated">Mediated</option><option value="direct">Direct</option><option value="server">Server</option><option value="worker">Worker</option><option value="worker-console">Worker console</option></select>
          <input aria-label="Trace ID" placeholder="Trace / correlation ID" maxLength={128} value={filters.traceId} onChange={(e) => update('traceId', e.target.value)} className="log-control" />
          <div className="flex gap-2"><button type="submit" className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white">Apply</button><button type="button" onClick={reset} className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm text-[var(--muted)]">Clear</button></div>
        </form>
      </div>

      {error && <p role="alert" className="rounded-xl border border-[var(--error)]/30 bg-[var(--panel)] p-4 text-sm text-[var(--error)]">{error}</p>}
      {loading && <p className="py-12 text-center text-sm text-[var(--muted)]">Loading app logs…</p>}

      {!loading && !error && (
        <>
          <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-x-auto">
              {logs.length === 0 ? <p className="p-8 text-center text-sm text-[var(--muted)]">No sanitized log entries match these filters.</p> : (
                <table className="w-full min-w-[920px] text-left text-xs"><thead className="border-b border-[var(--line)] text-[var(--muted)]"><tr><th className="p-3">Timestamp</th><th className="p-3">Level</th><th className="p-3">Category / message</th><th className="p-3">SDK / build</th><th className="p-3">Source</th><th className="p-3">Trace / correlation</th><th className="p-3">Fingerprint</th></tr></thead><tbody>
                  {logs.map((log, index) => <tr key={`${log.ts}-${log.traceId ?? 'none'}-${index}`} className="border-b border-[var(--line)] align-top"><td className="p-3 whitespace-nowrap text-[var(--muted)]">{formatTime(log.ts)}</td><td className="p-3 font-semibold text-[var(--ink)]">{safeLogText(log.level)}</td><td className="p-3"><div className="font-medium text-[var(--ink)]">{safeLogText(log.category)}</div><div className="mt-1 max-w-[300px] text-[var(--muted)]">{safeLogText(log.message)}</div></td><td className="p-3 text-[var(--muted)]">{buildLabel(log.build)}</td><td className="p-3 text-[var(--muted)]">{safeLogText(log.source)}</td><td className="p-3 font-mono text-[var(--muted)]">{safeLogText(log.traceId)}</td><td className="p-3 font-mono text-[var(--muted)]">{safeLogText(log.fingerprint)}</td></tr>)}
                </tbody></table>
              )}
              {nextCursor && <div className="border-t border-[var(--line)] p-3"><button type="button" onClick={more} disabled={loadingMore} className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-50">{loadingMore ? 'Loading…' : 'Load more'}</button></div>}
            </div>
            <aside className="space-y-4">
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4"><h3 className="text-sm font-semibold text-[var(--ink)]">Error groups</h3>{groups.length === 0 ? <p className="mt-2 text-sm text-[var(--muted)]">No warning or error groups in this range.</p> : <ul className="mt-3 space-y-3">{groups.map((group) => <li key={group.fingerprint} className="border-t border-[var(--line)] pt-3 first:border-0 first:pt-0"><p className="font-medium text-[var(--ink)]">{safeLogText(group.sample_message)}</p><p className="mt-1 text-xs text-[var(--muted)]">{group.occurrences} occurrences · latest {formatTime(group.last_seen)}</p><button type="button" onClick={() => { const next = { ...filters, fingerprint: group.fingerprint }; setFilters(next); setApplied(next) }} className="mt-1 font-mono text-xs text-[var(--accent)]">{safeLogText(group.fingerprint)}</button></li>)}</ul>}</div>
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4"><h3 className="text-sm font-semibold text-[var(--ink)]">Trace incidents</h3>{incidents.length === 0 ? <p className="mt-2 text-sm text-[var(--muted)]">No correlation IDs in this page.</p> : <ul className="mt-3 space-y-2">{incidents.map((incident) => <li key={incident.traceId}><button type="button" onClick={() => { const next = { ...filters, traceId: incident.traceId }; setFilters(next); setApplied(next) }} className="font-mono text-xs text-[var(--accent)] break-all">{safeLogText(incident.traceId)}</button><p className="text-xs text-[var(--muted)]">{incident.occurrences} entries · latest {formatTime(incident.latest)}</p></li>)}</ul>}</div>
            </aside>
          </div>
        </>
      )}
    </section>
  )
}
