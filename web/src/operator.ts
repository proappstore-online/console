/**
 * Operator view API client (#240) — GET /v1/apps/:id/operator. Owner-only:
 * the platform answers 401 signed out and 403 for anyone but the app's owner.
 *
 * `contract` is the app's declared operator view (mcp.json `operator_view`,
 * validated by the platform) or null. Resources are read through the
 * owner-only operator resource routes, which return only the declared
 * columns/fields; row actions run through the ordinary actions route. Both use
 * the owner's session, so the app's role gates, step-up and audit apply.
 */

import { apiFetch, ApiError } from './api'

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
  detail?: { action: string; param: string; key: string; fields: OperatorColumn[]; step_up: boolean } | null
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
  opts: { q?: string; cursor?: string | null } = {},
): Promise<{ rows: OperatorRow[]; next_cursor: string | null }> {
  const qs = new URLSearchParams()
  if (opts.q) qs.set('q', opts.q)
  if (opts.cursor) qs.set('cursor', opts.cursor)
  const query = qs.toString()
  return apiFetch(`/apps/${encodeURIComponent(appId)}/operator/resources/${encodeURIComponent(resourceId)}${query ? `?${query}` : ''}`, { token })
}

/** One record of a declared resource: its declared detail fields only. */
export async function fetchOperatorRecord(token: string, appId: string, resourceId: string, key: string): Promise<{ record: OperatorRow }> {
  return apiFetch(`/apps/${encodeURIComponent(appId)}/operator/resources/${encodeURIComponent(resourceId)}/records/${encodeURIComponent(key)}`, { token })
}

/** Run one of the app's registered actions as the signed-in owner. */
export async function runOperatorAction(
  token: string,
  appId: string,
  action: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  return apiFetch(`/apps/${encodeURIComponent(appId)}/actions/${encodeURIComponent(action)}`, {
    token,
    method: 'POST',
    body: JSON.stringify({ params }),
  })
}

/** Params for a row action, taken from the columns the contract maps them to. */
export function rowParams(action: OperatorAction, row: OperatorRow): Record<string, unknown> {
  return Object.fromEntries(Object.entries(action.params).map(([param, column]) => [param, row[column]]))
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
    if (e.message === 'step_up_required') return 'This needs a recent sign-in. Sign out and back in, then try again.'
    if (e.status === 403 && /app role/.test(e.message)) {
      return "You don't hold the app role this needs. Grant it to yourself under Settings → Access."
    }
    if (e.status === 401) return 'Your session has expired. Sign in again.'
    if (e.status === 404 && e.message === 'record not found') return 'This record no longer exists.'
  }
  return (e as Error).message
}
