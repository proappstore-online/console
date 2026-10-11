import { apiFetch } from './api'

/** Wire shapes of platform/packages/backend/src/routes/app-workers.ts, hooks.ts and scheduled-runs.ts (#261). */
export interface WorkerRow {
  enabled: number
  backend?: string | null
  deployed_sha?: string | null
  deployed_ref?: string | null
  deployed_at?: number | null
  rotation_overlap_until?: number | null
}
export interface WorkerDeploy { repository: string; ref: string; sha: string; status: string; detail: string | null; created_at: number }
export interface WorkerInvocation {
  id: string; type: string; name: string | null; attempt: number; status: string; http_status: number | null
  error: string | null; pas_calls: number | null; started_at: number; finished_at: number | null
}
export interface WorkerSchedule { name: string; cron: string; consecutive_failures: number | null; schedule_disabled_at: number | null }
export interface WorkerStatus {
  app_id: string
  worker: WorkerRow
  last_deploy: WorkerDeploy | null
  invocations: WorkerInvocation[]
  schedules: WorkerSchedule[]
}

export type QuotaName = 'invocations' | 'cpu_ms' | 'hook_deliveries'
export interface WorkerUsageDay { day: string; invocations: number; cpu_ms: number; hook_deliveries: number; pas_calls: number; log_entries: number }
export interface WorkerUsage {
  quotas: Record<QuotaName, number>
  cpu_ms_source: 'wall' | 'cpu' | string
  worker_log_limit: number
  today: WorkerUsageDay
  days: WorkerUsageDay[]
}

export type RunStatus = 'due' | 'claimed' | 'queued' | 'succeeded' | 'failed'
export interface ScheduledRun {
  run_id: string; action_name: string; source: string; due_at: number; claimed_at: number | null
  finished_at: number | null; status: RunStatus | string; changes: number | null; error: string | null
}

export interface AppHook {
  name: string
  /** null for github-app hooks, which the platform's GitHub App feeds. */
  url: string | null
  verify_kind: string
  secret_name: string | null
  /** Whether the named secret exists — the value is never sent. null when the hook needs none. */
  secret_set: boolean | null
}

export type DeliveryStatus = 'received' | 'delivered' | 'failed' | 'quota_exceeded'
export interface HookDelivery {
  id: string; hook: string; delivery_id: string; event: string | null; received_at: number
  status: DeliveryStatus | string; attempts: number; finished_at: number | null; error: string | null
}

const app = (appId: string) => `/apps/${encodeURIComponent(appId)}`

function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const getWorker = (appId: string, token: string | null) =>
  apiFetch<WorkerStatus>(`${app(appId)}/worker`, { token })

export const getWorkerUsage = (appId: string, token: string | null, days = 30) =>
  apiFetch<WorkerUsage>(`${app(appId)}/worker/usage${query({ days })}`, { token })

export const rotateWorkerKey = (appId: string, token: string | null) =>
  apiFetch<{ ok: true; config_version: number }>(`${app(appId)}/worker/rotate`, { token, method: 'POST' })

export const runScheduleNow = (appId: string, name: string, token: string | null) =>
  apiFetch<{ run_id: string; status: 'queued' }>(`${app(appId)}/worker/schedules/${encodeURIComponent(name)}/run`, { token, method: 'POST' })

export const getScheduledRuns = (appId: string, token: string | null, params: { status?: string; limit?: number } = {}) =>
  apiFetch<{ runs: ScheduledRun[] }>(`${app(appId)}/scheduled-runs${query(params)}`, { token })

export const getHooks = (appId: string, token: string | null) =>
  apiFetch<{ hooks: AppHook[] }>(`${app(appId)}/hooks`, { token })

export const getHookDeliveries = (appId: string, token: string | null, params: { hook?: string; status?: string; limit?: number } = {}) =>
  apiFetch<{ deliveries: HookDelivery[] }>(`${app(appId)}/hook-deliveries${query(params)}`, { token })

/** Platform admin only. */
export const setWorkerEnabled = (appId: string, enabled: boolean, token: string | null) =>
  apiFetch<{ ok: true; enabled: boolean }>(`/admin/apps/${encodeURIComponent(appId)}/worker-enabled`, {
    token, method: 'PUT', body: JSON.stringify({ enabled }),
  })

/** Whether the caller may use the app (#259) — the owner always may; `mode` is the manifest's visibility. */
export const getVisibility = (appId: string, token: string | null) =>
  apiFetch<{ mode: string; allowed: boolean }>(`${app(appId)}/visibility/me`, { token })
