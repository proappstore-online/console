/**
 * Analytics API client — matches the PAS backend's analytics routes:
 *   GET  /v1/apps/:id/analytics          → current config
 *   PUT  /v1/apps/:id/analytics          → update BYO tags
 *   GET  /v1/apps/:id/analytics/stats    → aggregated stats
 *
 * Uses the same bearer-token auth as the rest of the console.
 */

import { API_BASE } from './api'

export interface AnalyticsConfig {
  cfBeaconToken: string | null
  ga4: string | null
  plausible: string | null
  customHead: string | null
  updatedAt: number | null
}

export interface AnalyticsStats {
  total_views: number
  unique_paths: number
  /** Time series bucketed by hour or day per the envelope's `bucket` field.
   *  Each entry's `t` is `YYYY-MM-DD` for day buckets, `YYYY-MM-DD HH:00:00`
   *  for hour buckets. The chart picks a label format from `bucket`. */
  series: Array<{ t: string; views: number }>
  top_paths: Array<{ path: string; views: number }>
  top_referrers: Array<{ referrer: string; views: number }>
  top_countries: Array<{ country: string; views: number }>
  device_split: Array<{ device: string; views: number }>
}

export type AnalyticsBucket = 'hour' | 'day'

export interface StatsResponse {
  appId: string
  days: number
  /** Echoes back the kind that was queried — useful when the same component
   *  re-uses the response to render a heading like "purchase events". */
  kind: string
  /** Bucket actually used. Defaults to 'hour' when days=1, 'day' otherwise;
   *  override via the `bucket` arg on fetchAnalyticsStats. */
  bucket: AnalyticsBucket
  /** When set, the stats describe only events on this URL pathname. Echoes
   *  back the `?path=` arg from the request, or null for aggregate views. */
  path: string | null
  stats: AnalyticsStats
}

/** "Right now" view — visitors / paths in the last 5 minutes. Returned by
 *  /v1/apps/:id/analytics/live. The dashboard polls this every 30s. */
export interface LiveResponse {
  appId: string
  window_minutes: number
  views: number
  unique_paths: number
  top_paths: Array<{ path: string; views: number }>
}

/** Diagnostics — why this app's dashboard shows no data. The verdict picks
 *  the worst-still-actionable cause; the UI renders human-readable guidance
 *  based on it. `checks` carries the raw signals for power-user inspection. */
export type DiagnosticsVerdict =
  | 'ok'
  | 'never_seen_event'
  | 'no_dataset_binding'
  | 'no_stats_query'
  | 'silent_24h'

export interface DiagnosticsResponse {
  appId: string
  verdict: DiagnosticsVerdict
  checks: {
    cf_beacon_configured: boolean
    byo_tag_configured: boolean
    dataset_bound: boolean
    stats_queryable: boolean
    events_ever: boolean
    events_last_24h: number
  }
  loader_url: string
}

/** Per-event-kind summary returned from /v1/apps/:id/analytics/events. */
export interface EventKindSummary {
  kind: string
  count: number
}

export interface EventsResponse {
  appId: string
  days: number
  total_events: number
  events: EventKindSummary[]
}

async function call<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    throw new Error(`HTTP ${res.status}: ${detail.slice(0, 200)}`)
  }
  return (await res.json()) as T
}

export function fetchAnalyticsConfig(
  token: string,
  appId: string,
): Promise<AnalyticsConfig> {
  return call<AnalyticsConfig>(token, `/apps/${encodeURIComponent(appId)}/analytics`)
}

export interface UpdateAnalyticsPayload {
  ga4?: string | null
  plausible?: string | null
  custom_head?: string | null
}

export function updateAnalyticsConfig(
  token: string,
  appId: string,
  payload: UpdateAnalyticsPayload,
): Promise<AnalyticsConfig> {
  return call<AnalyticsConfig>(token, `/apps/${encodeURIComponent(appId)}/analytics`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function fetchAnalyticsStats(
  token: string,
  appId: string,
  days = 7,
  kind = 'pageview',
  bucket?: AnalyticsBucket,
  path?: string,
): Promise<StatsResponse> {
  const params = new URLSearchParams({ days: String(days), kind })
  if (bucket) params.set('bucket', bucket)
  if (path) params.set('path', path)
  return call<StatsResponse>(
    token,
    `/apps/${encodeURIComponent(appId)}/analytics/stats?${params}`,
  )
}

export function fetchAnalyticsLive(
  token: string,
  appId: string,
): Promise<LiveResponse> {
  return call<LiveResponse>(token, `/apps/${encodeURIComponent(appId)}/analytics/live`)
}

export function fetchAnalyticsDiagnostics(
  token: string,
  appId: string,
): Promise<DiagnosticsResponse> {
  return call<DiagnosticsResponse>(
    token,
    `/apps/${encodeURIComponent(appId)}/analytics/diagnostics`,
  )
}

/** Platform-wide aggregate (admin-only). Cross-app totals + top apps +
 *  countries + device split + daily/hourly series. */
export interface PlatformAnalyticsResponse {
  days: number
  bucket: AnalyticsBucket
  total_views: number
  active_apps: number
  custom_events: number
  series: Array<{ t: string; views: number }>
  top_apps: Array<{ app: string; views: number }>
  top_countries: Array<{ country: string; views: number }>
  device_split: Array<{ device: string; views: number }>
}

export function fetchPlatformAnalytics(
  token: string,
  days = 7,
): Promise<PlatformAnalyticsResponse> {
  return call<PlatformAnalyticsResponse>(
    token,
    `/analytics/admin/platform?days=${days}`,
  )
}

/** List the distinct custom event kinds (everything except 'pageview')
 *  fired in the window, sorted by count desc. Drives the "Custom events"
 *  panel — empty array means the creator hasn't called
 *  `window.pasAnalytics.event(...)` yet (or no visitors triggered it). */
export function fetchAnalyticsEvents(
  token: string,
  appId: string,
  days = 7,
): Promise<EventsResponse> {
  return call<EventsResponse>(
    token,
    `/apps/${encodeURIComponent(appId)}/analytics/events?days=${days}`,
  )
}

export function formatViewCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10000) return (n / 1000).toFixed(1) + 'k'
  if (n < 1_000_000) return Math.round(n / 1000) + 'k'
  return (n / 1_000_000).toFixed(1) + 'M'
}
