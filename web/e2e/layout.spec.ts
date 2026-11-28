import { expect, test, type Page } from '@playwright/test';
import { FakeApi, OPERATOR_RECORD, OWNER_TOKEN, USER } from './layout-fake-api';

// console#27: no Console page scrolls sideways, at phone and desktop widths.
// Every route — the dashboard, every app tab and settings subtab, the operator
// view with its audit trail and a record page, and the console's other views —
// is opened at 375px and 1280px with long, realistic data from the in-memory
// fake (layout-fake-api.ts), signed in as the app owner. Nothing reaches the
// network.
//
// The console's shell is a fixed-height column whose panes scroll on their
// own, so the document never grows wider than the window even when a pane
// does. The check therefore asserts, besides the document itself, that no
// scrolling element scrolls sideways and that nothing pokes out past the
// window's right edge (where the shell would clip it).

const WIDTHS = [375, 1280];

type Step = (page: Page) => Promise<void>;
const ROUTES: { hash: string; ready: (page: Page) => ReturnType<Page['getByText']>; then?: Step }[] = [
  { hash: '#/', ready: (p) => p.getByText('Total Apps') },
  { hash: '#/apps/stash/operator', ready: (p) => p.getByRole('heading', { name: 'Drivers', level: 4 }),
    then: async (p) => {
      await p.getByRole('button', { name: 'Show audit trail' }).click();
      await expect(p.getByText('Opened record: Drivers').first()).toBeVisible();
    } },
  { hash: `#/apps/stash/operator/drivers/${encodeURIComponent(OPERATOR_RECORD)}`, ready: (p) => p.getByText('GR-THE-2019-0000418823-B-CE-D1E-PROFESSIONAL') },
  { hash: '#/apps/stash/analytics', ready: (p) => p.getByText('ride_requested_from_driver_dispatch_board_overnight_shift') },
  { hash: '#/apps/stash/logs', ready: (p) => p.getByText(/Request to https:\/\/stash/) },
  { hash: '#/apps/stash/enquiries', ready: (p) => p.getByText('Alexandra Konstantinopoulou-Vasilopoulou') },
  { hash: '#/apps/stash/promoters', ready: (p) => p.getByText('BMF-LOGISTICS-PARTNERS') },
  { hash: '#/apps/stash/spending', ready: (p) => p.getByText('claude-haiku-4-5') },
  { hash: '#/apps/stash/build', ready: (p) => p.getByText(/Reconcile driver payout statements/) },
  { hash: '#/apps/stash/research', ready: (p) => p.getByText(/Research EU e-invoicing mandates/) },
  { hash: '#/apps/stash/data', ready: (p) => p.getByText('cooperative_settlement_ledger_entries_partitioned_by_region'),
    then: async (p) => {
      await p.getByText('rides', { exact: true }).first().click();
      await expect(p.getByText('ride_01JDX8Q6Z3V9K2M4N7P1R5T8W0').first()).toBeVisible();
    } },
  { hash: '#/apps/stash/test', ready: (p) => p.getByText(/invoice-bulk-upload-multipage/) },
  { hash: '#/apps/stash/control', ready: (p) => p.getByText('security-secrets-and-injection') },
  { hash: '#/apps/stash/server', ready: (p) => p.getByText('archive_completed_rides_older_than_ninety_days_for_gdpr_retention') },
  { hash: '#/apps/stash/contributions', ready: (p) => p.getByText('dimitrios-papadopoulos-thessaloniki-cooperative') },
  { hash: '#/apps/stash/style', ready: (p) => p.getByRole('main') },
  { hash: '#/apps/stash/settings/storefront', ready: (p) => p.getByText('Stash — Receipts, Payout Statements & Fleet Invoice Vault — Settings') },
  { hash: '#/apps/stash/settings/publishing', ready: (p) => p.getByText('book-a-ride-now.patras-and-western-greece-driver-collective.example.com') },
  { hash: '#/apps/stash/settings/agents', ready: (p) => p.getByText(/Researches the domain/) },
  { hash: '#/apps/stash/settings/integrations', ready: (p) => p.getByText('list_rides_awaiting_settlement_for_cooperative_treasurer_review') },
  { hash: '#/apps/stash/settings/access', ready: (p) => p.getByText('Cooperative treasurer (settlement approvals)') },
  { hash: '#/apps/stash/settings/danger', ready: (p) => p.getByText('Danger Zone') },
  { hash: '#/publish', ready: (p) => p.getByText(/real-time telematics ingestion/) },
  { hash: '#/payouts', ready: (p) => p.getByText(LONG_APP) },
  { hash: '#/subscription', ready: (p) => p.getByRole('main') },
  { hash: '#/services', ready: (p) => p.getByText(USER.login) },
  { hash: '#/profile', ready: (p) => p.getByText(/GitHub rate-limited the history walk/) },
  { hash: '#/ui-library', ready: (p) => p.getByRole('main') },
  { hash: '#/provision', ready: (p) => p.getByRole('main') },
  { hash: '#/directory', ready: (p) => p.getByText('Enterprise Fleet Telemetry Reconciliation Service (EU Region)') },
  { hash: '#/admin', ready: (p) => p.getByText('stash-e2e-settlement-ledger-smoke-tests-for-cooperative-treasurers'),
    then: async (p) => {
      await p.getByRole('button', { name: 'stash-e2e-settlement-ledger-smoke-tests-for-cooperative-treasurers' }).first().click();
      await expect(p.getByText('proappstore-online/stash-end-to-end-settlement-ledger-regression-suite').first()).toBeVisible();
    } },
  { hash: '#/promoter?app=stash', ready: (p) => p.getByText('K7Q2M9X4') },
];
const LONG_APP = 'stash-enterprise-fleet-telemetry-reconciliation-service-eu';

