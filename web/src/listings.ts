/**
 * Listings API client — matches the PAS backend's /v1/apps/:id/listing
 * and /v1/apps/:id/listing-assets/:kind contract.
 */

import { API_BASE } from './api'

export interface Listing {
  appId: string
  iconUrl: string | null
  themeColor: string | null
  splashColor: string | null
  tagline: string | null
  longDescription: string | null
  category: string | null
  websiteUrl: string | null
  supportEmail: string | null
  supportUrl: string | null
  socialTwitter: string | null
  socialGithub: string | null
  socialMastodon: string | null
  socialBluesky: string | null
  privacyPolicyUrl: string | null
  termsUrl: string | null
  screenshots: string[]
  updatedAt: number
}

export type ListingPatch = Partial<Omit<Listing, 'appId' | 'updatedAt'>>

export type AssetKind =
  | 'icon'
  | 'privacy-policy'
  | 'terms'
  | `screenshot-${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7}`

export interface UploadResult {
  url: string
  key: string
  size: number
}

function bearer(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` }
}

export async function fetchListing(token: string, appId: string): Promise<Listing> {
  const res = await fetch(`${API_BASE}/apps/${encodeURIComponent(appId)}/listing`, {
    headers: bearer(token),
  })
  if (!res.ok) throw new Error(`fetchListing failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as Listing
}

export async function patchListing(
  token: string,
  appId: string,
  patch: ListingPatch,
): Promise<Listing> {
  const res = await fetch(`${API_BASE}/apps/${encodeURIComponent(appId)}/listing`, {
    method: 'PUT',
    headers: { ...bearer(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`patchListing failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as Listing
}

export async function uploadAsset(
  token: string,
  appId: string,
  kind: AssetKind,
  file: Blob,
): Promise<UploadResult> {
  const res = await fetch(
    `${API_BASE}/apps/${encodeURIComponent(appId)}/listing-assets/${kind}`,
    {
      method: 'PUT',
      headers: { ...bearer(token), 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    },
  )
  if (!res.ok) throw new Error(`uploadAsset failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as UploadResult
}

export const CATEGORIES = [
  'social',
  'productivity',
  'marketplace',
  'transport',
  'games',
  'media',
  'health',
  'finance',
  'education',
  'utilities',
  'other',
] as const
