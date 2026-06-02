// Console data-fetch helpers — wrap the platform + agents APIs and degrade
// gracefully (empty list / false) on auth or network errors.

import type { AppEntry } from './nav'
import { API_BASE } from './api'

interface AppApiRow {
  id: string
  creator_id: string
  created_at: number
  d1_database_id: string
  name: string
  category: string | null
  description: string | null
  icon: string | null
  icon_bg: string | null
  pro_features: string[] | null
  has_submission: boolean
  submission_status: string | null
}

/**
 * Fetch the signed-in user's apps from the platform API. Source of truth is
 * the `apps` table (every successful `pas create` / `pas publish` /
 * `/v1/submissions/:id/approve` INSERTs a row). Falls back to an empty list
 * on auth or network errors so the UI degrades gracefully.
 */
export async function fetchApps(token: string | null): Promise<AppEntry[]> {
  if (!token) return []
  const res = await fetch(`${API_BASE}/apps`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return []
  const data = (await res.json()) as { apps: AppApiRow[] }
  return (data.apps ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    createdAt: new Date(a.created_at).toISOString(),
    category: a.category,
    description: a.description,
    hasSubmission: a.has_submission,
    submissionStatus: a.submission_status,
  }))
}

/** The caller's agent-teams projects (in-progress apps being built by agents). */
export async function fetchAgentProjects(token: string | null): Promise<{ slug: string; name: string; createdAt: number }[]> {
  if (!token) return []
  try {
    const res = await fetch('https://agents.proappstore.online/v1/projects', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return []
    const data = (await res.json()) as { projects: { slug: string; name: string; createdAt: number }[] }
    return data.projects ?? []
  } catch {
    return []
  }
}

export async function deleteAppApi(token: string | null, id: string): Promise<boolean> {
  if (!token) return false
  const res = await fetch(`${API_BASE}/apps/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.ok
}

/**
 * Probe whether the signed-in user is a platform admin. Backed by
 * `GET /v1/me/is-admin` which checks ADMIN_GITHUB_IDS — same membership
 * the approve/reject gates use, so this is authoritative (not a heuristic).
 * Falls back to `false` on any error so a flaky network never accidentally
 * shows the Admin tab.
 */
export async function fetchIsAdmin(token: string | null): Promise<boolean> {
  if (!token) return false
  try {
    const res = await fetch(`${API_BASE}/me/is-admin`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return false
    const data = (await res.json()) as { admin?: boolean }
    return data.admin === true
  } catch {
    return false
  }
}

export interface Pricing {
  proMonthly: { priceId: string; currency: string; dollars: number } | null
}

export async function fetchPricing(): Promise<Pricing | null> {
  try {
    const res = await fetch(`${API_BASE}/pricing`)
    if (!res.ok) return null
    return (await res.json()) as Pricing
  } catch {
    return null
  }
}
