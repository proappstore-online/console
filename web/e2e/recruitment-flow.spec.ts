import { test, expect } from '@playwright/test'

for (const width of [320, 390]) test(`owner recruitment controls at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 812 })
  let accepting = true, refuseWrite = false
  const writes: unknown[] = []
  await page.addInitScript(() => localStorage.setItem('pas:session', JSON.stringify({ token: 'synthetic', user: { id: 'gh:1', name: 'Fixture', login: 'fixture', avatarUrl: null } })))
  await page.route(/^https:\/\/(api|agents)\.proappstore\.online\//, async route => {
    const req = route.request(), url = new URL(req.url())
    const headers = { 'access-control-allow-origin': 'http://localhost:4179', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,PUT,OPTIONS' }
    const reply = (json: unknown, status = 200) => route.fulfill({ status, headers, json })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (url.pathname === '/v1/apps/a/team/recruitment') {
      expect(req.headers().authorization).toBe('Bearer synthetic')
      if (req.method() === 'PUT') {
        writes.push(req.postDataJSON())
        if (refuseWrite) return reply({ error: 'not the app owner' }, 403)
        accepting = req.postDataJSON().accepting_requests
      }
      return reply({ appId: 'a', accepting_requests: accepting, updated_at: 1 })
    }
    if (url.pathname === '/v1/apps/a/enquiries') return reply({ enquiries: [], counts: { new: 0, total: 0 }, new_team_join_count: 0, new_general_count: 0, next: null })
    if (url.pathname === '/v1/auth/me') return reply({ id: 'gh:1', name: 'Fixture', login: 'fixture', avatarUrl: null })
    if (url.pathname === '/v1/apps') return reply({ apps: [{ id: 'a', creator_id: 'gh:1', name: 'Fixture app', created_at: 1, team_role: 'owner' }] })
    if (url.pathname === '/v1/me/is-admin') return reply({ admin: false })
    if (url.pathname === '/v1/apps/console/roles/ensure-member') return reply({ ok: true })
    if (url.pathname.endsWith('/projects')) return reply({ projects: [] })
    if (url.pathname === '/v1/me/administered-apps') return reply({ apps: [] })
    if (url.pathname === '/v1/keys/providers') return reply({ providers: [] })
    if (url.pathname === '/v1/keys/status') return reply({ keys: [] })
    return reply({ error: 'unconfigured fixture' }, 404)
  })
  await page.route(url => !['localhost', 'api.proappstore.online', 'agents.proappstore.online'].includes(url.hostname), route => route.abort())
  await page.goto('/#/apps/a/enquiries')
  const section = page.getByRole('region', { name: 'Team recruitment' })
  const checkbox = section.getByRole('checkbox', { name: 'Accept requests to join this app' })
  await expect(checkbox).toBeChecked()
  await checkbox.focus()
  await page.keyboard.press('Space')
  await expect(checkbox).not.toBeChecked()
  await expect(section.getByRole('status')).toContainText('Existing enquiries remain')
  expect(writes).toEqual([{ accepting_requests: false }])
  expect(await section.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  if (width === 320) await section.screenshot({ path: testInfo.outputPath('recruitment-320.png') })
  refuseWrite = true
  await checkbox.click()
  await expect(section.getByRole('alert')).toContainText('Could not confirm')
  await expect(checkbox).toHaveCount(0)
  await section.getByRole('button', { name: 'Refresh recruitment settings' }).click()
  await expect(checkbox).not.toBeChecked()
  await expect(page.getByText('No new enquiries.')).toBeVisible()
})
