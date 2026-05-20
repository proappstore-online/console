/**
 * Usage API client — matches the PAS backend's /v1/apps/:id/usage
 * and /v1/usage/me contract.
 *
 * Both endpoints use the FAS session bearer token (from `pro.auth.token`).
 */

const API_BASE = 'https://api.proappstore.online/v1'

export interface UsageDay {
  /** YYYY-MM-DD */
  day: string
  sessionSeconds: number
  apiCalls: number
  users: number
}

export interface UsageTotals {
  sessionSeconds: number
  apiCalls: number
  users: number
}

export interface UsageResponse {
  appId: string
  days: number
  /** Ascending by day, zero-filled across the requested window. */
  series: UsageDay[]
  totals: UsageTotals
}

export interface MyUsageAppEntry {
  appId: string
  sessionSeconds: number
  apiCalls: number
}

export interface MyUsageResponse {
  userId: string
  days: number
  perApp: MyUsageAppEntry[]
  totals: { sessionSeconds: number; apiCalls: number }
}

function bearer(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` }
}

export async function fetchAppUsage(
  token: string,
  appId: string,
  days = 30,
): Promise<UsageResponse> {
  const res = await fetch(
    `${API_BASE}/apps/${encodeURIComponent(appId)}/usage?days=${days}`,
    { headers: bearer(token) },
  )
  if (!res.ok) throw new Error(`fetchAppUsage failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as UsageResponse
}

export async function fetchMyUsage(token: string, days = 30): Promise<MyUsageResponse> {
  const res = await fetch(`${API_BASE}/usage/me?days=${days}`, { headers: bearer(token) })
  if (!res.ok) throw new Error(`fetchMyUsage failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as MyUsageResponse
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a count of seconds into a compact human-readable duration.
 *  - < 60s         -> "12 sec"
 *  - < 60 min      -> "42 min"
 *  - >= 60 min     -> "21 hr 5 min"
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 min'
  const totalMinutes = Math.round(seconds / 60)
  if (totalMinutes < 1) return `${Math.round(seconds)} sec`
  if (totalMinutes < 60) return `${formatNumber(totalMinutes)} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) return `${formatNumber(hours)} hr`
  return `${formatNumber(hours)} hr ${minutes} min`
}

/** "1234" -> "1,234". */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return Math.round(n).toLocaleString('en-US')
}

/** "1234 min" with thousands-separator. */
export function formatMinutes(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60))
  return `${formatNumber(minutes)} min`
}

/** Day-of-week label for a YYYY-MM-DD string ("M", "T", "W", "T", "F", "S", "S"). */
export function dayOfWeekLabel(ymd: string): string {
  // Parse as UTC to keep the label stable regardless of viewer timezone — the
  // backend's `day` strings are already calendar-bucketed.
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10))
  if (!y || !m || !d) return '?'
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][dow] ?? '?'
}
