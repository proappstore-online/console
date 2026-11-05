import { test, expect } from '@playwright/test'
import { summary, people, person } from '../src/contributions.fixture'

test('mobile contribution filters, pagination, partial history, zero and revoked access', async ({ page }) => {
 let denied = false
 let mode = 'ok'
 const seen: URL[] = []
 await page.addInitScript(() => localStorage.setItem('pas:session', JSON.stringify({ token: 'synthetic', user: { id: 'gh:1', name: 'Fixture', login: 'fixture', avatarUrl: null } })))
 await page.route(/^https:\/\/(api|agents)\.proappstore\.online\//, async route => {
  const req = route.request(), url = new URL(req.url())
  const headers = { 'access-control-allow-origin': 'http://localhost:4179', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,OPTIONS' }
  const reply = (json: unknown, status = 200) => route.fulfill({ status, headers, json })
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
  if (url.pathname.includes('/contributions')) {
   seen.push(url); expect(req.headers().authorization).toBe('Bearer synthetic')
   if (denied) return reply({ error: 'membership revoked' }, 403)
   const s = summary(), p = people()
   s.state = p.state = mode as 'ok' | 'partial' | 'empty' | 'error'
   s.state_reason = p.state_reason = 'Fixture ' + mode
   s.complete = p.complete = mode !== 'partial'
   if (mode === 'empty') {
    p.people = []; p.eligible_additions = 0
    s.totals = { additions: 0, deletions: 0, commits: 0, people: 0, truncated_commits: 0, co_authored_commits: 0 }
    s.buckets = { bots: { additions: 0, deletions: 0, commits: 0 }, unlinked: { additions: 0, deletions: 0, commits: 0 } }
   }
   else { p.people = [person(url.searchParams.has('cursor') ? 2 : 1)]; p.next = url.searchParams.has('cursor') ? null : { cursor: '1.80.1' } }
   return reply(url.pathname.endsWith('/people') ? p : s)
  }
  if (url.pathname === '/v1/auth/me') return reply({ id: 'gh:1', name: 'Fixture', login: 'fixture', avatarUrl: null })
  if (url.pathname === '/v1/apps') return reply({ apps: [{ id: 'a', creator_id: 'gh:1', name: 'Fixture app', created_at: 1, team_role: 'viewer' }] })
  if (url.pathname === '/v1/me/is-admin') return reply({ admin: false })
  if (url.pathname === '/v1/apps/console/roles/ensure-member') return reply({ ok: true })
  if (url.pathname.endsWith('/projects')) return reply({ projects: [] })
  if (url.pathname === '/v1/me/administered-apps') return reply({ apps: [] })
  return reply({ error: 'unconfigured fixture' }, 404)
 })
 await page.route(url => !['localhost', 'api.proappstore.online', 'agents.proappstore.online'].includes(url.hostname), route => route.abort())
 await page.goto('/#/apps/a/contributions')
 await expect(page.getByText('Linked to PAS account', { exact: true })).toBeVisible()
 await page.getByRole('button', { name: 'Load more', exact: true }).focus()
 await page.keyboard.press('Enter')
 await expect(page.getByText('Unmatched PAS account', { exact: true })).toBeVisible()
 expect(await page.getByRole('region', { name: 'Project contributions' }).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
 expect(seen.some(url => url.searchParams.get('cursor') === '1.80.1')).toBe(true)
 await page.getByRole('button', { name: 'Last 30 days' }).click()
 await expect(page.getByText('Linked to PAS account', { exact: true })).toBeVisible()
 expect(seen.some(url => url.searchParams.has('from'))).toBe(true)
 await page.getByRole('button', { name: 'Custom', exact: true }).click()
 await page.getByLabel('From (UTC)', { exact: true }).fill('2026-01-01')
 await page.getByLabel('To (UTC, exclusive)', { exact: true }).fill('2026-02-01')
 await expect.poll(() => seen.some(url => url.searchParams.get('to') === '2026-02-01')).toBe(true)
 mode = 'partial'; await page.getByRole('button', { name: 'Refresh contributions' }).click()
 await expect(page.getByText('History is still being counted')).toBeVisible()
 mode = 'error'; await page.getByRole('button', { name: 'Refresh contributions' }).click()
 await expect(page.getByText('Could not read contributions')).toBeVisible()
 await expect(page.getByRole('list', { name: 'Contributor ranking' })).toHaveCount(0)
 mode = 'ok'; await page.getByRole('button', { name: 'Refresh contributions' }).click()
 await expect(page.getByText('Linked to PAS account', { exact: true })).toBeVisible()
 mode = 'empty'; await page.getByRole('button', { name: 'Refresh contributions' }).click()
 await expect(page.getByText('No counted commits in this period.')).toBeVisible()
 denied = true; await page.getByRole('button', { name: 'Refresh contributions' }).click()
 await expect(page.getByText('Access denied to this project’s contributions')).toBeVisible()
 await expect(page.getByRole('list', { name: 'Contributor ranking' })).toHaveCount(0)
 const section = page.getByRole('region', { name: 'Project contributions' })
 expect(await section.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
})
