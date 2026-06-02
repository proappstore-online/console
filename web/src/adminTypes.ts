import type { Submission, SubmissionStatus } from './PublishView'

// ---------------------------------------------------------------------------
// Admin view — shared types + constants for the submission review queue.
// ---------------------------------------------------------------------------

export type Filter = SubmissionStatus | 'all'

export const FILTERS: { key: Filter; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'published', label: 'Published' },
  { key: 'all', label: 'All' },
]

export interface ProvisionStep {
  name?: string
  step?: string
  status?: string
  ok?: boolean
  detail?: string
  message?: string
  error?: string
}

export interface ProvisionResult {
  success?: boolean
  steps?: ProvisionStep[]
  error?: string
  [k: string]: unknown
}

export interface ApproveResponse {
  submission: Submission
  provisionResult: ProvisionResult | null
}
