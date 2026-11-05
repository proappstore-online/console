// Platform #553 readiness contract: first-party Console session; no app-bound identity.
import { apiFetch, ApiError } from './api'
import { pro } from './sdk'
export type PromoterRange = '7d' | '30d' | 'all'
export const PROMOTER_RANGES = [{ key: '7d', label: 'Last 7 days' }, { key: '30d', label: 'Last 30 days' }, { key: 'all', label: 'All time' }] as const
export type PromoterStatus = 'active' | 'suspended' | 'withdrawn'
export type ReferralStatus = 'pending' | 'confirmed' | 'expired' | 'reversed'
export interface Promoter {
  promoter_id: string; app_id: string; status: PromoterStatus; code: string
  code_active: boolean; display_name: string | null; share_path: string; share_url: string
  app_public?: boolean; status_reason: string | null
  consented_at: number; created_at: number; updated_at: number
}
export interface ReferralTracking { ready: boolean; reason: 'deployment_unverified' | 'sdk_unsupported' | 'legacy_auth' | 'synthetic_check_required' | null; protocol_version: number }
export interface ReferralReadiness { enrollment_open: boolean; referral_tracking: ReferralTracking }
export const trackingReady = (r?: Partial<ReferralReadiness> | null) => r?.referral_tracking?.ready === true && r.referral_tracking.protocol_version === 1 && r.referral_tracking.reason === null
export function readinessMessage(r?: Partial<ReferralReadiness> | null) {
  if (trackingReady(r)) return 'Referral tracking is verified for this deployment.'
  switch (r?.referral_tracking?.reason) {
    case 'sdk_unsupported': return 'This deployment uses an older or unsupported SDK. Automatic referral credit is unavailable.'
    case 'legacy_auth': return 'This deployment uses unsupported authentication or hosting. Automatic referral credit is unavailable.'
    case 'synthetic_check_required': return 'Deployment verification has not succeeded. Automatic referral credit is unavailable.'
    default: return 'Referral readiness is unknown or temporarily unavailable. Automatic referral credit is unavailable.'
  }
}
export function fetchReferralReadiness(id: string) {
  return apiFetch<ReferralReadiness>(`/storefront/promoters/apps/${encodeURIComponent(id)}/readiness`, { token: null, cache: 'no-store' })
}
export const isDenied = (e: unknown) => e instanceof ApiError && (e.status === 401 || e.status === 403)
export interface PromoterApp { id: string; name: string }
export interface Counts { pending: number; confirmed: number; reversed: number; expired: number }
export interface Share { numerator: number; denominator: number; ratio: number; percent: number; basis: string }
export interface Freshness { as_of: number; referrals_recorded_since: number | null; note: string }
export interface ContributionReport {
  version: number; app_id: string; freshness: Freshness
  contributions: {
    promotion: { promoter_status: PromoterStatus; recorded: boolean; first_confirmed_at: number | null; counts: Counts; share_of_referred_users: Share; standing: { rank: number | null; ranked_promoters: number; tied_on_count: boolean } }
    code: { available: false; reason: string }
  }
}
export interface ActivityItem { referral_id: string; status: ReferralStatus; captured_at: number; expires_at: number; activated_at: number | null; confirmed_at: number | null }
export interface Cursor { before_id: string }
export interface ActivityPage { promoter_status: PromoterStatus; counts: Pick<Counts, 'pending' | 'confirmed'>; referrals: ActivityItem[]; next: Cursor | null }
export interface Discovery { apps: { appId: string; iconUrl: string | null; tagline: string | null; category: string | null }[]; next: { after: string } | null }
export interface PromoterQuery { appId: string | null; range: PromoterRange; cursor?: string; now?: number }
export type PromoterAccess = { readiness?: ReferralReadiness | null; readinessError?: string } & ({ kind: 'choose' | 'not-enrolled'; apps: PromoterApp[]; appId: string | null } | { kind: 'enrolled'; apps: PromoterApp[]; appId: string; promoter: Promoter; report: ContributionReport; activity: ActivityPage | null; activityError?: string })
export type PromoterLoader = (q: PromoterQuery) => Promise<PromoterAccess>
export function promoterRequest<T>(path: string, init: RequestInit = {}) {
  return apiFetch<T>(path, { credentials: 'include', ...init, token: pro.auth.token })
}
export const appPath = (id: string) => `/apps/${encodeURIComponent(id)}`
export function periodQuery(range: PromoterRange, now = Date.now()) {
  return range === 'all' ? '' : `?from=${now - (range === '7d' ? 7 : 30) * 86400000}&to=${now}`
}
export function discoverApps(after?: string) {
  return apiFetch<Discovery>(`/storefront/promoters/apps?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`, { token: null })
}
export async function loadPromoterChoices() {
  const [own, first] = await Promise.all([promoterRequest<{ promoters: Promoter[] }>('/promoters/me'), discoverApps()])
  const apps = new Map<string, PromoterApp>()
  own.promoters.forEach((p) => apps.set(p.app_id, { id: p.app_id, name: p.app_id }))
  let page = first
  const seen = new Set<string>()
  for (;;) {
    page.apps.forEach((a) => apps.set(a.appId, { id: a.appId, name: a.appId }))
    if (!page.next || seen.has(page.next.after)) break
    seen.add(page.next.after); page = await discoverApps(page.next.after)
  }
  return [...apps.values()]
}
export function ownActivity(appId: string, cursor?: string) {
  return promoterRequest<ActivityPage>(`${appPath(appId)}/promoters/me/referrals?limit=50${cursor ? `&before_id=${encodeURIComponent(cursor)}` : ''}`)
}
export const loadPromoterAccess: PromoterLoader = async (q) => {
  const apps = await loadPromoterChoices()
  if (!q.appId) return { kind: 'choose', apps, appId: null }
  if (!apps.some((a) => a.id === q.appId)) apps.push({ id: q.appId, name: q.appId })
  const readiness = await fetchReferralReadiness(q.appId).then(
    (data) => ({ readiness: data, readinessError: undefined }),
    (e: unknown) => { if (isDenied(e)) throw e; return { readiness: null, readinessError: errorMessage(e) } },
  )
  let promoter: Promoter
  try { promoter = (await promoterRequest<{ promoter: Promoter }>(`${appPath(q.appId)}/promoters/me`)).promoter }
  catch (e) { if (e instanceof ApiError && e.status === 404) return { kind: 'not-enrolled', apps, appId: q.appId, ...readiness }; throw e }
  const [report, activity] = await Promise.all([
    promoterRequest<ContributionReport>(`${appPath(q.appId)}/promoters/me/contributions${periodQuery(q.range, q.now)}`),
    ownActivity(q.appId, q.cursor).then((data) => ({ data, error: undefined }), (e: unknown) => { if (isDenied(e)) throw e; return { data: null, error: errorMessage(e) } }),
  ])
  if (report.app_id !== q.appId || promoter.app_id !== q.appId) throw new Error('App context mismatch. Reload this page.')
  return { ...readiness, kind: 'enrolled', apps, appId: q.appId, promoter: { ...promoter, status: report.contributions.promotion.promoter_status }, report, activity: activity.data, activityError: activity.error }
}
export function enrollPromoter(id: string, name: string) {
  return promoterRequest<{ promoter: Promoter; created: boolean; reactivated: boolean }>(`${appPath(id)}/promoters/enroll`, { method: 'POST', body: JSON.stringify({ consent: true, display_name: name.trim(), return_path: `/#/promoter?app=${encodeURIComponent(id)}` }) })
}
export function withdrawPromoter(id: string) { return promoterRequest(`${appPath(id)}/promoters/me/withdraw`, { method: 'POST' }) }
export function renamePromoter(id: string, name: string) { return promoterRequest(`${appPath(id)}/promoters/me`, { method: 'PATCH', body: JSON.stringify({ display_name: name.trim() }) }) }
export function errorMessage(e: unknown) {
  if (e instanceof ApiError && e.message === 'referral_tracking_not_ready') return 'Referral tracking is no longer ready. Refresh and try again after deployment verification.'
  if (e instanceof ApiError && e.status === 401) return 'Your session expired. Sign in again.'
  if (e instanceof ApiError && e.status === 403) return `Access refused: ${e.message}`
  return e instanceof Error ? e.message : 'Could not reach the service. Try again.'
}
export interface OwnerPromoter { promoter_id: string; display_name: string | null; code: string; status: PromoterStatus; status_reason: string | null }
export interface OwnerReferral extends ActivityItem { promoter_id: string; reversal_kind: string | null; reversal_reason: string | null }
export interface AuditEvent { id: string; promoter_id: string | null; attribution_id?: string | null; actor_kind: string; action: string; from_status: string | null; to_status: string | null; reason: string | null; created_at: number }
export interface AuditPage { events: AuditEvent[]; next: Cursor | null }
export interface OwnerReport { app_id: string; freshness: Freshness; totals: Counts & { promoters: number }; acquisition: { activations_recorded: number; referred_confirmed: number; referred_reversed: number; organic: number; note: string }; standings: { promoter_id: string; display_name: string | null; rank: number | null; counts: Counts; share_of_referred_users: Share }[]; next: { after_id: string } | null }
export interface OwnerPromoters {
  settings: { enrollment_open: boolean; referral_tracking?: ReferralTracking }
  people: { promoters: OwnerPromoter[]; counts: { active: number; suspended: number; withdrawn: number; total: number }; next: Cursor | null }
  report: OwnerReport
  referrals: { referrals: OwnerReferral[]; counts: Counts; next: Cursor | null }
  events: AuditPage; referralEvents: AuditPage
}
export type OwnerPromotersLoader = (appId: string, range?: PromoterRange, now?: number) => Promise<OwnerPromoters>
export const loadOwnerPromoters: OwnerPromotersLoader = async (id, range = '30d', now) => {
  const base = appPath(id)
  const [settings, people, report, referrals, events, referralEvents] = await Promise.all([
    promoterRequest<OwnerPromoters['settings']>(`${base}/promoters/settings`),
    promoterRequest<OwnerPromoters['people']>(`${base}/promoters?limit=50`),
    promoterRequest<OwnerReport>(`${base}/promoters/contributions${periodQuery(range, now)}`),
    promoterRequest<OwnerPromoters['referrals']>(`${base}/referrals?limit=50`),
    promoterRequest<AuditPage>(`${base}/promoters/events?limit=50`),
    promoterRequest<AuditPage>(`${base}/referrals/events?limit=50`),
  ])
  if (report.app_id !== id) throw new Error('App context mismatch.')
  return { settings, people, report, referrals, events, referralEvents }
}
export function setEnrollment(id: string, open: boolean) { return promoterRequest(`${appPath(id)}/promoters/settings`, { method: 'PUT', body: JSON.stringify({ enrollment_open: open }) }) }
export function setPromoterStatus(id: string, promoterId: string, status: 'active' | 'suspended', reason: string) { return promoterRequest(`${appPath(id)}/promoters/${encodeURIComponent(promoterId)}/status`, { method: 'POST', body: JSON.stringify({ status, reason }) }) }
export function correctReferral(id: string, referralId: string, action: 'reverse' | 'restore', kind: 'fraud_invalid' | 'correction', reason: string) {
  // The deployed correct() service accepts and audits reason on restore too.
  return promoterRequest(`${appPath(id)}/referrals/${encodeURIComponent(referralId)}/${action}`, { method: 'POST', body: JSON.stringify(action === 'reverse' ? { kind, reason } : { reason }) })
}
