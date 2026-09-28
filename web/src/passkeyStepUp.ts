/**
 * Passkey step-up for the operator view (#244). Opening an identity document
 * needs a recent passkey verification, not just a recent sign-in. The console
 * runs the WebAuthn ceremony against the platform's console relying party
 * (console.proappstore.online) and gets back a short-lived session stamped
 * `auth_method: passkey`.
 *
 * That session is held in memory only, never in localStorage, and only until
 * the step-up window the platform reported runs out. The long-lived console
 * session is left as it is, so step-up never signs anyone out.
 */

import { API_BASE, ApiError, authHeaders } from './api'

export const CONSOLE_HOST = 'console.proappstore.online'
const DEFAULT_WINDOW_SECONDS = 300

let held: { token: string; until: number } | null = null

/** Passkeys are bound to the console's own hostname: they work only there, in a browser that supports them. */
export function passkeysAvailable(): boolean {
  return typeof window !== 'undefined' && window.location.hostname === CONSOLE_HOST
    && typeof window.PublicKeyCredential !== 'undefined' && !!navigator.credentials
}

/** The step-up session while it is still within its window, else null. */
export function stepUpToken(): string | null {
  if (held && Date.now() < held.until) return held.token
  held = null
  return null
}

export function clearStepUp(): void {
  held = null
}

/** The window a step_up_required refusal reported, in seconds. */
export function stepUpWindow(e: unknown): number {
  const maxAge = e instanceof ApiError ? (e.body as { max_age?: unknown } | null)?.max_age : undefined
  return typeof maxAge === 'number' && maxAge > 0 ? maxAge : DEFAULT_WINDOW_SECONDS
}

function toB64url(buf: ArrayBuffer): string {
  let bin = ''
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(value: string): ArrayBuffer {
  const bin = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

async function post<T>(path: string, token: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/auth/passkey/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let parsed: unknown = null
  if (text) { try { parsed = JSON.parse(text) } catch { parsed = text } }
  if (!res.ok) throw new ApiError(res.status, parsed)
  return parsed as T
}

/** The refusal code a passkey route answered with ('no_passkey', 'reauth_required'), if any. */
export function passkeyCode(e: unknown): string | null {
  const code = e instanceof ApiError ? (e.body as { code?: unknown } | null)?.code : undefined
  return typeof code === 'string' ? code : null
}

/**
 * Verify with the passkey registered for the console and hold the resulting
 * step-up session for `windowSeconds`. Throws ApiError `no_passkey` (404) when
 * there is none to use.
 */
export async function stepUpWithPasskey(sessionToken: string, windowSeconds = DEFAULT_WINDOW_SECONDS): Promise<string> {
  const opts = await post<{ challenge: string; rpId: string; timeout: number; allowCredentials: { id: string }[] }>('step-up/options', sessionToken)
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: fromB64url(opts.challenge),
      rpId: opts.rpId,
      timeout: opts.timeout,
      userVerification: 'required',
      allowCredentials: opts.allowCredentials.map((c) => ({ type: 'public-key' as const, id: fromB64url(c.id) })),
    },
  }) as PublicKeyCredential | null
  if (!cred) throw new Error('Passkey verification was cancelled.')
  const response = cred.response as AuthenticatorAssertionResponse
  const result = await post<{ token: string; auth_time: number }>('step-up', sessionToken, {
    id: toB64url(cred.rawId),
    clientDataJSON: toB64url(response.clientDataJSON),
    authenticatorData: toB64url(response.authenticatorData),
    signature: toB64url(response.signature),
  })
  // Stop using it a little before the platform would refuse it.
  held = { token: result.token, until: (result.auth_time + windowSeconds - 10) * 1000 }
  return result.token
}

/**
 * Register a passkey for the console. The platform requires a sign-in within
 * the last few minutes; otherwise it answers 403 `reauth_required`.
 */
export async function registerPasskey(sessionToken: string): Promise<void> {
  const opts = await post<{
    challenge: string
    rp: { id: string; name: string }
    user: { id: string; name: string; displayName: string }
    pubKeyCredParams: { type: 'public-key'; alg: number }[]
    timeout: number
    authenticatorSelection: AuthenticatorSelectionCriteria
    excludeCredentials: { id: string }[]
  }>('register/options', sessionToken)
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: fromB64url(opts.challenge),
      rp: opts.rp,
      user: { ...opts.user, id: fromB64url(opts.user.id) },
      pubKeyCredParams: opts.pubKeyCredParams,
      timeout: opts.timeout,
      attestation: 'none',
      authenticatorSelection: opts.authenticatorSelection,
      excludeCredentials: opts.excludeCredentials.map((c) => ({ type: 'public-key' as const, id: fromB64url(c.id) })),
    },
  }) as PublicKeyCredential | null
  if (!cred) throw new Error('Passkey setup was cancelled.')
  const response = cred.response as AuthenticatorAttestationResponse
  const publicKey = response.getPublicKey()
  if (!publicKey) throw new Error('This browser did not return the passkey’s public key.')
  await post('register', sessionToken, {
    id: toB64url(cred.rawId),
    clientDataJSON: toB64url(response.clientDataJSON),
    authenticatorData: toB64url(response.getAuthenticatorData()),
    publicKey: toB64url(publicKey),
    publicKeyAlgorithm: response.getPublicKeyAlgorithm(),
  })
}
