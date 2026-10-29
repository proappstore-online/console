import { apiFetch } from './api'

/** #390: a log row's allowlisted request context — fixed scalar fields, never a raw envelope. */
export interface LogContext {
  v: 1
  sdkVersion?: string
  operation?: string
  spanId?: string
  parentSpanId?: string
  result?: 'ok' | 'error'
  errorCode?: string
  durationMs?: number
}

export type SymbolicationStatus = 'ok' | 'missing' | 'mismatched' | 'unavailable' | 'skipped'

/** One stack frame, symbolicated against the event's own release when possible. Never a raw URL to fetch. */
export interface SourceFrame {
  source: string
  line: number
  col: number
  originalSource?: string
  originalLine?: number
  originalCol?: number
  name?: string
  /** True when this frame could not be mapped inside the release (unknown file or position). */
  unresolved?: true
}

/** #393: the result of symbolicating one event's stack against its own build's release — never the app's newest. */
export interface SymbolicatedEvent {
  status: SymbolicationStatus
  frames: SourceFrame[]
  /** The release (commit SHA) the frames were mapped against — this event's own, not the latest app build. */
  commitSha?: string
  rawStack?: string
  reason?: string
}

export interface AppLog {
  ts: number
  level: 'debug' | 'info' | 'warn' | 'error' | string
  category: string
  message: string
  /** The API has already sanitized this bounded telemetry envelope. Never render it wholesale. */
  data: unknown
  clientId: string | null
  /** The signed-in user the row came from, when there was one (an id, never a name). */
  userId?: string | null
  build: unknown
  fingerprint: string | null
  traceId: string | null
  source: string | null
  /** #390: null until the SDK sends the envelope. */
  context?: LogContext | null
  /** #393: present only when the row carried a stack and the server could attempt symbolication. */
  symbolication?: SymbolicatedEvent
}

export interface AppLogFilters {
  level?: string
  category?: string
  phase?: string
  since?: number
  clientId?: string
  userId?: string
  fingerprint?: string
  source?: string
  traceId?: string
  cursor?: string
  limit?: number
}

export interface AppLogPage {
  logs: AppLog[]
  nextCursor: string | null
}

export interface AppLogGroup {
  fingerprint: string
  occurrences: number
  affected: number
  first_seen: number
  last_seen: number
  level: string
  category: string
  sample_message: string
}

function query(filters: AppLogFilters): string {
  const params = new URLSearchParams()
  const values: Record<string, string | number | undefined> = {
    level: filters.level,
    category: filters.category,
    phase: filters.phase,
    since: filters.since,
    client_id: filters.clientId,
    user_id: filters.userId,
    fingerprint: filters.fingerprint,
    source: filters.source,
    trace_id: filters.traceId,
    cursor: filters.cursor,
    limit: filters.limit,
  }
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

/**
 * Owner-only app-log read. The token is carried by requestJson's header, never a URL.
 * Always asks the server to symbolicate (#393): bounded per request (at most 20 rows
 * across 3 releases), each row mapped against its own build's release, never another.
 */
export function fetchAppLogs(appId: string, token: string | null, filters: AppLogFilters = {}) {
  const qs = query(filters)
  return apiFetch<AppLogPage>(`/apps/${encodeURIComponent(appId)}/logs${qs}${qs ? '&' : '?'}symbolicate=true`, { token })
}

export function fetchAppLogGroups(appId: string, token: string | null, filters: AppLogFilters) {
  return apiFetch<{ groups: AppLogGroup[] }>(
    // Groups take no user or cursor filter.
    `/apps/${encodeURIComponent(appId)}/logs/groups${query({ ...filters, userId: undefined, cursor: undefined, limit: 50 })}`,
    { token },
  )
}

/** The newest build metadata any log row carried; `build` is null when no row ever had one. */
export async function fetchLatestBuild(appId: string, token: string | null): Promise<{ build: unknown; ts: number | null }> {
  const r = await apiFetch<{ build?: unknown; ts?: number }>(`/apps/${encodeURIComponent(appId)}/logs/build`, { token })
  return { build: r.build ?? null, ts: r.ts ?? null }
}

/** #394: which hop a trace record is evidence from. A hop absent from `hops` is a gap, not an all-clear. */
export type TraceHop = 'browser' | 'host' | 'api' | 'data-worker' | 'app-worker' | string

export interface TraceRecord {
  ts: number
  hop: TraceHop
  source: string | null
  level: string
  category: string
  message: string
  /** Sanitized the same as a log row's `data`; never render it wholesale. */
  data: unknown
  build: unknown
  fingerprint: string | null
  context: LogContext | null
}

/** The app-worker invocation (#308) sharing this trace's id, if any. */
export interface TraceInvocation {
  id: string
  type: string
  name: string
  status: string
  httpStatus: number | null
  startedAt: number
  finishedAt: number | null
  cpuMs: number | null
  wallMs: number | null
  outcome: string | null
}

/** One incident, every hop (#394) — bounded and server-side, not current-page counts. */
export interface TraceTimeline {
  traceId: string
  hops: Record<string, number>
  records: TraceRecord[]
  invocation: TraceInvocation | null
  /** True when the incident has more records than were returned (MAX_INCIDENT_RECORDS). */
  truncated: boolean
}

/** Owner-only, scoped to this app: `traceId` cannot surface another app's rows. */
export function fetchTraceTimeline(appId: string, token: string | null, traceId: string) {
  return apiFetch<TraceTimeline>(`/apps/${encodeURIComponent(appId)}/incidents/${encodeURIComponent(traceId)}`, { token })
}

export type TelemetryComponentStatus = 'ok' | 'degraded' | 'unknown' | 'no_data'

export interface TelemetryComponentHealth {
  status: TelemetryComponentStatus
  lastOkAt: number | null
  lastFailureAt: number | null
  lastError: string | null
}

export interface TelemetryWindow {
  signals: Record<string, number>
  detailDropped: { client: number; server: number }
}

export interface TelemetryFamilyCounts {
  total: number
  ok: number
  clientErrors: number
  serverErrors: number
  serverErrorRate: number | null
}

export interface TelemetryRequestWindow extends TelemetryFamilyCounts {
  latency: { lt_100ms: number; lt_500ms: number; lt_2s: number; ge_2s: number }
  byFamily: Record<string, TelemetryFamilyCounts>
}

/** #391: whether the telemetry pipeline behind alerts/counts is working, and what it counted. */
export interface TelemetryHealth {
  appId: string
  checkedAt: number
  status: 'ok' | 'degraded' | 'unknown'
  /** False when the evaluator has not run recently: a zero in `windows` may be "unknown", not "none". */
  countsReliable: boolean
  alertCoverage: { complete: boolean; windowMs: number; gap: { start: number | null; end: number | null; recordedAt: number | null } | null }
  components: { evaluator: TelemetryComponentHealth; prune: TelemetryComponentHealth; aggregates: TelemetryComponentHealth }
  windows: { lastHour: TelemetryWindow; lastDay: TelemetryWindow }
  requests:
    | { status: 'ok'; sampled: true; lastHour: TelemetryRequestWindow; lastDay: TelemetryRequestWindow }
    | { status: 'unknown'; reason: string; sampled: true; lastHour: null; lastDay: null }
  bucketMs: number
}

export function fetchTelemetryHealth(appId: string, token: string | null) {
  return apiFetch<TelemetryHealth>(`/apps/${encodeURIComponent(appId)}/telemetry/health`, { token })
}
