/**
 * Cross-subdomain auth sync.
 *
 * The PAS SDK stores the session in localStorage (origin-scoped). This module
 * mirrors the session token to a cookie on `.proappstore.online` so that the
 * storefront and other subdomains can detect the signed-in user.
 *
 * Flow:
 * 1. On sign-in: SDK writes localStorage → we mirror to cookie
 * 2. On sign-out: SDK clears localStorage → we clear the cookie
 * 3. On page load: if the cookie exists but localStorage is empty (user
 *    signed in on another subdomain), restore localStorage from the cookie
 *
 * The cookie holds just the token (not the full session). The storefront
 * uses it for lightweight signed-in detection (show avatar, balance link).
 * Full API calls still go through the SDK with the localStorage session.
 */

const COOKIE_NAME = 'pas_token'
const COOKIE_DOMAIN = '.proappstore.online'
const STORAGE_KEY = 'pas:session'
const MAX_AGE = 30 * 24 * 60 * 60 // 30 days

/** Set the cross-subdomain cookie with the current token. */
export function syncTokenToCookie(token: string | null): void {
  if (typeof document === 'undefined') return
  if (token) {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; Domain=${COOKIE_DOMAIN}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax; Secure`
  } else {
    // Clear
    document.cookie = `${COOKIE_NAME}=; Domain=${COOKIE_DOMAIN}; Path=/; Max-Age=0; SameSite=Lax; Secure`
  }
}

/** Read the token from the cross-subdomain cookie (if any). */
export function readTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

/** Restore session from cookie if localStorage is empty (signed in on another subdomain). */
export function restoreFromCookie(): void {
  const existing = localStorage.getItem(STORAGE_KEY)
  if (existing) return // already signed in locally

  const token = readTokenFromCookie()
  if (!token) return // no cross-subdomain session

  // We have a token from another subdomain but no local session.
  // We can't fully restore the user object without an API call, but we can
  // store the token so the SDK's auth.init() picks it up. The SDK will
  // validate the token and fetch the user on next init.
  // Store a minimal session that the SDK can work with:
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user: null }))
}
