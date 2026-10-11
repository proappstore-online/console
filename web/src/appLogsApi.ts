import { apiFetch } from './api'

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

/** Owner-only app-log read. The token is carried by requestJson's header, never a URL. */
export function fetchAppLogs(appId: string, token: string | null, filters: AppLogFilters = {}) {
  return apiFetch<AppLogPage>(`/apps/${encodeURIComponent(appId)}/logs${query(filters)}`, { token })
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
