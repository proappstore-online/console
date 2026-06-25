/**
 * Custom-domain API client — matches the PAS backend's domain routes:
 *   POST   /v1/apps/:id/domains                      → attach
 *   GET    /v1/apps/:id/domains                      → list (cached state)
 *   POST   /v1/apps/:id/domains/:domain/verify       → re-check CF, persist
 *   DELETE /v1/apps/:id/domains/:domain              → detach
 *
 * Uses the same bearer-token auth as the rest of the console. PAS does
 * no background polling — the owner triggers refresh explicitly by
 * clicking Verify (or attaching again).
 *
 * Buying a domain isn't supported yet (see
 * docs/custom-domain-purchase-plan.md in pas/platform).
 */

import { API_BASE } from './api'

export interface DomainInstructions {
  /** apex (root) domain — can't use a raw CNAME at most registrars. */
  apex: boolean
  /** The CNAME to add (null for apex — see the apex note). */
  cname: { name: string; value: string } | null
  cnameTarget: string
  /** TXT records for ownership / SSL validation. */
  txt: { name: string; value: string }[]
}

export interface Domain {
  domain: string
  status: 'pending' | 'active' | 'failed'
  /** 'worker' = the domain's zone is already on Cloudflare (instant, no DNS
   *  records for the owner). 'saas' = external DNS — add the records in
   *  `instructions`. */
  method: 'worker' | 'saas' | null
  cfStatus: string | null
  instructions: DomainInstructions | null
  addedAt: number
  verifiedAt: number | null
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

export function listDomains(token: string, appId: string): Promise<{ domains: Domain[] }> {
  return call(token, `/apps/${encodeURIComponent(appId)}/domains`)
}

export function attachDomain(
  token: string,
  appId: string,
  domain: string,
): Promise<{ domain: Domain }> {
  return call(token, `/apps/${encodeURIComponent(appId)}/domains`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain }),
  })
}

export function verifyDomain(
  token: string,
  appId: string,
  domain: string,
): Promise<{ domain: Domain }> {
  return call(token, `/apps/${encodeURIComponent(appId)}/domains/${encodeURIComponent(domain)}/verify`, {
    method: 'POST',
  })
}

export function removeDomain(
  token: string,
  appId: string,
  domain: string,
): Promise<{ ok: true; domain: string }> {
  return call(token, `/apps/${encodeURIComponent(appId)}/domains/${encodeURIComponent(domain)}`, {
    method: 'DELETE',
  })
}
