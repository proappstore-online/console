/**
 * @vitest-environment jsdom
 */
// Regression for proappstore-online/platform#202: clicking the avatar signed the
// user out. The console's SDK sent kv to api.freeappstore.online, which 401s a
// PAS token, and the SDK treats a kv 401 as a dead session.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const SESSION_KEY = 'pas:session'
const user = { id: 'u1', name: 'octo', login: 'octo', avatarUrl: null, dateOfBirth: null }

type Responder = (url: string, init?: RequestInit) => Response
let calls: { url: string; method: string }[]
let kvStatus: number

function mockFetch(responder: Responder) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    calls.push({ url, method: init?.method ?? 'GET' })
    return responder(url, init)
  }))
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Signed-in PAS API: kv answers with `kvStatus`, everything else succeeds.
const pasApi: Responder = (url, init) => {
  if (url.includes('/kv/')) {
    if (kvStatus === 401) return json({ error: 'invalid or expired session' }, 401)
    if ((init?.method ?? 'GET') !== 'GET') return new Response(null, { status: 204 })
    return kvStatus === 200 ? json({ theme: 'dark' }) : json({ error: 'not found' }, 404)
  }
  if (url.endsWith('/keys/providers') || url.endsWith('/keys/status')) return json([])
  return json({})
}

/** Fresh SDK singleton that restores the given session from localStorage. */
async function loadConsole() {
  vi.resetModules()
  const { pro } = await import('./sdk')
  const { Header } = await import('./Header')
  const { ProfileView } = await import('./ProfileView')
  return { pro, Header, ProfileView }
}

beforeEach(() => {
  calls = []
  kvStatus = 404
  localStorage.clear()
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'pas-token', user }))
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  mockFetch(pasApi)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const offStore = () => calls.filter((c) => !c.url.startsWith('https://api.proappstore.online/'))

describe('console SDK endpoints', () => {
  it('sends kv get/set/delete to api.proappstore.online, never api.freeappstore.online', async () => {
    const { pro } = await loadConsole()
    await pro.kv.get('prefs')
    await pro.kv.set('prefs', { theme: 'light' })
    await pro.kv.delete('app-config:demo') // App.tsx deleteSelectedApp

    const kv = calls.filter((c) => c.url.includes('/kv/'))
    expect(kv).toEqual([
      { url: 'https://api.proappstore.online/v1/apps/console/kv/prefs', method: 'GET' },
      { url: 'https://api.proappstore.online/v1/apps/console/kv/prefs', method: 'PUT' },
      { url: 'https://api.proappstore.online/v1/apps/console/kv/app-config%3Ademo', method: 'DELETE' },
    ])
    expect(calls.some((c) => c.url.includes('freeappstore'))).toBe(false)
    expect(pro.auth.isSignedIn).toBe(true)
  })

  it('still signs out when the PAS API itself rejects the session with 401', async () => {
    kvStatus = 401
    const { pro } = await loadConsole()
    await expect(pro.kv.get('prefs')).rejects.toThrow('Not signed in.')
    expect(pro.auth.isSignedIn).toBe(false)
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })
})

describe('avatar → profile', () => {
  it('avatar click only navigates to profile', async () => {
    const { pro, Header } = await loadConsole()
    const onNavigate = vi.fn()
    render(
      <Header user={pro.auth.user!} view="dashboard" onNavigate={onNavigate} isAdmin={false}
        apps={[]} selectedAppId={null} onOpenApp={() => {}} appTab="build" onAppTab={() => {}} appTabs={[]} />,
    )
    fireEvent.click(screen.getByTitle('Profile, API keys & settings'))
    expect(onNavigate).toHaveBeenCalledWith('profile')
    expect(pro.auth.isSignedIn).toBe(true)
  })

  it('opening the profile page keeps the session and loads prefs from the PAS API', async () => {
    const { pro, ProfileView } = await loadConsole()
    render(<ProfileView user={pro.auth.user!} />)
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/v1/apps/console/kv/prefs'))).toBe(true))

    expect(offStore()).toEqual([])
    expect(pro.auth.isSignedIn).toBe(true)
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull()
  })

  it('changing theme saves prefs to the PAS API and keeps the session', async () => {
    kvStatus = 200
    const { pro, ProfileView } = await loadConsole()
    render(<ProfileView user={pro.auth.user!} />)
    fireEvent.click(await screen.findByRole('button', { name: 'light' }))
    await waitFor(() => expect(calls).toContainEqual(
      { url: 'https://api.proappstore.online/v1/apps/console/kv/prefs', method: 'PUT' },
    ))
    expect(pro.auth.isSignedIn).toBe(true)
  })

  it('signs out only from the explicit Sign out button', async () => {
    const { pro, ProfileView } = await loadConsole()
    render(<ProfileView user={pro.auth.user!} />)
    await waitFor(() => expect(calls.some((c) => c.url.includes('/kv/prefs'))).toBe(true))
    expect(pro.auth.isSignedIn).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(pro.auth.isSignedIn).toBe(false)
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })
})
