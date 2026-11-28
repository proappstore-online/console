/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url": "https://console.proappstore.online/"}
 */
// #244: opening an identity document needs a passkey step-up. The console runs
// the ceremony against its own relying party, holds the short-lived step-up
// session in memory, and retries the refused document with it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OperatorEvidence } from './OperatorEvidence'
import { OperatorResourcePanel } from './OperatorResourcePanel'
import { OperatorRecordView } from './OperatorRecordView'
import type { OperatorAction, OperatorContract, OperatorResource } from './operator'
import { clearStepUp, passkeysAvailable, stepUpToken, stepUpWithPasskey } from './passkeyStepUp'

const now = () => Math.floor(Date.now() / 1000)
const bytes = (...b: number[]) => new Uint8Array(b).buffer
type Call = { url: string; method: string; auth: string | null; body: unknown }
let calls: Call[]
let routes: Record<string, (c: Call) => Response>

beforeEach(() => {
  calls = []
  routes = {}
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    const c: Call = { url: String(raw), method: init?.method ?? 'GET', auth: headers.Authorization ?? null, body: init?.body ? JSON.parse(String(init.body)) : null }
    calls.push(c)
    const key = Object.keys(routes).find((k) => c.url.endsWith(k))
    return key ? routes[key]!(c) : new Response('not mocked', { status: 500 })
  }))
  vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
  let n = 0
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => `blob:test/${++n}`), revokeObjectURL: vi.fn() }))
})
afterEach(() => {
  cleanup()
  clearStepUp()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const credentials = (impl: { get?: () => unknown; create?: () => unknown }) => {
  const get = vi.fn(async (_options?: CredentialRequestOptions) => impl.get?.())
  const create = vi.fn(async (_options?: CredentialCreationOptions) => impl.create?.())
  Object.defineProperty(navigator, 'credentials', { value: { get, create }, configurable: true })
  return { get, create }
}
const assertion = () => ({
  rawId: bytes(1, 2, 3),
  response: { clientDataJSON: bytes(4), authenticatorData: bytes(5), signature: bytes(6) },
})
const json = (body: unknown, status = 200) => Response.json(body, { status })
const EVIDENCE = '/operator/resources/kyc/records/k1/evidence/document_path'

/** The platform: documents only for the step-up session; the plain session gets method 'passkey'. */
function platform(opts: { passkey?: boolean } = {}) {
  routes[EVIDENCE] = (c) => c.auth === 'Bearer stepped'
    ? new Response('PNGDATA', { headers: { 'content-type': 'image/png' } })
    : json({ error: 'step_up_required', message: 'Recent passkey verification required', max_age: 300, method: 'passkey' }, 403)
  routes['/auth/passkey/step-up/options'] = () => opts.passkey === false
    ? json({ error: 'no passkey registered for this app', code: 'no_passkey' }, 404)
    : json({ challenge: 'AAEC', rpId: 'proappstore.online', timeout: 60000, userVerification: 'required', allowCredentials: [{ type: 'public-key', id: 'AQID' }] })
  routes['/auth/passkey/step-up'] = () => json({ token: 'stepped', auth_time: now(), expires_at: now() + 3600 })
}

function renderEvidence(onReauth = vi.fn()) {
  render(<OperatorEvidence appId="stash" resourceId="kyc" recordKey="k1" getToken={() => 'tok'} onReauth={onReauth}
    record={{ request_id: 'k1', document_path: true, selfie_path: true }}
    evidence={[{ field: 'document_path', label: 'ID document' }, { field: 'selfie_path', label: 'Selfie' }]} />)
  return onReauth
}

describe('passkey step-up for documents (#244)', () => {
  it('is available on the console origin only', () => {
    credentials({})
    expect(passkeysAvailable()).toBe(true)
  })

  it('a refused document offers a passkey check, runs it on the console relying party, and retries with the step-up session', async () => {
    platform()
    const { get } = credentials({ get: assertion })
    renderEvidence()
    fireEvent.click(screen.getByRole('button', { name: 'View ID document' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Opening a document needs a passkey check.')
    expect(screen.queryByRole('button', { name: 'Sign in again' })).toBeNull() // a fresh sign-in would be refused again

    fireEvent.click(screen.getByRole('button', { name: 'Verify with passkey' }))
    const img = await screen.findByRole('img', { name: 'ID document' })
    expect(img.getAttribute('src')).toBe('blob:test/1')

    const options = get.mock.calls[0]![0] as { publicKey: PublicKeyCredentialRequestOptions }
    expect(options.publicKey.rpId).toBe('proappstore.online')
    expect(options.publicKey.userVerification).toBe('required')
    expect([...new Uint8Array(options.publicKey.challenge as ArrayBuffer)]).toEqual([0, 1, 2])
    expect([...new Uint8Array(options.publicKey.allowCredentials![0]!.id as ArrayBuffer)]).toEqual([1, 2, 3])
    // The ceremony is authorised by the console session; the assertion goes back base64url-encoded.
    const stepUp = calls.find((c) => c.url.endsWith('/auth/passkey/step-up'))!
    expect(stepUp.auth).toBe('Bearer tok')
    expect(stepUp.body).toEqual({ id: 'AQID', clientDataJSON: 'BA', authenticatorData: 'BQ', signature: 'Bg' })
    // The document itself was fetched with the step-up session, not the console session.
    expect(calls.filter((c) => c.url.endsWith(EVIDENCE)).map((c) => c.auth)).toEqual(['Bearer tok', 'Bearer stepped'])

    // Within the window the next document needs no new ceremony.
    routes['/operator/resources/kyc/records/k1/evidence/selfie_path'] = (c) => c.auth === 'Bearer stepped'
      ? new Response('JPG', { headers: { 'content-type': 'image/jpeg' } }) : json({ error: 'step_up_required', method: 'passkey' }, 403)
    fireEvent.click(screen.getByRole('button', { name: 'View Selfie' }))
    await screen.findByRole('img', { name: 'Selfie' })
    expect(get).toHaveBeenCalledOnce()
  })

  it('without a passkey, offers to set one up; setting up needs a recent sign-in', async () => {
    platform({ passkey: false })
    credentials({})
    routes['/auth/passkey/register/options'] = () => json({ error: 'sign in again to add a passkey', code: 'reauth_required' }, 403)
    const onReauth = renderEvidence()
    fireEvent.click(screen.getByRole('button', { name: 'View ID document' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Verify with passkey' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Set up a passkey' }))
    await screen.findByText(/needs a sign-in within the last few minutes/)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }))
    expect(onReauth).toHaveBeenCalledOnce()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('sets up a passkey after a recent sign-in, then verifies with it and opens the document', async () => {
    platform({ passkey: false })
    const { create } = credentials({
      get: assertion,
      create: () => ({
        rawId: bytes(9),
        response: { clientDataJSON: bytes(7), getAuthenticatorData: () => bytes(8), getPublicKey: () => bytes(10), getPublicKeyAlgorithm: () => -7, getTransports: () => ['internal', 'hybrid'] },
      }),
    })
    routes['/auth/passkey/register/options'] = () => json({
      challenge: 'Bwc', rp: { id: 'proappstore.online', name: 'ProAppStore' }, user: { id: 'Z2g6MQ', name: 'owner', displayName: 'owner' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }], timeout: 60000, attestation: 'none',
      authenticatorSelection: { userVerification: 'required' }, excludeCredentials: [],
    })
    routes['/auth/passkey/register'] = () => json({ ok: true, id: 'CQ' })
    renderEvidence()
    fireEvent.click(screen.getByRole('button', { name: 'View ID document' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Verify with passkey' }))
    // The first step-up/options answers no_passkey; after registering, the next one offers the new key.
    await screen.findByRole('button', { name: 'Set up a passkey' })
    routes['/auth/passkey/step-up/options'] = () => json({ challenge: 'AAEC', rpId: 'proappstore.online', timeout: 60000, allowCredentials: [{ id: 'CQ' }] })
    fireEvent.click(screen.getByRole('button', { name: 'Set up a passkey' }))
    await screen.findByRole('img', { name: 'ID document' })
    const opts = create.mock.calls[0]![0] as { publicKey: PublicKeyCredentialCreationOptions }
    expect(opts.publicKey.rp.id).toBe('proappstore.online')
    expect(opts.publicKey.attestation).toBe('none')
    expect(calls.find((c) => c.url.endsWith('/auth/passkey/register'))!.body).toEqual({
      id: 'CQ', clientDataJSON: 'Bw', authenticatorData: 'CA', publicKey: 'Cg', publicKeyAlgorithm: -7, transports: ['internal', 'hybrid'],
    })
  })

  it('a cancelled ceremony is explained and can be retried', async () => {
    platform()
    credentials({ get: () => { throw new DOMException('cancelled', 'NotAllowedError') } })
    renderEvidence()
    fireEvent.click(screen.getByRole('button', { name: 'View ID document' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Verify with passkey' }))
    await screen.findByText('The passkey check was cancelled or timed out.')
    expect(screen.getByRole('button', { name: 'Verify with passkey' })).toBeTruthy()
    expect(calls.filter((c) => c.url.endsWith(EVIDENCE))).toHaveLength(1)
  })

  it('holds the step-up session in memory only, until its window runs out', async () => {
    platform()
    credentials({ get: assertion })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    await stepUpWithPasskey('tok', 300)
    expect(stepUpToken()).toBe('stepped')
    expect(setItem).not.toHaveBeenCalled()
    const start = Date.now()
    vi.useFakeTimers()
    vi.setSystemTime(start + 280_000)
    expect(stepUpToken()).toBe('stepped')
    // Dropped a little before the platform's 300 s window, so it is never sent stale.
    vi.setSystemTime(start + 291_000)
    expect(stepUpToken()).toBeNull()
  })
})

describe('passkey step-up for operator actions (console#28)', () => {
  const resource: OperatorResource = {
    id: 'applications', kind: 'verification', title: 'Driver applications', description: null, action: 'op_list_applications',
    columns: [{ key: 'name', label: 'Name', format: 'text' }, { key: 'application_id', label: 'Application', format: 'text' }],
  } as OperatorResource
  const approve = { id: 'approve_application', title: 'Approve', resource: 'applications', action: 'op_approve_application',
    params: { application_id: 'application_id' }, confirm: 'Approve this application?', step_up: true, destructive: false,
    transition: null, target: 'application_id' } as OperatorAction
  const ACTION = '/operator/actions/approve_application'

  it('a row action refused for a passkey offers the check in the panel, then retries the action with the step-up session', async () => {
    platform()
    const { get } = credentials({ get: assertion })
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    routes['/operator/resources/applications'] = () => json({ rows: [{ name: 'Ada', application_id: 'a1' }], next_cursor: null })
    routes[ACTION] = (c) => c.auth === 'Bearer stepped'
      ? json({ ok: true, changes: 1 })
      : json({ error: 'step_up_required', message: 'Recent passkey verification required', max_age: 300, method: 'passkey' }, 403)
    render(<OperatorResourcePanel appId="rideshare" resource={resource} actions={[approve]} getToken={() => 'tok'} onReauth={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    await screen.findByText('Approve: This needs a passkey check.')
    expect(screen.queryByRole('button', { name: 'Sign in again' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Verify with passkey' }))

    await screen.findByText('Approve: done.')
    expect(get).toHaveBeenCalledOnce()
    // Confirmed once: the retry after the passkey check does not ask again.
    expect(confirm).toHaveBeenCalledOnce()
    const posts = calls.filter((c) => c.url.endsWith(ACTION))
    expect(posts.map((c) => c.auth)).toEqual(['Bearer tok', 'Bearer stepped'])
    expect(posts[1]!.body).toEqual({ row: { name: 'Ada', application_id: 'a1' } })
    expect(screen.queryByRole('button', { name: 'Verify with passkey' })).toBeNull()
  })

  it('without a passkey, the panel offers to set one up in generic words', async () => {
    platform({ passkey: false })
    credentials({})
    vi.stubGlobal('confirm', () => true)
    routes['/operator/resources/applications'] = () => json({ rows: [{ name: 'Ada', application_id: 'a1' }], next_cursor: null })
    routes[ACTION] = () => json({ error: 'step_up_required', method: 'passkey', max_age: 300 }, 403)
    render(<OperatorResourcePanel appId="rideshare" resource={resource} actions={[approve]} getToken={() => 'tok'} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Verify with passkey' }))
    expect(await screen.findByText('You have no passkey yet. Set one up to continue.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Profile → Passkeys' }).getAttribute('href')).toBe('#/profile')
  })
})

describe('passkey step-up for an operator record (console#28)', () => {
  it('a record read refused for a passkey offers the check, then reloads the record with the step-up session', async () => {
    platform()
    const { get } = credentials({ get: assertion })
    const RECORD = '/operator/resources/drivers/records/d1'
    routes[RECORD] = (c) => c.auth === 'Bearer stepped'
      ? json({ record: { name: 'Ada', email: 'ada@ride.test' } })
      : json({ error: 'step_up_required', message: 'Recent passkey verification required', max_age: 300, method: 'passkey' }, 403)
    const contract = { version: 1, actions: [], resources: [{
      id: 'drivers', kind: 'users', title: 'Drivers', description: null, action: 'op_list_drivers',
      columns: [{ key: 'name', label: 'Name', format: 'text' }],
      detail: { action: 'op_driver_detail', param: 'driver_id', key: 'driver_id', step_up: true, fields: [
        { key: 'name', label: 'Name', format: 'text' }, { key: 'email', label: 'Email', format: 'text' },
      ] },
    }] } as unknown as OperatorContract
    render(<OperatorRecordView appId="rideshare" contract={contract} resourceId="drivers" recordKey="d1" getToken={() => 'tok'} onReauth={vi.fn()} />)
    expect((await screen.findByRole('alert')).textContent).toBe('This needs a passkey check.')
    expect(screen.queryByRole('button', { name: 'Sign in again' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Verify with passkey' }))
    expect(await screen.findByText('ada@ride.test')).toBeTruthy()
    expect(get).toHaveBeenCalledOnce()
    expect(calls.filter((c) => c.url.endsWith(RECORD)).map((c) => c.auth)).toEqual(['Bearer tok', 'Bearer stepped'])
    expect(screen.queryByRole('button', { name: 'Verify with passkey' })).toBeNull()
  })
})
