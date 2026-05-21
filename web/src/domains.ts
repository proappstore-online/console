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

const API_BASE = 'https://api.proappstore.online/v1'

export interface VerificationData {
  status?: string
  error_message?: string
}
export interface ValidationData {
  status?: string
  method?: string
  txt_name?: string
  txt_value?: string
  error_message?: string
}

export interface Domain {
  domain: string
  status: 'pending' | 'active' | 'failed'
  cfStatus: string | null
  verificationData: VerificationData | null
  validationData: ValidationData | null
  certificateAuthority: string | null
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

/** CF Pages project name for a PAS app — owner needs this as the CNAME target. */
export function cnameTarget(appId: string): string {
  return `proappstore-${appId}.pages.dev`
}
