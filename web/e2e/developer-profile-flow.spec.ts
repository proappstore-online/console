import { test, expect } from '@playwright/test'
import { reputation } from '../src/developerReputation.fixture'

for (const width of [320, 390]) test(`private contribution profile and saved collaborator preferences at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 812 })
  let denied = false
  let partial = false
  const writes: unknown[] = []
  await page.addInitScript(() => localStorage.setItem('pas:session', JSON.stringify({ token: 'synthetic', user: { id: 'gh:1', name: 'Fixture', login: 'fixture', avatarUrl: null } })))
  await page.route(/^https:\/\/(api|agents)\.proappstore\.online\//, async route => {
    const req = route.request(), url = new URL(req.url())
    const headers = { 'access-control-allow-origin': 'http://localhost:4179', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,PUT,OPTIONS' }
    const reply = (json: unknown, status = 200) => route.fulfill({ status, headers, json })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (url.pathname === '/v1/me/developer-reputation') {
      expect(req.headers().authorization).toBe('Bearer synthetic')
      if (denied) return reply({ error: 'session refused' }, 403)
      const r = reputation()
      if (partial) {
        r.apps[0] = { ...r.apps[0]!, state: 'partial', state_reason: 'Repository history is being reconciled.', verified: false }
        r.badges = []; r.summary.incomplete_apps = 1; r.summary.verified_contributed_repositories = 0
      }
      return reply(r)
    }
    if (url.pathname === '/v1/apps/a/team/public/me') {
      if (req.method() === 'PUT') { writes.push(req.postDataJSON()); return reply({ ok: true, visible: false }) }
      return reply({ appId: 'a', profile: { display_name: 'Saved collaborator', label: 'Designer', visible: false, show_promotion: false, updated_at: '2026-11-01' } })
    }
    if (url.pathname === '/v1/apps/a/team/public') return reply({ error: 'owner only' }, 403)
    if (url.pathname === '/v1/storefront/apps/a/team') return reply({ members: [] })
    if (url.pathname === '/v1/auth/me') return reply({ id: 'gh:1', name: 'Fixture', login: 'fixture', avatarUrl: null })
    if (url.pathname === '/v1/apps') return reply({ apps: [{ id: 'a', creator_id: 'gh:2', name: 'Fixture app', created_at: 1, team_role: 'developer' }] })
    if (url.pathname === '/v1/me/is-admin') return reply({ admin: false })
    if (url.pathname === '/v1/apps/console/roles/ensure-member') return reply({ ok: true })
    if (url.pathname.endsWith('/projects')) return reply({ projects: [] })
    if (url.pathname === '/v1/me/administered-apps') return reply({ apps: [] })
    if (url.pathname === '/v1/keys/providers') return reply({ providers: [] })
    if (url.pathname === '/v1/keys/status') return reply({ keys: [] })
    if (url.pathname === '/v1/apps/a/roles') return reply({ roles: [] })
    return reply({ error: 'unconfigured fixture' }, 404)
  })
  await page.route(url => !['localhost', 'api.proappstore.online', 'agents.proappstore.online'].includes(url.hostname), route => route.abort())
  await page.goto('/#profile')
  const section = page.getByRole('region', { name: 'Your developer contributions' })
  await expect(section.getByText('Code contributor', { exact: true })).toBeVisible()
  await expect(section.getByText('Verified: 3 commits · 42 lines added · 7 removed')).toBeVisible()
  expect(await section.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  if (width === 320) await section.screenshot({ path: testInfo.outputPath('private-developer-profile-320.png') })
  partial = true
  await section.getByRole('button', { name: 'Refresh contribution profile' }).focus()
  await page.keyboard.press('Enter')
  await expect(section.getByText('Recorded so far: 3 commits · 42 lines added · 7 removed')).toBeVisible()
  await expect(section.getByRole('list', { name: 'Contribution badges' })).toHaveCount(0)
  denied = true
  await section.getByRole('button', { name: 'Refresh contribution profile' }).click()
  await expect(section.getByRole('alert')).toContainText('Sign in again')
  await expect(section.getByText('example-app', { exact: true })).toHaveCount(0)

  await page.goto('/#/apps/a/settings/access')
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Saved collaborator')
  await expect(page.getByLabel('Label (optional)', { exact: true })).toHaveValue('Designer')
  await expect(page.getByLabel('Show me on this app’s public team')).not.toBeChecked()
  await page.getByLabel('Label (optional)', { exact: true }).fill('Translator')
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(page.getByText('Saved. Your profile is not public.')).toBeVisible()
  expect(writes).toEqual([{ display_name: 'Saved collaborator', label: 'Translator', visible: false, show_promotion: false }])
  expect(await page.getByRole('region', { name: 'Public team', exact: true }).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
})
