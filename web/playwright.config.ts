import { defineConfig } from '@playwright/test';

// Two projects:
// - `chromium`: mirrors fws/platform/packages/create's setup — public-only
//   smoke specs run against prod (console.proappstore.online). Auth-gated flows
//   would need a real PAS session token, which CI does not have.
// - `operator-flow`: the admin (operator) flow end to end (platform#300) — the
//   real console UI, built and served locally by `vite preview`, signed in with
//   a fake token, with every backend request answered by an in-memory fake API
//   (e2e/operator-flow.spec.ts). No network, no real session.
const PREVIEW_PORT = 4179;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // Retry transient failures in CI — deploy-just-finished CDN propagation
  // races, network jitter. Locally fail fast.
  retries: process.env.CI ? 2 : 0,
  use: {
    headless: true,
    // The console ships a PWA service worker (vite-plugin-pwa with
    // generateSW + autoUpdate). When Playwright navigates, the SW
    // intercepts the page-load chain and the default `waitUntil: 'load'`
    // can hang past the timeout if any precached resource stalls.
    // Block the SW entirely for tests — we're not testing the SW here.
    // (Blocking it also keeps page.route in charge of every request.)
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /operator-flow\.spec\.ts/,
      use: { browserName: 'chromium', baseURL: 'https://console.proappstore.online' },
    },
    {
      name: 'operator-flow',
      testMatch: /operator-flow\.spec\.ts/,
      use: { browserName: 'chromium', baseURL: `http://localhost:${PREVIEW_PORT}` },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PREVIEW_PORT} --strictPort`,
    url: `http://localhost:${PREVIEW_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
