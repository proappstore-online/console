// Promoter workspace data contract (console#14).
//
// The backend (platform#549 enrollment, #550 referral attribution, #551 reporting) is NOT deployed, and its
// request/response shapes are not published. So this module owns the *view-model* the UI renders, and the
// default loaders report `unavailable` without making any request. Nothing here invents a successful
// enrollment, link, or referral figure. When the platform contracts ship, replace `loadPromoterAccess` /
// `loadOwnerPromoters` with real clients that map the responses onto these types; the UI does not change.

export type PromoterRange = '7d' | '30d' | 'all'
export const PROMOTER_RANGES: { key: PromoterRange; label: string }[] = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
]

export interface PromoterApp { id: string; name: string }

/** The caller's own totals. `denominator` is every confirmed new user the app gained in the range. */
export interface PromoterStats {
  pending: number
  confirmed: number
  denominator: number
  /** 0–100, the caller's confirmed share of the denominator. */
  sharePct: number
  /** ISO time the figures were computed; shown as freshness. */
  asOf: string
}

/** A standings row carries no identity beyond "you": other promoters are anonymous. */
export interface StandingRow { rank: number; sharePct: number; you: boolean }

export interface ActivityItem { id: string; at: string; status: 'pending' | 'confirmed' }

export type PromoterAccess =
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string }
  | { kind: 'not-enrolled' }
  | { kind: 'suspended' | 'revoked' | 'withdrawn' }
  | {
      kind: 'enrolled'
      apps: PromoterApp[]
      link: string
      code: string
      stats: PromoterStats
      standings: StandingRow[]
      activity: { items: ActivityItem[]; nextCursor: string | null }
    }

export interface PromoterQuery { appId: string | null; range: PromoterRange; cursor?: string }
export type PromoterLoader = (q: PromoterQuery) => Promise<PromoterAccess>

/** Default loader: the backend is not deployed, so say so. No network call. */
export const loadPromoterAccess: PromoterLoader = async () => ({ kind: 'unavailable' })

/** Owner-side view of an app's promoters (app-scoped totals + enable/suspend/review). */
export type OwnerPromoters =
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready'
      programme: 'enabled' | 'suspended'
      totals: { promoters: number; pending: number; confirmed: number; asOf: string }
      reviewQueue: number
    }

export type OwnerPromotersLoader = (appId: string) => Promise<OwnerPromoters>
export const loadOwnerPromoters: OwnerPromotersLoader = async () => ({ kind: 'unavailable' })

export const UNAVAILABLE_MESSAGE =
  'Promoter enrollment and referral tracking are not live yet — the platform services they depend on are still being built. Nothing below is real data.'
