import { expect, test } from '@playwright/test';

const APP_URL = 'https://proappstore.online/app';
const API_BASE = 'https://api.proappstore.online/v1';

test.describe('Services — public API', () => {
  test('developer directory returns 200 with array', async ({ request }) => {
    const res = await request.get(`${API_BASE}/services/developers`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.developers)).toBe(true);
  });

  test('developer directory supports search', async ({ request }) => {
    const res = await request.get(`${API_BASE}/services/developers?q=nonexistent-dev-xyz`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.developers).toHaveLength(0);
  });

  test('developer directory supports sort and rate filter', async ({ request }) => {
    const res = await request.get(`${API_BASE}/services/developers?sort=rate&maxRate=100`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.developers)).toBe(true);
    for (const d of body.developers) {
      expect(d.promptRateCents).toBeLessThanOrEqual(100);
    }
  });

  test('single developer profile returns 404 for unknown id', async ({ request }) => {
    const res = await request.get(`${API_BASE}/services/developers/nonexistent`);
    expect(res.status()).toBe(404);
  });

  test('build requests returns 200 with array (public)', async ({ request }) => {
    const res = await request.get(`${API_BASE}/services/requests`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.requests)).toBe(true);
  });
});

test.describe('Services — auth-gated API', () => {
  test('balance returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${API_BASE}/services/balance`);
    expect(res.status()).toBe(401);
  });

  test('profile returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${API_BASE}/services/profile`);
    expect(res.status()).toBe(401);
  });

  test('engagements returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${API_BASE}/services/engagements`);
    expect(res.status()).toBe(401);
  });

  test('earnings returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${API_BASE}/services/earnings`);
    expect(res.status()).toBe(401);
  });

  test('my-requests returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${API_BASE}/services/my-requests`);
    expect(res.status()).toBe(401);
  });

  test('deposit rejects bad amount', async ({ request }) => {
    const res = await request.post(`${API_BASE}/services/balance/deposit`, {
      headers: { 'Content-Type': 'application/json' },
      data: { amountCents: 500, successUrl: 'https://proappstore.online/app', cancelUrl: 'https://proappstore.online/app' },
    });
    // Either 401 (no auth) or 400 (bad amount) — both acceptable
    expect([400, 401]).toContain(res.status());
  });

  test('engagement creation rejects without auth', async ({ request }) => {
    const res = await request.post(`${API_BASE}/services/engagements`, {
      headers: { 'Content-Type': 'application/json' },
      data: { developerId: 'gh:1' },
    });
    expect(res.status()).toBe(401);
  });

  test('recompute-stats rejects without internal token', async ({ request }) => {
    const res = await request.post(`${API_BASE}/services/recompute-stats`);
    expect(res.status()).toBe(403);
  });

  test('refund rejects without auth', async ({ request }) => {
    const res = await request.post(`${API_BASE}/services/engagements/fake-id/refund`, {
      headers: { 'Content-Type': 'application/json' },
      data: { amountCents: 100 },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('Services — UI shell', () => {
  test('/app loads and shows content', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    const body = await page.locator('body').textContent();
    expect(body && body.length > 0).toBe(true);
  });

  test('storefront /services page loads developer directory', async ({ page }) => {
    await page.goto('https://proappstore.online/services', { waitUntil: 'domcontentloaded' });
    const title = await page.title();
    expect(title).toContain('Hire a Developer');
    // Wait for the API-loaded developer grid
    await page.waitForSelector('.developers-grid', { timeout: 5000 });
  });

  test('storefront nav links point to /app (not console.proappstore.online)', async ({ page }) => {
    await page.goto('https://proappstore.online/', { waitUntil: 'domcontentloaded' });
    const consoleLinks = await page.locator('a[href*="console.proappstore.online"]').count();
    expect(consoleLinks).toBe(0);
    const appLinks = await page.locator('a[href="/app"], a[href^="/app/"]').count();
    expect(appLinks).toBeGreaterThan(0);
  });
});

test.describe('Services — /app proxy', () => {
  test('/app/ serves SPA with relative asset paths', async ({ request }) => {
    const res = await request.get(`${APP_URL}/`);
    expect(res.ok()).toBe(true);
    const html = await res.text();
    expect(html).toContain('src="./assets/');
    expect(html).toContain('href="./assets/');
  });

  test('/app/manifest.webmanifest has correct scope', async ({ request }) => {
    const res = await request.get(`${APP_URL}/manifest.webmanifest`);
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest.scope).toBe('/app/');
    expect(manifest.start_url).toBe('/app/');
    // Distinct from the storefront: the console PWA is branded "ProAppStore Console".
    expect(manifest.name).toBe('ProAppStore Console');
  });

  test('/app/nonexistent returns 200 (SPA fallback)', async ({ request }) => {
    const res = await request.get(`${APP_URL}/some-random-route`);
    expect(res.ok()).toBe(true);
    const html = await res.text();
    expect(html).toContain('<div id="root">');
  });
});
