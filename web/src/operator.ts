/**
 * Operator view API client (#240) — GET /v1/apps/:id/operator. Owner-only:
 * the platform answers 401 signed out and 403 for anyone but the app's owner.
 *
 * `contract` is the app's declared operator view (mcp.json `operator_view`,
 * validated by the platform) or null. Resources are read and row actions run
 * through the owner-only operator routes, which return only the declared
 * columns/fields and build action params from declared columns. All use the
 * owner's session, so the app's role gates, step-up and audit apply.
 */

import { apiFetch, ApiError, API_BASE, authHeaders } from './api'
import { formatDuration } from './usage'

export type OperatorResourceKind = 'users' | 'reports' | 'suspensions' | 'verification' | 'metrics'
export type OperatorColumnFormat = 'text' | 'number' | 'datetime' | 'boolean' | 'badge'

export interface OperatorColumn { key: string; label: string; format: OperatorColumnFormat }

export interface OperatorResource {
  id: string
  kind: OperatorResourceKind
  title: string
  description: string | null
  action: string
  columns: OperatorColumn[]
  /** Users only (absent on contracts stored before search/paging existed). */
  search?: { param: string } | null
  page?: { param: string; column: string; size: number } | null
  detail?: {
    action: string
    param: string
    key: string
    fields: OperatorColumn[]
    step_up: boolean
    /** Verification only: fields that are documents. The record carries true/false for each, never a path. */
    evidence?: { field: string; label: string }[] | null
  } | null
  /** A status workflow; `param` set means the list can be filtered by state. */
  status?: { column: string; states: { value: string; label: string }[]; param: string | null } | null
  /** Listed per record of another resource (e.g. a member's suspension history). */
  related?: { resource: string; param: string } | null
  /** Metrics only: an app-wide time series, read through fetchOperatorSeries. */
  series?: OperatorSeries | null
}

export type SeriesGrain = 'day' | 'week' | 'month'
export const SERIES_GRAINS: SeriesGrain[] = ['day', 'week', 'month']
export type SeriesUnit = 'count' | 'percent' | 'seconds' | 'bytes' | 'currency'
type SeriesAggregation = 'sum' | 'avg' | 'min' | 'max'

interface SeriesMeasure { column: string; label: string; unit: SeriesUnit; currency: string | null; aggregation: SeriesAggregation }

export interface OperatorSeries {
  time: { column: string; grain: SeriesGrain }
  range: { from_param: string; to_param: string; default_days: number; max_days: number }
  measures: SeriesMeasure[]
  dimension: { column: string; label: string; max_values: number } | null
}

/** One metric time series as the platform rolls it up: every bucket of the range, null where it had no rows. */
export interface OperatorSeriesData {
  from: string
  to: string
  grain: SeriesGrain
  buckets: string[]
  dimension: { column: string; label: string } | null
  omitted: number
  measures: (SeriesMeasure & {
    summary: number | null
    series: { dimension: string | null; summary: number | null; values: (number | null)[] }[]
  })[]
}

export interface OperatorAction {
  id: string
  title: string
  resource: string
  action: string
  /** Action param → column of the row it runs on. */
  params: Record<string, string>
  confirm: string
  step_up: boolean
  /** Offered only on rows whose status is in `from`. */
  transition?: { from: string[]; to: string } | null
  /** Irreversible or account-affecting; always needs a recent sign-in. */
  destructive?: boolean
  target?: string | null
}

export interface OperatorContract {
  version: 1
  resources: OperatorResource[]
  actions: OperatorAction[]
}

export interface OperatorContext {
  app: { id: string; createdAt: number | null }
  operator: { userId: string; login: string }
  baseline: {
    /** Distinct users holding any app role. */
    usersWithRoles: number
    activity: { days: number; activeUsers: number; sessionSeconds: number; apiCalls: number }
  }
  contract: OperatorContract | null
}

export type OperatorRow = Record<string, unknown>

/** Panels in the order the console shows them, with their headings. */
export const OPERATOR_KINDS: { kind: OperatorResourceKind; label: string }[] = [
  { kind: 'metrics', label: 'Metrics' },
  { kind: 'users', label: 'Users' },
  { kind: 'reports', label: 'Reports' },
  { kind: 'suspensions', label: 'Suspensions' },
  { kind: 'verification', label: 'ID verification' },
]

export async function fetchOperatorContext(token: string, appId: string): Promise<OperatorContext> {
  return apiFetch<OperatorContext>(`/apps/${encodeURIComponent(appId)}/operator`, { token })
}

/** One page of a declared resource: declared columns only. `q` / `cursor` only where declared. */
export async function fetchOperatorRows(
  token: string,
  appId: string,
  resourceId: string,
  opts: { q?: string; cursor?: string | null; status?: string | null; related?: string | null } = {},
): Promise<{ rows: OperatorRow[]; next_cursor: string | null }> {
  const qs = new URLSearchParams()
  if (opts.q) qs.set('q', opts.q)
  if (opts.cursor) qs.set('cursor', opts.cursor)
  if (opts.status) qs.set('status', opts.status)
  if (opts.related) qs.set('related', opts.related)
  const query = qs.toString()
  return apiFetch(`/apps/${encodeURIComponent(appId)}/operator/resources/${encodeURIComponent(resourceId)}${query ? `?${query}` : ''}`, { token })
}

