// ---------------------------------------------------------------------------
// Types — mirror the PAS submissions API contract
// ---------------------------------------------------------------------------

export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'published'

export interface Submission {
  id: string
  app_id: string
  creator_id: string
  status: SubmissionStatus
  name: string
  category: string
  description: string
  icon: string | null
  icon_bg: string | null
  pro_features: string[] | null
  suggested_monthly_price_cents: number | null
  repo_url: string | null
  reviewer_id: string | null
  rejection_reason: string | null
  created_at: string
  reviewed_at: string | null
}

export interface SubmissionCreate {
  appId: string
  name: string
  category: string
  description: string
  icon?: string
  iconBg?: string
  proFeatures?: string[]
  suggestedMonthlyPriceCents?: number
  repoUrl?: string
}

export const CATEGORIES = [
  'productivity',
  'social',
  'transport',
  'marketplace',
  'utilities',
  'finance',
  'education',
  'entertainment',
  'other',
] as const

export const DEFAULT_ICON = '\u{1F4CB}'
export const DEFAULT_ICON_BG = '#ede9fe'
