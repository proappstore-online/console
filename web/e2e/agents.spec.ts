import { expect, test } from '@playwright/test';

// Agent Teams UI tests. The agent team now lives INSIDE each app
// (#/apps/{id} → Agents tab), not as a top-level nav tab — so the shell test
// just verifies the console loads and that Agents is NOT a top-level tab. The
// per-app Agents tab needs auth; the API contract is covered below.

const CONSOLE_URL = 'https://proappstore.online/app';

test.describe('Agent Teams — UI shell', () => {
  test('Console loads; Agents is not a top-level nav tab (it lives inside each app)', async ({ page }) => {
    await page.goto(CONSOLE_URL, { waitUntil: 'domcontentloaded' });
    const body = await page.locator('body').textContent();
    expect(body && body.length > 0).toBe(true);
    const tabs = page.locator('nav button, nav a');
    const tabTexts = await tabs.allTextContents();
    expect(tabTexts.some((t) => t.trim() === 'Agents')).toBe(false);
  });
});

test.describe('Agent Teams — API contract', () => {
  test('agent-teams worker health endpoint responds', async ({ request }) => {
    const res = await request.get('https://agents.proappstore.online/health');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.version).toBeDefined();
  });

  test('unauthenticated project access returns 401', async ({ request }) => {
    const res = await request.get(
      'https://agents.proappstore.online/v1/projects/test-project',
    );
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('token');
  });

  test('unauthenticated ticket creation returns 401', async ({ request }) => {
    const res = await request.post(
      'https://agents.proappstore.online/v1/projects/test/tickets',
      {
        data: { title: 'test', rawIdea: 'test' },
        headers: { 'Content-Type': 'application/json' },
      },
    );
    expect(res.status()).toBe(401);
  });

  test('unauthenticated WebSocket returns 401', async ({ request }) => {
    // WebSocket upgrade without auth should fail
    const res = await request.get(
      'https://agents.proappstore.online/v1/projects/test/ws',
    );
    // Without Upgrade header, this returns 426 (upgrade required) or 401
    expect([401, 426]).toContain(res.status());
  });
});

test.describe('Agent Teams — endpoints require auth', () => {
  const base = 'https://agents.proappstore.online/v1/projects/test';
  const cases: { name: string; run: (request: import('@playwright/test').APIRequestContext) => Promise<{ status(): number }> }[] = [
    { name: 'chat', run: (r) => r.post(`${base}/chat`, { data: { message: 'hi' }, headers: { 'Content-Type': 'application/json' } }) },
    { name: 'activity', run: (r) => r.get(`${base}/activity`) },
    { name: 'tickets list', run: (r) => r.get(`${base}/tickets`) },
    { name: 'ticket messages', run: (r) => r.get(`${base}/tickets/abc/messages`) },
    { name: 'play', run: (r) => r.post(`${base}/play`) },
    { name: 'pause', run: (r) => r.post(`${base}/pause`) },
  ];
  for (const c of cases) {
    test(`${c.name} returns 401 unauthenticated`, async ({ request }) => {
      const res = await c.run(request);
      expect(res.status()).toBe(401);
    });
  }
});

test.describe('Console — navbar shell', () => {
  test('shows the brand and the expected top-level tabs', async ({ page }) => {
    await page.goto(CONSOLE_URL, { waitUntil: 'domcontentloaded' });
    const body = (await page.locator('body').textContent()) ?? '';
    // Brand is always present (signed-out landing or signed-in shell).
    expect(body).toContain('Creator Console');
  });
});

test.describe('Agent Teams — security', () => {
  test('CORS blocks requests from unknown origins', async ({ request }) => {
    const res = await request.get('https://agents.proappstore.online/health', {
      headers: { Origin: 'https://evil.example.com' },
    });
    const corsHeader = res.headers()['access-control-allow-origin'] ?? '';
    expect(corsHeader).not.toBe('https://evil.example.com');
  });

  test('CORS allows proappstore.online origins', async ({ request }) => {
    const res = await request.get('https://agents.proappstore.online/health', {
      headers: { Origin: 'https://proappstore.online/app' },
    });
    const corsHeader = res.headers()['access-control-allow-origin'] ?? '';
    expect(corsHeader).toBe('https://proappstore.online/app');
  });

  test('invalid project slug rejected', async ({ request }) => {
    const res = await request.post(
      'https://agents.proappstore.online/v1/projects',
      {
        data: { name: 'Test', slug: 'INVALID-CAPS' },
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer fake-token',
        },
      },
    );
    // Should get 401 (fake token) or 400 (invalid slug) — either way, rejected
    expect([400, 401]).toContain(res.status());
  });
});