/** One record of a declared resource: its declared detail fields only. */
export async function fetchOperatorRecord(token: string, appId: string, resourceId: string, key: string): Promise<{ record: OperatorRow }> {
  return apiFetch(`/apps/${encodeURIComponent(appId)}/operator/resources/${encodeURIComponent(resourceId)}/records/${encodeURIComponent(key)}`, { token })
}

/**
 * One evidence document of a verification record, as a Blob. The platform
 * resolves the document from the record itself; the console never sees a path.
 */
export async function fetchOperatorEvidence(token: string, appId: string, resourceId: string, key: string, field: string): Promise<Blob> {
  const res = await fetch(
    `${API_BASE}/apps/${encodeURIComponent(appId)}/operator/resources/${encodeURIComponent(resourceId)}/records/${encodeURIComponent(key)}/evidence/${encodeURIComponent(field)}`,
    { headers: authHeaders(token) },
  )
  if (!res.ok) {
    const text = await res.text()
    let body: unknown = text
    try { body = JSON.parse(text) } catch { /* plain text error */ }
    throw new ApiError(res.status, body)
  }
  return res.blob()
}

/** A metric time series over [from, to] (UTC dates) at `grain`. */
export async function fetchOperatorSeries(
  token: string,
  appId: string,
  resourceId: string,
  opts: { from: string; to: string; grain: SeriesGrain },
): Promise<OperatorSeriesData> {
  const qs = new URLSearchParams({ from: opts.from, to: opts.to, grain: opts.grain })
  return apiFetch(`/apps/${encodeURIComponent(appId)}/operator/metrics/${encodeURIComponent(resourceId)}?${qs}`, { token })
}

/** A measure value in its declared unit. Percent values are 0-100. */
export function formatMeasure(value: number | null, unit: SeriesUnit, currency: string | null = null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  if (unit === 'percent') return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
  if (unit === 'seconds') return formatDuration(value)
  if (unit === 'currency' && currency) return value.toLocaleString(undefined, { style: 'currency', currency })
  if (unit === 'bytes') {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let n = value
    let i = 0
    while (Math.abs(n) >= 1024 && i < units.length - 1) { n /= 1024; i++ }
    return `${n.toLocaleString(undefined, { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/** Run a declared row action on `row` (as displayed). The platform maps its params from declared columns. */
export async function runOperatorRowAction(token: string, appId: string, actionId: string, row: OperatorRow): Promise<{ ok: boolean; changes: number }> {
  return apiFetch(`/apps/${encodeURIComponent(appId)}/operator/actions/${encodeURIComponent(actionId)}`, {
    token,
    method: 'POST',
    body: JSON.stringify({ row }),
  })
}

/** Whether `action` is offered on `row`: a transition only from one of its `from` states. */
export function actionAvailable(action: OperatorAction, resource: OperatorResource, row: OperatorRow): boolean {
  if (!action.transition) return true
  const status = resource.status ? row[resource.status.column] : undefined
  return typeof status === 'string' && action.transition.from.includes(status)
}

/** A state's label, or the raw value when the app did not declare it. */
export function statusLabel(resource: OperatorResource, value: unknown): string | null {
  return resource.status?.states.find((s) => s.value === value)?.label ?? null
}

/** True when a refusal can be fixed by signing in again (the action needs a recent sign-in). */
export function needsReauth(e: unknown): boolean {
  return e instanceof ApiError && e.message === 'step_up_required'
}

/** A cell as plain text. Values come from the app; they are never rendered as HTML. */
export function formatCell(value: unknown, format: OperatorColumnFormat): string {
  if (value === null || value === undefined || value === '') return '—'
  if (format === 'boolean') return value === true || value === 1 || value === '1' || value === 'true' ? 'Yes' : 'No'
  if (format === 'number' && Number.isFinite(Number(value))) return Number(value).toLocaleString()
  if (format === 'datetime') {
    // Epoch seconds or milliseconds, or an ISO string.
    const n = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(String(value))
    if (Number.isFinite(n)) return new Date(n).toLocaleString()
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/** Why an operator read or action failed, in words the owner can act on. */
export function operatorErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.message === 'step_up_required') return 'This needs a recent sign-in. Sign in again, then retry.'
    if (e.status === 403 && /app role/.test(e.message)) {
      return "You don't hold the app role this needs. Grant it to yourself under Settings → Access."
    }
    if (e.status === 401) return 'Your session has expired. Sign in again.'
    if (e.status === 404 && e.message === 'record not found') return 'This record no longer exists.'
  }
  return (e as Error).message
}
