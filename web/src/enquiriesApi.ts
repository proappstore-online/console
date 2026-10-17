import { apiFetch } from './api'

/** An enquiry sent from the app's about- site (platform#412). Times are epoch ms. */
export interface Enquiry {
  id: string
  name: string
  email: string
  message: string
  status: EnquiryStatus
  created_at: number
  handled_at: number | null
  handled_by: string | null
}

export type EnquiryStatus = 'new' | 'handled'

export interface EnquiryPage {
  enquiries: Enquiry[]
  counts: { new: number; total: number }
}

const base = (appId: string) => `/apps/${encodeURIComponent(appId)}/enquiries`

/** Owner-only, newest first. `before` is the created_at of the last row already shown. */
export function fetchEnquiries(appId: string, token: string | null, opts: { status?: EnquiryStatus; before?: number; limit?: number } = {}) {
  const params = new URLSearchParams()
  if (opts.status) params.set('status', opts.status)
  if (opts.before !== undefined) params.set('before', String(opts.before))
  if (opts.limit !== undefined) params.set('limit', String(opts.limit))
  const q = params.toString()
  return apiFetch<EnquiryPage>(`${base(appId)}${q ? `?${q}` : ''}`, { token })
}

export function setEnquiryStatus(appId: string, token: string | null, id: string, status: EnquiryStatus) {
  return apiFetch<{ id: string; status: EnquiryStatus }>(`${base(appId)}/${encodeURIComponent(id)}`, {
    token, method: 'PATCH', body: JSON.stringify({ status }),
  })
}
