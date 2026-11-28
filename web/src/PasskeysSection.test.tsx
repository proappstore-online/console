/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://console.proappstore.online/"}
 */
// console#29: Profile → Passkeys lists your passkeys, adds, renames and removes
// them, against the platform's routes (platform#700). Remove and a second add
// need a recent check: a passkey step-up first, then a fresh sign-in.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PasskeysSection } from './PasskeysSection'
import { clearStepUp, type Passkey } from './passkeyStepUp'

const now = () => Math.floor(Date.now() / 1000)
const bytes = (...b: number[]) => new Uint8Array(b).buffer
type Call = { url: string; method: string; auth: string | null; body: unknown }
let calls: Call[]
let routes: Record<string, (c: Call) => Response>
let stored: Passkey[]

const json = (body: unknown, status = 200) => Response.json(body, { status })
const LIST = '/auth/passkey/credentials'
const ONE = (id: string) => `/auth/passkey/credentials/${id}`

beforeEach(() => {
  calls = []
  stored = [
    { id: 'pk2', name: 'Work laptop', rp_id: 'proappstore.online', transports: ['internal'], created_at: Date.now() - 2 * 86_400_000, last_used_at: null },
    { id: 'pk1', name: 'Passkey', rp_id: 'proappstore.online', transports: [], created_at: Date.now() - 40 * 86_400_000, last_used_at: Date.now() - 3_600_000 },
  ]
  routes = { [LIST]: () => json({ credentials: stored }) }
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    const c: Call = { url: String(raw), method: init?.method ?? 'GET', auth: headers.Authorization ?? null, body: init?.body ? JSON.parse(String(init.body)) : null }
    calls.push(c)
    const key = Object.keys(routes).sort((a, b) => b.length - a.length).find((k) => c.url.endsWith(k))
    return key ? routes[key]!(c) : new Response('not mocked', { status: 500 })
  }))
  vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
})
afterEach(() => {
  cleanup()
  clearStepUp()
  vi.unstubAllGlobals()
})

const credentials = (impl: { get?: () => unknown; create?: () => unknown }) => {
  const get = vi.fn(async () => impl.get?.())
  const create = vi.fn(async () => impl.create?.())
  Object.defineProperty(navigator, 'credentials', { value: { get, create }, configurable: true })
  return { get, create }
}
const assertion = () => ({ rawId: bytes(1, 2, 3), response: { clientDataJSON: bytes(4), authenticatorData: bytes(5), signature: bytes(6) } })
const attestation = () => ({
  rawId: bytes(9),
  response: { clientDataJSON: bytes(7), getAuthenticatorData: () => bytes(8), getPublicKey: () => bytes(10), getPublicKeyAlgorithm: () => -7, getTransports: () => ['hybrid', 'internal'] },
})
const registerOptions = () => json({
  challenge: 'Bwc', rp: { id: 'proappstore.online', name: 'ProAppStore' }, user: { id: 'Z2g6MQ', name: 'owner', displayName: 'owner' },
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }], timeout: 60000, authenticatorSelection: { userVerification: 'required' }, excludeCredentials: [],
})
/** The platform's step-up: a short-lived session the refused change is retried with. */
function stepUpRoutes() {
  routes['/auth/passkey/step-up/options'] = () => json({ challenge: 'AAEC', rpId: 'proappstore.online', timeout: 60000, allowCredentials: [{ id: 'AQID' }] })
  routes['/auth/passkey/step-up'] = () => json({ token: 'stepped', auth_time: now() })
}
const REAUTH = { error: 'sign in again or verify with a passkey to remove a passkey', code: 'reauth_required' }

function renderSection() {
  const onReauth = vi.fn()
  render(<PasskeysSection getToken={() => 'tok'} onReauth={onReauth} />)
  return onReauth
}