/** What makes the page wider than the window: the document, sideways-scrolling elements, and elements past the right edge. */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const name = (el: Element) => {
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 4).join('.')}` : '';
      const text = (el.textContent ?? '').trim().slice(0, 60);
      return `<${el.tagName.toLowerCase()}${id}${cls}> "${text}"`;
    };
    const scrollsX = (el: Element) => {
      const s = getComputedStyle(el);
      return (s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1;
    };
    const clips = (el: Element) => ['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(el).overflowX);
    /** The innermost elements that stick out past `box`'s right edge: what makes it overflow. */
    const causes = (box: Element) => {
      const edge = box.getBoundingClientRect().right + 1;
      // Boxes that cross the edge, and boxes whose own text runs past them (an unbreakable string).
      const wide = [...box.querySelectorAll('*')].filter((d) => d.getBoundingClientRect().right > edge
        || (d.scrollWidth > d.clientWidth + 1 && getComputedStyle(d).overflowX === 'visible'));
      return wide.filter((d) => !wide.some((o) => o !== d && d.contains(o))).slice(0, 3).map(name).join(' | ');
    };
    // Strips meant to scroll sideways: code blocks. Tab strips wrap instead (console#30).
    const deliberate = (el: Element) => el.tagName === 'PRE';
    const scrolling: string[] = [];
    const outside: string[] = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (scrollsX(el) && !deliberate(el)) scrolling.push(`${name(el)} — because of ${causes(el)}`);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.right <= vw + 1) continue;
      // Past the right edge: a fault unless an ancestor short of the shell clips or scrolls it (e.g. a
      // closed drawer), and only the outermost such element is worth naming.
      let clipped = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        if (a.parentElement === document.getElementById('root')) break; // the shell: its clipping is what hides the bug
        if (clips(a)) { clipped = true; break; }
      }
      const parent = el.parentElement?.getBoundingClientRect();
      if (!clipped && !(parent && parent.right > vw + 1)) outside.push(name(el));
    }
    return { documentWidth: document.documentElement.scrollWidth, windowWidth: vw, scrolling, outside };
  });
}

test('no Console route scrolls sideways at 375px or 1280px (console#27)', async ({ page }) => {
  test.setTimeout(240_000);
  const api = new FakeApi();
  await page.route(/^https:\/\/([a-z0-9-]+\.)?proappstore\.online\//, (route, request) => api.handle(route, request));
  // Third-party assets (fonts, analytics beacon) are not under test: keep the run offline.
  await page.route((url) => url.hostname !== 'localhost' && !/(^|\.)proappstore\.online$/.test(url.hostname), (route) => route.abort());
  // The agent team's live channel: left open and silent, the console polls instead.
  await page.routeWebSocket(/^wss:\/\/agents\.proappstore\.online\//, () => {});
  await page.addInitScript(([token, user]) => {
    localStorage.setItem('pas:session', JSON.stringify({ token, user }));
    localStorage.setItem('pas:services-onboarded', '1');
  }, [OWNER_TOKEN, USER] as const);

  const failures: string[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 812 });
    for (const route of ROUTES) {
      await page.goto('about:blank');
      await page.goto(`/${route.hash}`);
      const ready = route.ready(page).filter({ visible: true }).first();
      try {
        await expect(ready, `${route.hash} at ${width}px`).toBeVisible();
        await route.then?.(page);
      } catch (e) {
        failures.push(`${route.hash} @${width}: did not render: ${(e as Error).message.split('\n')[0]}`);
        continue;
      }
      await page.waitForTimeout(300); // late layout: fonts, charts, lazy panels
      const o = await overflow(page);
      if (o.documentWidth > o.windowWidth) failures.push(`${route.hash} @${width}: document is ${o.documentWidth}px wide in a ${o.windowWidth}px window`);
      for (const s of o.scrolling) failures.push(`${route.hash} @${width}: scrolls sideways: ${s}`);
      for (const s of o.outside) failures.push(`${route.hash} @${width}: past the right edge: ${s}`);
    }
  }
  expect(failures).toEqual([]);
  expect(api.unexpected).toEqual([]);
});
