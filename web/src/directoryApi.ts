// App directory (platform#424): GET /v1/apps/directory, and the recovery request
// (platform#423) the directory offers for an id that exists but is not yours.

import { apiFetch } from './api'

export const LIFECYCLES = ['draft', 'provisioned', 'deployed', 'live', 'failed', 'unpublished', 'archived'] as const
export type Lifecycle = (typeof LIFECYCLES)[number]
export const ACCESS_FILTERS = ['mine', 'team', 'operator', 'transfer', 'inaccessible'] as const
export type AccessFilter = (typeof ACCESS_FILTERS)[number]
export type AccessLevel = 'owner' | 'team' | 'operator' | 'transfer_recipient' | 'inaccessible'
export type LookupStatus = 'yours' | 'accessible' | 'exists_inaccessible' | 'unclaimed' | 'reserved' | 'invalid'

export interface DirectoryItem {
  id: string
  displayName: string
  lifecycle: Lifecycle | null
  deployStatus: 'not_provisioned' | 'provisioning' | 'provision_failed' | 'deployed' | 'not_deployed' | null
  lastDeployAt: number | null
  submissionStatus: string | null
  accessLevel: AccessLevel
  teamRole: string | null
  pendingTransfer: 'incoming' | 'outgoing' | null
  routeUrl: string
  /** Never stored by the platform; null unless something checked it live. */
  routeHealth: 'ok' | 'down' | 'timeout' | null
  repoRef: string | null
  links: { details: string | null; deployHistory: string | null; ownership: string; storePage: string | null; repository: string | null }
  createdAt: number | null
}

export interface DirectoryResult {
  query: string | null
  lookup: { id: string; status: LookupStatus } | null
  total: number
  items: DirectoryItem[]
  truncated: boolean
}

export interface DirectoryQuery {
  q?: string
  status?: Lifecycle[]
  access?: AccessFilter[]
  limit?: number
}

export function directoryPath({ q, status, access, limit }: DirectoryQuery): string {
  const params = new URLSearchParams()
  if (q?.trim()) params.set('q', q.trim())
  if (status?.length) params.set('status', status.join(','))
  if (access?.length) params.set('access', access.join(','))
  if (limit !== undefined) params.set('limit', String(limit))
  const qs = params.toString()
  return `/apps/directory${qs ? `?${qs}` : ''}`
}

export function fetchDirectory(token: string | null, query: DirectoryQuery): Promise<DirectoryResult> {
  return apiFetch<DirectoryResult>(directoryPath(query), { token })
}

/** Ask a platform admin to recover an app made under another sign-in. Never moves ownership by itself. */
export function requestRecovery(appId: string, token: string | null, evidence: string): Promise<unknown> {
  return apiFetch(`/apps/${encodeURIComponent(appId)}/ownership/recovery`, {
    token,
    method: 'POST',
    body: JSON.stringify({ evidence }),
  })
}
