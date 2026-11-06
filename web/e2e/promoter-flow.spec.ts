import { test, expect, type Page } from '@playwright/test'

// Synthetic contract flow: real Console + real SDK OAuth routing, in-memory API.
// Hosted app mediation/activation is simulated here; backend activation enforcement
// belongs to platform's tests. No provider, real person or campaign is contacted.
const user = { id: 'google:synthetic', name: 'Synthetic Pat', login: 'synthetic', avatarUrl: null, dateOfBirth: null, isChild: false }
const token = 'synthetic-person-session'

async function setup(page: Page, options: { ready?: boolean; enrolled?: boolean; admin?: boolean } = {}) {
  let enrolled = options.enrolled ?? false, confirmed = false, pending = false
  const writes: { path: string; body: unknown }[] = []
  const unexpected: string[] = []
  const p = () => ({ promoter_id: 'p1', app_id: 'stash', status: 'active', code: '23456789', code_active: true, display_name: 'Pat', share_path: '/apps/stash?ref=23456789', share_url: 'https://proappstore.online/apps/stash?ref=23456789', app_public: true, status_reason: null, consented_at: 1, created_at: 1, updated_at: 1 })
  await page.context().route('https://referral-fixture.test/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<button onclick="fetch(\'/claim\',{method:\'POST\'}).then(()=>document.body.dataset.claim=\'pending\')">Claim shared code</button><button onclick="fetch(\'/.pas/api/first-use\').then(()=>document.body.dataset.activation=\'confirmed\')">Use app as new signed-in person</button>' })
    if (url.pathname === '/claim') { pending = true; return route.fulfill({ json: { credited: false, state: 'pending' } }) }
    if (url.pathname === '/.pas/api/first-use' && pending) { confirmed = true; pending = false; return route.fulfill({ json: { ok: true } }) }
    return route.fulfill({ status: 400 })
  })
  await page.context().route(/^https:\/\/(api|agents)\.proappstore\.online\//, async (route) => {
    const request = route.request(), url = new URL(request.url())
    const path = url.pathname
    const headers = { 'access-control-allow-origin': request.headers().origin || 'http://localhost:4179', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' }
    const reply = (json: unknown, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(json) })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/v1/auth/google/start') {
      const back = new URL(url.searchParams.get('return_to')!)
      expect(back.searchParams.get('promoter')).toBe('1')
      expect(back.searchParams.get('promoter_app')).toBe('stash')
      expect(back.hash).toBe('')
      back.hash = 'pas_session=' + token
      // Playwright's Windows WebKit interception cannot fulfill a 302. A fake
      // provider page navigates to the same callback; the SDK start/return_to
      // and callback processing remain real on both browser projects.
      return route.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(back.href)})</script>` })
    }
    if (path.endsWith('/readiness')) return reply({ enrollment_open: true, referral_tracking: { ready: options.ready !== false, reason: options.ready === false ? 'sdk_unsupported' : null, protocol_version: 1 } })
    if (path === '/v1/storefront/promoters/apps') return reply({ apps: [{ appId: 'stash', iconUrl: null, tagline: null, category: null }, { appId: 'other', iconUrl: null, tagline: null, category: null }], next: null })
    if (request.headers().authorization !== 'Bearer ' + token) return reply('not signed in', 401)
    if (path === '/v1/auth/me') return reply(user)
    if (path === '/v1/apps/console/roles/ensure-member') return reply({ ok: true })
    if (path === '/v1/apps' || path === '/v1/me/administered-apps') return reply({ apps: [] })
    if (path === '/v1/me/is-admin') return reply({ admin: options.admin ?? false })
    if (path === '/v1/subscription') return reply(null)
    if (path === '/v1/usage/owner-summary') return reply({ activeUsers: 0 })
    if (path === '/v1/projects') return reply({ projects: [] })
    if (path === '/v1/promoters/me') return reply({ promoters: enrolled ? [p()] : [] })
    if (path === '/v1/apps/stash/promoters/enroll') {
      const body = request.postDataJSON(); writes.push({ path, body })
      expect(body).toMatchObject({ consent: true, return_path: '/#/promoter?app=stash' })
      enrolled = true; return reply({ ok: true, created: true, reactivated: false, promoter: p() }, 201)
    }
    if (path === '/v1/apps/stash/promoters/me') return enrolled ? reply({ promoter: p() }) : reply('not found', 404)
    if (path === '/v1/apps/other/promoters/me') return reply('not found', 404)
    if (path === '/v1/apps/stash/team/public/me') return reply({ appId: 'stash', profile: null })
    if (path === '/v1/apps/stash/promoters/me/contributions') return reply({
      version: 1, app_id: 'stash', freshness: { as_of: Date.now(), referrals_recorded_since: 1760000000000, note: 'Synthetic coverage starts with activation recording.' },
      contributions: {
        promotion: { promoter_status: 'active', recorded: confirmed, first_confirmed_at: confirmed ? Date.now() : null, counts: { confirmed: confirmed ? 1 : 0, pending: pending ? 1 : 0, reversed: 0, expired: 0 }, share_of_referred_users: { numerator: confirmed ? 1 : 0, denominator: confirmed ? 1 : 0, ratio: confirmed ? 1 : 0, percent: confirmed ? 100 : 0, basis: 'Share among promoters' }, standing: { rank: confirmed ? 1 : null, ranked_promoters: confirmed ? 1 : 0, tied_on_count: false } },
        code: { available: false, reason: 'Code is reported separately.' },
      },
    })
    if (path === '/v1/apps/stash/promoters/me/referrals') return reply({ promoter_status: 'active', counts: { pending: pending ? 1 : 0, confirmed: confirmed ? 1 : 0 }, referrals: confirmed || pending ? [{ referral_id: 'r1', status: confirmed ? 'confirmed' : 'pending', captured_at: Date.now(), expires_at: Date.now() + 86400000, activated_at: confirmed ? Date.now() : null, confirmed_at: confirmed ? Date.now() : null }] : [], next: null })
    unexpected.push(path); return reply('unhandled synthetic request', 404)
  })
  await page.context().route((url) => !['localhost', 'api.proappstore.online', 'agents.proappstore.online', 'referral-fixture.test'].includes(url.hostname), (route) => route.abort())
  return { writes, unexpected }
}

for (const admin of [false, true]) test(`creator navigation opens Promoters and returns to dashboard (admin=${admin})`, async ({ page }) => {
  const fixture = await setup(page, { admin })
  await page.goto('/#pas_session=' + token)
  await expect(page.getByRole('heading', { name: 'Welcome, synthetic' })).toBeVisible()
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 812 })
    const entry = page.getByRole('navigation').getByRole('button', { name: 'Promoters', exact: true })
    await expect(entry).toBeVisible()
    if (width === 1280) await expect(entry.getByText('Promoters')).toBeVisible()
    await entry.click()
    await expect(page).toHaveURL(/#\/promoter$/)
    await expect(page.getByRole('heading', { name: 'Promoter workspace' })).toBeVisible()
    await page.getByLabel('App', { exact: true }).selectOption('stash')
    await expect(page.getByRole('heading', { name: 'Enroll to promote this app' })).toBeVisible()
    await page.reload()
    await expect(page).toHaveURL(/#\/promoter\?app=stash$/)
    await expect(page.getByLabel('App', { exact: true })).toHaveValue('stash')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('link', { name: 'Creator Console', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Welcome, synthetic' })).toBeVisible()
  }
  expect(fixture.writes).toEqual([])
  expect(fixture.unexpected).toEqual([])
})

test('mobile: SDK sign-in, no-owned-app enrollment, link/QR, qualified fixture activation, own contribution, history and account switch', async ({ page, context }) => {
  const fixture = await setup(page)
  await page.goto('/#/promoter?app=stash')
  const signIn = page.getByRole('button', { name: 'Sign in with Google' })
  await signIn.focus(); await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Enroll to promote this app' })).toBeVisible()
  await expect(page).toHaveURL(/#\/promoter\?app=stash$/)
  await page.getByLabel('Optional display name').fill('Pat')
  await page.getByLabel('I consent').check()
  await page.getByRole('button', { name: 'Enroll', exact: true }).click()
  await expect(page.getByText('Your share: 0%')).toBeVisible()
  const qr = page.getByAltText('QR code for your personal app link')
  await expect(qr).toHaveAttribute('src', /^data:image\/png;base64,/)
  await expect(page.getByText('https://proappstore.online/apps/stash?ref=23456789', { exact: true })).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download materials' }).click()
  expect((await download).suggestedFilename()).toBe('stash-promotion.txt')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const referred = await context.newPage()
  await referred.goto('https://referral-fixture.test/?ref=23456789')
  await referred.getByRole('button', { name: 'Claim shared code' }).click()
  await expect(referred.locator('body')).toHaveAttribute('data-claim', 'pending')
  await page.getByRole('button', { name: 'Refresh contributions' }).click()
  await expect(page.getByText('Your share: 0%')).toBeVisible()
  await referred.getByRole('button', { name: 'Use app as new signed-in person' }).click()
  await expect(referred.locator('body')).toHaveAttribute('data-activation', 'confirmed')
  await page.getByRole('button', { name: 'Refresh contributions' }).click()
  await expect(page.getByText('Your share: 100%')).toBeVisible()
  await expect(page.getByText(/Your standing: #1 of 1/)).toBeVisible()
  await page.getByLabel('Period', { exact: true }).selectOption('7d')
  await expect(page.getByText('Your share: 100%')).toBeVisible()
  await page.getByLabel('App', { exact: true }).selectOption('other')
  await expect(page.getByRole('heading', { name: 'Enroll to promote this app' })).toBeVisible()
  await page.goBack()
  await expect(page.getByText('Your share: 100%')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Your share: 100%')).toBeVisible()
  await page.getByRole('button', { name: 'Switch account' }).click()
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
  await expect(page).toHaveURL(/#\/promoter\?app=stash$/)
  await page.getByRole('button', { name: 'Sign in with Google' }).click()
  await expect(page.getByText('Your share: 100%')).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
  await expect(page).toHaveURL(/#\/promoter\?app=stash$/)
  expect(fixture.writes).toHaveLength(1)
  expect(fixture.unexpected).toEqual([])
})

test('direct OAuth failure returns to promoter entry with safe app context', async ({ page }) => {
  await setup(page)
  await page.goto('/?promoter=1&promoter_app=stash#auth_error=access_denied')
  await expect(page.getByText(/Sign-in did not complete/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
})

test('mobile: unavailable tracking blocks direct enrollment and active sharing but preserves history', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  const fixture = await setup(page, { ready: false, enrolled: true })
  await page.goto('/#/promoter?app=stash')
  await page.getByRole('button', { name: 'Sign in with Google' }).click()
  await expect(page.getByText('Your share: 0%')).toBeVisible()
  await expect(page.getByText(/older or unsupported SDK/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy link' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Download materials' })).toHaveCount(0)
  await expect(page.getByAltText('QR code for your personal app link')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Withdraw from promotion' })).toBeVisible()
  await page.getByLabel('App', { exact: true }).selectOption('other')
  await page.getByLabel('I consent').check()
  await expect(page.getByRole('button', { name: 'Enroll', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(fixture.writes).toHaveLength(0)
  expect(fixture.unexpected).toEqual([])
})
