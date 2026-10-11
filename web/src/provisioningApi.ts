import { apiFetch } from './api'

/** Wire shapes of platform docs/provisioning-api.md (platform#367). The server is authoritative. */

export const PROVISION_ORG = 'proappstore-online'

/** The only repository the platform provisions for an app id. */
export const repoUrlFor = (appId: string) => `https://github.com/${PROVISION_ORG}/${appId}`

export interface ProvisionIntent {
  appId: string
  name: string
  description: string
  template: string
  repoUrl: string
  templateRev?: string
}

export type PlanAction = 'create' | 'reuse_owned' | 'reuse_admin' | 'adopt_untouched' | 'refused'
export type RevisionSource = 'template_head' | 'scaffold_tree_match' | 'unknown'

export interface PlanBlocker { code: string; message: string }

export interface ProvisionPlan {
  version: number
  appId: string
  name: string
  description: string
  action: PlanAction
  repository: {
    owner: string
    name: string
    url: string
    /** null when GitHub could not be read. */
    exists: boolean | null
    /** Present only when the caller may act on the repository. */
    private?: boolean | null
    headSha?: string | null
    untouchedScaffold?: boolean
  }
  appRecord: 'none' | 'owner' | 'other' | 'unknown'
  template: {
    id: string
    repo: string
    ref: string
    status: string
    reviewedCommit: string | null
    requestedRevision: string | null
    revision: string | null
    revisionSource: RevisionSource
  }
  changes: string[]
  compliance: { required: boolean }
  blockers: PlanBlocker[]
  warnings: string[]
}

export interface PlanResponse { planId: string; expiresAt: number; plan: ProvisionPlan }

export interface ProvisionStep { name: string; status: string; detail: string }

export type OperationStatus = 'pending' | 'completed' | 'failed' | 'exhausted' | 'legacy_unreconciled'

export interface ProvisionOperation {
  /** null for a moment while a joined confirmation acquires the receipt. */
  receipt: string | null
  appId: string
  status: OperationStatus
  steps: ProvisionStep[]
  createdAt?: number
  updatedAt?: number
  completedAt?: number | null
  attemptCount?: number
  leaseExpiresAt?: number | null
  result?: { success?: boolean; appUrl?: string; dataWorkerUrl?: string; error?: string; [k: string]: unknown }
}

export interface ConfirmResponse extends ProvisionOperation {
  planId: string
  joined: boolean
  repoAction?: string
  succeeded?: boolean
  error?: string
  log?: string[]
}

/** Read-only preview: stores a plan bound to the caller; changes nothing else. */
export const createPlan = (token: string | null, intent: ProvisionIntent) =>
  apiFetch<PlanResponse>('/provisioning/plans', { token, method: 'POST', body: JSON.stringify(intent) })

/** Execute exactly the stored plan. Repeats join its receipt instead of running again. */
export const confirmPlan = (token: string | null, planId: string) =>
  apiFetch<ConfirmResponse>(`/provisioning/plans/${encodeURIComponent(planId)}/confirm`, { token, method: 'POST', body: '{}' })

export const fetchOperation = (token: string | null, appId: string) =>
  apiFetch<ProvisionOperation>(`/provision-operations/${encodeURIComponent(appId)}`, { token })
