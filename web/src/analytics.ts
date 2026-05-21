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
  stats: AnalyticsStats
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
): Promise<StatsResponse> {
  return call<StatsResponse>(
    token,
    `/apps/${encodeURIComponent(appId)}/analytics/stats?days=${days}`,
  )
}

export function formatViewCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10000) return (n / 1000).toFixed(1) + 'k'
  if (n < 1_000_000) return Math.round(n / 1000) + 'k'
  return (n / 1_000_000).toFixed(1) + 'M'
}
