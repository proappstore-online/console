/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AppUsageTable, sortUsage } from './AppUsageTable'

const usage = {
  days: 7,
  totals: { views: 15, apps: 3, apps_with_views: 2, apps_without_views: 1 },
  series: [{ t: '2026-10-25', views: 15 }],
  apps: [
    { app_id: 'beta', registered: true, views: 10, series: [{ t: '2026-10-25', views: 10 }] },
    { app_id: 'alpha', registered: true, views: 5, series: [{ t: '2026-10-25', views: 5 }] },
    { app_id: 'idle', registered: true, views: 0, series: [] },
  ],
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('sortUsage', () => {
  it('sorts by views and by name in both directions', () => {
    expect(sortUsage(usage.apps, 'views', true).map((r) => r.app_id)).toEqual(['beta', 'alpha', 'idle'])
    expect(sortUsage(usage.apps, 'views', false).map((r) => r.app_id)).toEqual(['idle', 'alpha', 'beta'])
    expect(sortUsage(usage.apps, 'app', false).map((r) => r.app_id)).toEqual(['alpha', 'beta', 'idle'])
  })
})

describe('AppUsageTable', () => {
  it('lists every app, flags zero views, shows totals and refetches for 30d', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify(usage), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AppUsageTable getToken={() => 'tok'} />)
    await screen.findByText('beta')
    expect(screen.getByText('idle')).toBeTruthy()
    expect(screen.getByText('no views')).toBeTruthy()
    expect(screen.getByText(/Total \(3 apps, 1 with no views\)/)).toBeTruthy()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/analytics/admin/apps?days=7')
    fireEvent.click(screen.getByText('30d'))
    await waitFor(() => expect(String(fetchMock.mock.calls[1]?.[0])).toContain('days=30'))
  })

  it('renders nothing when the endpoint is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })))
    const { container } = render(<AppUsageTable getToken={() => 'tok'} />)
    await waitFor(() => expect(container.innerHTML).toBe(''))
  })
})
