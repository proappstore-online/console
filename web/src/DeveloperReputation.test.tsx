/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DeveloperReputation } from './DeveloperReputation'
import { reputation } from './developerReputation.fixture'

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('shows private verified evidence and badges using the person’s token without cookies', async () => {
  const fetch = vi.fn(async () => response(reputation()))
  vi.stubGlobal('fetch', fetch)
  render(<DeveloperReputation token="person-session" />)
  await screen.findByText('Code contributor')
  expect(screen.getByText('Verified: 3 commits · 42 lines added · 7 removed')).toBeTruthy()
  expect(screen.getByText(/not lifetime participation/)).toBeTruthy()
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/me/developer-reputation'), expect.objectContaining({ credentials: 'omit', headers: expect.objectContaining({ Authorization: 'Bearer person-session' }) }))
})

it('keeps unavailable and partial evidence distinct from verified zero', async () => {
  const r = reputation()
  r.apps[0] = { ...r.apps[0]!, state: 'unavailable', state_reason: 'History has not been read.', counts: null, verified: false }
  r.badges = []; r.summary.incomplete_apps = 1; r.summary.verified_contributed_repositories = 0
  vi.stubGlobal('fetch', vi.fn(async () => response(r)))
  render(<DeveloperReputation token="t" />)
  await screen.findByText('Code totals unavailable')
  expect(screen.queryByText(/0 commits/)).toBeNull()
  expect(screen.queryByRole('list', { name: 'Contribution badges' })).toBeNull()
  r.apps[0] = { ...r.apps[0]!, state: 'partial', state_reason: 'Repository history is being reconciled.', counts: { commits: 2, additions: 8, deletions: 1 } }
  fireEvent.click(screen.getByRole('button', { name: 'Refresh contribution profile' }))
  await screen.findByText('Recorded so far: 2 commits · 8 lines added · 1 removed')
})

it.each([401, 403, 404, 500])('clears previously shown data after a refused or failed refresh (%s)', async (status) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(reputation())).mockResolvedValueOnce(response({ error: 'unavailable' }, status)))
  render(<DeveloperReputation token="t" />)
  await screen.findByText('Code contributor')
  fireEvent.click(screen.getByRole('button', { name: 'Refresh contribution profile' }))
  await screen.findByRole('alert')
  expect(screen.queryByText('example-app')).toBeNull()
  expect(screen.queryByText('Code contributor')).toBeNull()
})

it('rejects malformed totals and recovers through refresh', async () => {
  const bad = reputation(); bad.apps[0]!.counts!.commits = -1
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(bad)).mockResolvedValueOnce(response(reputation())))
  render(<DeveloperReputation token="t" />)
  await screen.findByRole('alert')
  expect(screen.queryByText('example-app')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh contribution profile' }))
  await screen.findByText('Code contributor')
})

it('never restores a delayed profile from the previous session', async () => {
  let finish: (r: Response) => void = () => {}
  const empty = reputation(); empty.apps = []; empty.badges = []; empty.summary = { current_apps: 0, verified_contributed_repositories: 0, incomplete_apps: 0 }
  vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve })).mockResolvedValueOnce(response(empty)))
  const { rerender } = render(<DeveloperReputation token="old" />)
  rerender(<DeveloperReputation token="new" />)
  await screen.findByText('You do not currently own or belong to an app team.')
  finish(response(reputation()))
  await waitFor(() => expect(screen.queryByText('example-app')).toBeNull())
})
