/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TestPrincipalsPanel } from './TestPrincipalsPanel'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const principal = {
  id: 'tp_1',
  slug: 'grasskarma-e2e',
  user_id: 'test:grasskarma-e2e',
  description: 'GrassKarma smoke account',
  status: 'active' as const,
  created_by: 'gh:1',
  created_at: Date.now() - 1000,
  disabled_at: null,
  updated_at: null,
}

const grant = {
  id: 'grant_1',
  repository: 'proappstore-online/grasskarma',
  workflow: '.github/workflows/deploy.yml',
  ref: 'refs/heads/main',
  user_id: 'test:grasskarma-e2e',
  label: null,
  created_by: 'gh:1',
  created_at: Date.now() - 1000,
  revoked_at: null,
  last_minted_at: null,
  mint_count: 2,
  principal_id: 'tp_1',
  environment: null,
  expires_at: Date.now() + 1_000_000,
  session_ttl_seconds: 3600,
  scope: 'user',
}

const event = {
  id: 1,
  principal_id: 'tp_1',
  grant_id: 'grant_1',
  action: 'grant.create',
  actor: 'gh:1',
  detail: '{}',
  at: Date.now() - 1000,
  request_id: 'req_1',
  reason: null,
}

function fetchRouter() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    const method = init?.method ?? 'GET'
    if (u.includes('/admin/test-principals/tp_1') && method === 'GET') {
      return new Response(JSON.stringify({ principal, grants: [grant] }), { status: 200 })
    }
    if (u.includes('/admin/test-principals') && method === 'GET') {
      return new Response(JSON.stringify({ principals: [principal], next_cursor: null }), { status: 200 })
    }
    if (u.includes('/admin/test-principals') && method === 'POST') {
      return new Response(JSON.stringify({ principal: { ...principal, id: 'tp_2', slug: 'new-slug' } }), { status: 201 })
    }
    if (u.includes('/disable') && method === 'POST') {
      return new Response(JSON.stringify({ ok: true, revoked_grants: 1 }), { status: 200 })
    }
    if (u.includes('/admin/test-principal-events') && method === 'GET') {
      return new Response(JSON.stringify({ events: [event], next_cursor: null }), { status: 200 })
    }
    if (u.includes('/admin/oidc-session-grants') && method === 'DELETE') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    if (u.includes('/admin/oidc-session-grants') && method === 'POST') {
      return new Response(JSON.stringify({ grant: { ...grant, id: 'grant_2' } }), { status: 201 })
    }
    return new Response('{}', { status: 404 })
  })
}

describe('TestPrincipalsPanel', () => {
  it('lists principals and expands grant + audit detail', async () => {
    vi.stubGlobal('fetch', fetchRouter())
    render(<TestPrincipalsPanel getToken={() => 'tok'} />)
    await screen.findByText('grasskarma-e2e')
    fireEvent.click(screen.getByText('grasskarma-e2e'))
    await screen.findByText('proappstore-online/grasskarma')
    expect(screen.getByText('grant.create')).toBeTruthy()
  })

  it('revokes a grant', async () => {
    const fetchMock = fetchRouter()
    vi.stubGlobal('fetch', fetchMock)
    render(<TestPrincipalsPanel getToken={() => 'tok'} />)
    fireEvent.click(await screen.findByText('grasskarma-e2e'))
    fireEvent.click(await screen.findByText('Revoke'))
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) => String(u).includes('/admin/oidc-session-grants/grant_1') && (i as RequestInit | undefined)?.method === 'DELETE',
        ),
      ).toBe(true),
    )
  })

  it('disables a principal', async () => {
    const fetchMock = fetchRouter()
    vi.stubGlobal('fetch', fetchMock)
    render(<TestPrincipalsPanel getToken={() => 'tok'} />)
    fireEvent.click(await screen.findByText('Disable'))
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/disable'))).toBe(true))
  })

  it('creates a new principal', async () => {
    const fetchMock = fetchRouter()
    vi.stubGlobal('fetch', fetchMock)
    render(<TestPrincipalsPanel getToken={() => 'tok'} />)
    await screen.findByText('grasskarma-e2e')
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'new-slug' } })
    fireEvent.click(screen.getByText('New principal'))
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) => String(u).includes('/admin/test-principals') && (i as RequestInit | undefined)?.method === 'POST',
        ),
      ).toBe(true),
    )
  })

  it('creates a new grant from the detail form', async () => {
    const fetchMock = fetchRouter()
    vi.stubGlobal('fetch', fetchMock)
    render(<TestPrincipalsPanel getToken={() => 'tok'} />)
    fireEvent.click(await screen.findByText('grasskarma-e2e'))
    await screen.findByText('proappstore-online/grasskarma')
    fireEvent.click(screen.getByText('New grant'))
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) => String(u).endsWith('/admin/oidc-session-grants') && (i as RequestInit | undefined)?.method === 'POST',
        ),
      ).toBe(true),
    )
  })
})
