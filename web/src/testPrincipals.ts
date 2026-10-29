// Admin API client for managed test principals and their least-privilege CI
// OIDC grants (platform#432). Matches packages/backend/src/routes/oidc-session.ts.

import { apiFetch } from './api'

export interface TestPrincipal {
  id: string
  slug: string
  user_id: string
  description: string | null
  status: 'active' | 'disabled'
  created_by: string
  created_at: number
  disabled_at: number | null
  updated_at: number | null
}

export interface OidcGrant {
  id: string
  repository: string
  workflow: string | null
  ref: string
  user_id: string
  label: string | null
  created_by: string
  created_at: number
  revoked_at: number | null
  last_minted_at: number | null
  mint_count: number
  principal_id: string | null
  environment: string | null
  expires_at: number | null
  session_ttl_seconds: number | null
  scope: string | null
}

export interface PrincipalEvent {
  id: number
  principal_id: string | null
  grant_id: string | null
  action: string
  actor: string
  detail: string
  at: number
  request_id: string
  reason: string | null
}

export function fetchTestPrincipals(token: string | null): Promise<{ principals: TestPrincipal[]; next_cursor: string | null }> {
  return apiFetch('/admin/test-principals?limit=100', { method: 'GET', token })
}

export function fetchTestPrincipal(token: string | null, id: string): Promise<{ principal: TestPrincipal; grants: OidcGrant[] }> {
  return apiFetch(`/admin/test-principals/${encodeURIComponent(id)}`, { method: 'GET', token })
}

export function createTestPrincipal(token: string | null, slug: string, description: string | null): Promise<{ principal: TestPrincipal }> {
  return apiFetch('/admin/test-principals', { method: 'POST', token, body: JSON.stringify({ slug, description }) })
}

export function setTestPrincipalStatus(token: string | null, id: string, enable: boolean): Promise<{ ok: boolean }> {
  return apiFetch(`/admin/test-principals/${encodeURIComponent(id)}/${enable ? 'enable' : 'disable'}`, {
    method: 'POST',
    token,
    body: JSON.stringify({}),
  })
}

export function fetchPrincipalEvents(token: string | null, principalId: string): Promise<{ events: PrincipalEvent[]; next_cursor: string | null }> {
  return apiFetch(`/admin/test-principal-events?principal_id=${encodeURIComponent(principalId)}&limit=50`, { method: 'GET', token })
}

export interface NewGrantInput {
  principal_id: string
  repository: string
  workflow: string
  ref?: string
  environment?: string
  expires_at: number
  session_ttl_seconds?: number
  scope?: 'user' | 'creator'
}

export function createGrant(token: string | null, input: NewGrantInput): Promise<{ grant: OidcGrant }> {
  return apiFetch('/admin/oidc-session-grants', { method: 'POST', token, body: JSON.stringify(input) })
}

export function revokeGrant(token: string | null, id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/admin/oidc-session-grants/${encodeURIComponent(id)}`, { method: 'DELETE', token, body: JSON.stringify({}) })
}