describe('Profile → Passkeys (console#29)', () => {
  it('lists each passkey with its name, when it was added and when it was last used', async () => {
    credentials({})
    renderSection()
    expect(screen.getByText(/One passkey works across ProAppStore: the Console and every app/)).toBeTruthy()
    expect(await screen.findByText('Work laptop')).toBeTruthy()
    expect(screen.getByText('Added 2 days ago · last used never')).toBeTruthy()
    expect(screen.getByText('Added last month · last used 1 hour ago')).toBeTruthy()
    expect(calls[0]).toMatchObject({ method: 'GET', auth: 'Bearer tok' })
  })

  it('says there is none yet when the list is empty', async () => {
    credentials({})
    stored = []
    renderSection()
    expect(await screen.findByText('You have no passkey yet.')).toBeTruthy()
  })

  it('off a passkey host it says where passkeys work and never calls the platform', async () => {
    Object.defineProperty(navigator, 'credentials', { value: undefined, configurable: true })
    vi.stubGlobal('PublicKeyCredential', undefined)
    renderSection()
    expect(screen.getByText(/Passkey checks work on/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'console.proappstore.online' })).toBeTruthy()
    expect(calls).toHaveLength(0)
  })

  it('renames a passkey inline', async () => {
    credentials({})
    routes[ONE('pk1')] = (c) => {
      stored = stored.map((p) => (p.id === 'pk1' ? { ...p, name: (c.body as { name: string }).name } : p))
      return json({ ok: true, id: 'pk1', name: stored[1]!.name })
    }
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Passkey' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Passkey name' }), { target: { value: '  Phone  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Phone')).toBeTruthy()
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ url: expect.stringMatching(/\/auth\/passkey\/credentials\/pk1$/), body: { name: 'Phone' }, auth: 'Bearer tok' })
  })

  it('shows the platform’s reason when a name is refused', async () => {
    credentials({})
    routes[ONE('pk1')] = () => json({ error: 'name must be 1-60 characters' }, 400)
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Passkey' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Passkey name' }), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toBe('name must be 1-60 characters')
  })

  it('removes a passkey after an in-app confirmation', async () => {
    credentials({})
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    routes[ONE('pk2')] = () => { stored = stored.filter((p) => p.id !== 'pk2'); return json({ ok: true, id: 'pk2' }) }
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Work laptop' }))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Work laptop' }))
    await waitFor(() => expect(screen.queryByText('Work laptop')).toBeNull())
    expect(confirm).not.toHaveBeenCalled()
    expect(calls.find((c) => c.method === 'DELETE')).toMatchObject({ auth: 'Bearer tok' })
  })

  it('a remove refused for reauth offers a passkey check, then retries with the step-up session', async () => {
    const { get } = credentials({ get: assertion })
    stepUpRoutes()
    routes[ONE('pk2')] = (c) => {
      if (c.auth !== 'Bearer stepped') return json(REAUTH, 403)
      stored = stored.filter((p) => p.id !== 'pk2')
      return json({ ok: true, id: 'pk2' })
    }
    const onReauth = renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Work laptop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Work laptop' }))
    expect(await screen.findByText('Removing a passkey needs a passkey check or a sign-in within the last few minutes.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Verify with passkey' }))
    await waitFor(() => expect(screen.queryByText('Work laptop')).toBeNull())
    expect(get).toHaveBeenCalledOnce()
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.auth)).toEqual(['Bearer tok', 'Bearer stepped'])
    expect(calls.find((c) => c.url.endsWith('/auth/passkey/step-up'))!.auth).toBe('Bearer tok')
    expect(onReauth).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Verify with passkey' })).toBeNull()
  })

  it('a refused remove can instead sign in again', async () => {
    credentials({})
    routes[ONE('pk2')] = () => json(REAUTH, 403)
    const onReauth = renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Work laptop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Work laptop' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in again' }))
    expect(onReauth).toHaveBeenCalledOnce()
  })

  it('adds a named passkey, sending its transports', async () => {
    stored = []
    credentials({ create: attestation })
    routes['/auth/passkey/register/options'] = registerOptions
    routes['/auth/passkey/register'] = (c) => {
      stored = [{ id: 'CQ', name: (c.body as { name: string }).name, rp_id: 'proappstore.online', transports: ['hybrid', 'internal'], created_at: Date.now(), last_used_at: null }]
      return json({ ok: true, id: 'CQ', name: stored[0]!.name })
    }
    renderSection()
    await screen.findByText('You have no passkey yet.')
    fireEvent.change(screen.getByRole('textbox', { name: 'New passkey name' }), { target: { value: 'Home iMac' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }))
    expect(await screen.findByText('Home iMac')).toBeTruthy()
    expect(calls.find((c) => c.url.endsWith('/auth/passkey/register'))!.body).toEqual({
      id: 'CQ', clientDataJSON: 'Bw', authenticatorData: 'CA', publicKey: 'Cg', publicKeyAlgorithm: -7, transports: ['hybrid', 'internal'], name: 'Home iMac',
    })
    expect((screen.getByRole('textbox', { name: 'New passkey name' }) as HTMLInputElement).value).toBe('')
  })

  it('an unnamed passkey leaves the name to the platform', async () => {
    credentials({ create: attestation })
    routes['/auth/passkey/register/options'] = () => registerOptions()
    routes['/auth/passkey/register'] = () => json({ ok: true, id: 'CQ', name: 'Mac · Chrome' })
    stored = []
    renderSection()
    await screen.findByText('You have no passkey yet.')
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }))
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/auth/passkey/register'))).toBe(true))
    expect(calls.find((c) => c.url.endsWith('/auth/passkey/register'))!.body).not.toHaveProperty('name')
  })

  it('a second passkey needs a passkey check first, then is added with the step-up session', async () => {
    credentials({ get: assertion, create: attestation })
    stepUpRoutes()
    routes['/auth/passkey/register/options'] = (c) => c.auth === 'Bearer stepped'
      ? registerOptions()
      : json({ error: 'adding another passkey requires a passkey step-up here first', code: 'reauth_required' }, 403)
    routes['/auth/passkey/register'] = (c) => {
      stored = [{ id: 'CQ', name: 'Mac · Chrome', rp_id: 'proappstore.online', transports: [], created_at: Date.now(), last_used_at: null }, ...stored]
      return c.auth === 'Bearer stepped' ? json({ ok: true, id: 'CQ', name: 'Mac · Chrome' }) : json(REAUTH, 403)
    }
    renderSection()
    await screen.findByText('Work laptop')
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }))
    expect(await screen.findByText('Adding a passkey needs a passkey check or a sign-in within the last few minutes.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Verify with passkey' }))
    expect(await screen.findByText('Mac · Chrome')).toBeTruthy()
    expect(calls.filter((c) => c.url.endsWith('/auth/passkey/register/options')).map((c) => c.auth)).toEqual(['Bearer tok', 'Bearer stepped'])
  })

  it('without a passkey and a stale sign-in, adding offers only a fresh sign-in', async () => {
    stored = []
    credentials({})
    routes['/auth/passkey/register/options'] = () => json({ error: 'sign in again to add a passkey', code: 'reauth_required' }, 403)
    const onReauth = renderSection()
    await screen.findByText('You have no passkey yet.')
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }))
    expect(await screen.findByText('Adding a passkey needs a sign-in within the last few minutes. Sign in again, then retry.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Verify with passkey' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }))
    expect(onReauth).toHaveBeenCalledOnce()
  })

  it('a cancelled passkey prompt is explained', async () => {
    credentials({ create: () => { throw new DOMException('cancelled', 'NotAllowedError') } })
    routes['/auth/passkey/register/options'] = registerOptions
    renderSection()
    await screen.findByText('Work laptop')
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }))
    expect((await screen.findByRole('alert')).textContent).toBe('The passkey check was cancelled or timed out.')
  })
})
