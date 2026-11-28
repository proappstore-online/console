/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://proappstore.online/app/#/apps/stash/operator"}
 */
// platform#698: the console is also served at the storefront's /app/ mirror.
// Console passkeys belong to proappstore.online, so the ceremony runs here too,
// on the relying party the platform names.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearStepUp, passkeysAvailable, stepUpToken, stepUpWithPasskey } from './passkeyStepUp'

afterEach(() => {
  clearStepUp()
  vi.unstubAllGlobals()
})

describe('passkey step-up on the proappstore.online/app mirror (platform#698)', () => {
  it('is available, and runs the ceremony on the relying party the platform returns', async () => {
    const now = Math.floor(Date.now() / 1000)
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
    vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).endsWith('/step-up/options')
      ? Response.json({ challenge: 'AAEC', rpId: 'proappstore.online', timeout: 60000, allowCredentials: [{ id: 'AQID' }] })
      : Response.json({ token: 'stepped', auth_time: now, expires_at: now + 3600 })))
    const bytes = (...b: number[]) => new Uint8Array(b).buffer
    const get = vi.fn(async (_options?: CredentialRequestOptions) => ({
      rawId: bytes(1, 2, 3),
      response: { clientDataJSON: bytes(4), authenticatorData: bytes(5), signature: bytes(6) },
    }))
    Object.defineProperty(navigator, 'credentials', { value: { get }, configurable: true })

    expect(passkeysAvailable()).toBe(true)
    expect(await stepUpWithPasskey('tok')).toBe('stepped')
    expect(get.mock.calls[0]![0]!.publicKey!.rpId).toBe('proappstore.online')
    expect(stepUpToken()).toBe('stepped')
  })
})
