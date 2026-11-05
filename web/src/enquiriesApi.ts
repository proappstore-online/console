import { apiFetch } from './api'

/** An enquiry sent from the app's about- site (platform#412). Times are epoch ms. */
export interface Enquiry {
  id: string
  /** 'team_join' = a request to join the app's team (platform#542); absent on older responses = general. */
  type?: EnquiryType
  name: string
  email: string
  message: string
  status: EnquiryStatus
  created_at: number
  handled_at: number | null
  handled_by: string | null
}

export type EnquiryStatus = 'new' | 'handled'
export type EnquiryType = 'general' | 'team_join'
export interface EnquiryCursor { before_id: string }

export interface EnquiryPage {
  enquiries: Enquiry[]
  counts: { new: number; total: number }
  /** Whole-inbox new counts per type, whatever the filter (platform#542); absent on older responses. */
  new_general_count?: number
  new_team_join_count?: number
  next?: EnquiryCursor | null
}

const base = (appId: string) => `/apps/${encodeURIComponent(appId)}/enquiries`

/** Owner-only, newest first. Prefer the stable cursor returned by the API. */
export function fetchEnquiries(appId: string, token: string | null, opts: { status?: EnquiryStatus; type?: EnquiryType; before_id?: string; before?: number; limit?: number } = {}) {
  const params = new URLSearchParams()
  if (opts.status) params.set('status', opts.status)
  if (opts.type) params.set('type', opts.type)
  if (opts.before !== undefined) params.set('before', String(opts.before))
  if (opts.before_id !== undefined) params.set('before_id', opts.before_id)
  if (opts.limit !== undefined) params.set('limit', String(opts.limit))
  const q = params.toString()
  return apiFetch<EnquiryPage>(`${base(appId)}${q ? `?${q}` : ''}`, { token })
}

export function setEnquiryStatus(appId: string, token: string | null, id: string, status: EnquiryStatus) {
  return apiFetch<{ id: string; status: EnquiryStatus }>(`${base(appId)}/${encodeURIComponent(id)}`, {
    token, method: 'PATCH', body: JSON.stringify({ status }),
  })
}
