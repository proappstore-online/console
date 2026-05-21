/**
 * Analytics API client — matches the PAS backend's analytics routes:
 *   GET  /v1/apps/:id/analytics          → current config
 *   PUT  /v1/apps/:id/analytics          → update BYO tags
 *   GET  /v1/apps/:id/analytics/stats    → aggregated stats
 *
 * Uses the same bearer-token auth as the rest of the console.
 */

const API_BASE = 'https://api.proappstore.online/v1'

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
  daily: Array<{ day: string; views: number }>
  top_paths: Array<{ path: string; views: number }>
  top_referrers: Array<{ referrer: string; views: number }>
  top_countries: Array<{ country: string; views: number }>
  device_split: Array<{ device: string; views: number }>
}

export interface StatsResponse {
  appId: string
  days: number
  /** Echoes back the kind that was queried — useful when the same component
   *  re-uses the response to render a heading like "purchase events". */
  kind: string
  stats: AnalyticsStats
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
): Promise<StatsResponse> {
  const params = new URLSearchParams({ days: String(days), kind })
  return call<StatsResponse>(
    token,
    `/apps/${encodeURIComponent(appId)}/analytics/stats?${params}`,
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
