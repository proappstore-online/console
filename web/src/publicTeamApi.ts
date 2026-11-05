import { apiFetch } from './api'

// Public app-team profiles (platform#542, console#11). A profile is presentation only: a display name and an
// optional label. It is never a permission, and the public payload carries no email, id or access role.

export const NAME_MAX = 60
export const LABEL_MAX = 40

export interface PublicMember { display_name: string; label: string | null; is_creator: boolean }

/** The owner's private roster row. `user_id` and `role` exist only to address a moderation call; never render them. */
export interface RosterMember {
  user_id: string
  role: string
  display_name: string | null
  label: string | null
  visible: boolean
  updated_at: number | null
}

export interface ProfileInput { display_name: string; label: string; visible: boolean; show_promotion?: boolean }

const team = (appId: string) => `/apps/${encodeURIComponent(appId)}/team/public`

/** Additive platform#552 contract. A 403/404 means preferences cannot be read;
 * callers must not infer saved consent from public-list membership. */
export interface OwnPublicProfile { display_name: string | null; label: string | null; visible: boolean; show_promotion: boolean; updated_at: string }
export async function fetchOwnProfile(appId: string, token: string | null) {
  const response = await apiFetch<{ appId: string; profile: OwnPublicProfile | null }>(`${team(appId)}/me`, { token, credentials: 'include' })
  if (response.appId !== appId) throw new Error('App context mismatch.')
  return response
}

/** What visitors see right now. No auth; a private or missing app is a 404. */
export function fetchPublicTeam(appId: string) {
  return apiFetch<{ members: PublicMember[] }>(`/storefront/apps/${encodeURIComponent(appId)}/team`, { token: null })
}

/** Owner only (403 for anyone else). */
export function fetchRoster(appId: string, token: string | null) {
  return apiFetch<{ appId: string; members: RosterMember[] }>(team(appId), { token })
}

/** Save the caller's own profile. `visible` requires a display name. */
export function saveOwnProfile(appId: string, token: string | null, input: ProfileInput) {
  const label = input.label.trim()
  return apiFetch<{ ok: true; visible: boolean }>(`${team(appId)}/me`, {
    token, method: 'PUT',
    credentials: 'include',
    body: JSON.stringify({ display_name: input.display_name.trim(), ...(label ? { label } : {}), visible: input.visible, ...(input.show_promotion !== undefined ? { show_promotion: input.show_promotion } : {}) }),
  })
}

/** Withdraw the caller's own profile from the public list (keeps what they wrote). */
export function withdrawOwnProfile(appId: string, token: string | null) {
  return apiFetch<{ ok: true; visible: false }>(`${team(appId)}/me`, { token, credentials: 'include', method: 'DELETE' })
}

/** Owner: take one person off the public list. Not a ban — they may opt in again. */
export function hideMember(appId: string, token: string | null, userId: string) {
  return apiFetch<{ ok: true; visible: false }>(`${team(appId)}/${encodeURIComponent(userId)}`, { token, method: 'DELETE' })
}
