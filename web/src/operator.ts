/**
 * Operator view API client (#240) — GET /v1/apps/:id/operator. Owner-only:
 * the platform answers 401 signed out and 403 for anyone but the app's owner.
 */

import { apiFetch } from './api'

export interface OperatorContext {
  app: { id: string; createdAt: number | null }
  operator: { userId: string; login: string }
  baseline: {
    /** Distinct users holding any app role. */
    usersWithRoles: number
    activity: { days: number; activeUsers: number; sessionSeconds: number; apiCalls: number }
  }
}

export async function fetchOperatorContext(token: string, appId: string): Promise<OperatorContext> {
  return apiFetch<OperatorContext>(`/apps/${encodeURIComponent(appId)}/operator`, { token })
}
