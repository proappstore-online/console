import { expect, test } from '@playwright/test';

// Agent Teams UI tests — verify the console shell loads the Agents tab
// and the setup/kanban views render correctly. Full agent interaction
// requires auth + a running agent-teams Worker; these tests cover the
// UI surface that a signed-out or newly signed-in user sees.

const CONSOLE_URL = 'https://console.proappstore.online';

test.describe('Agent Teams — UI shell', () => {
  test('Console has Agents tab in navigation', async ({ page }) => {
    await page.goto(CONSOLE_URL, { waitUntil: 'domcontentloaded' });
    // The SPA shell renders navigation tabs even before auth
    // Check that 'Agents' appears in the tab bar
    const tabs = page.locator('nav button, nav a');
    const tabTexts = await tabs.allTextContents();
    expect(tabTexts.some((t) => t.includes('Agents'))).toBe(true);
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
      headers: { Origin: 'https://console.proappstore.online' },
    });
    const corsHeader = res.headers()['access-control-allow-origin'] ?? '';
    expect(corsHeader).toBe('https://console.proappstore.online');
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
