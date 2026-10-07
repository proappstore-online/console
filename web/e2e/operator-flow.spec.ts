import { expect, test, type Page, type Request, type Route } from '@playwright/test';

// platform#300: the admin (operator) flow end to end, through the REAL console
// UI (built + served by `vite preview`, see playwright.config.ts), signed in as
// the app owner with a fake token. Every request to the PAS backends is
// answered by the in-memory fake below, which keeps state: a mutation is visible
// on the next read, and every operator call lands in the audit trail the Audit
// panel then shows. Nothing reaches the network.
//
// The operator view has no generic create/update/delete forms: per
// platform#298, every mutation goes through an action the app declares in its
// contract, run on a displayed row (POST /operator/actions/:id { row }). So
// the flow's CRUD steps are declared actions on the Stash fixture:
//   create  — Suspend (destructive, step_up): adds a suspension record, seen on the member's page
//   update  — Start review (a status transition): the report's status changes
//   delete  — Delete report (destructive, step_up): the row is gone
//   custom  — Lift (plain, confirm only) on the new suspension record
// Shapes follow src/OperatorView.test.tsx and platform's operator-view-stash fixture.

const API = 'https://api.proappstore.online';
const AGENTS = 'https://agents.proappstore.online';
const OWNER_TOKEN = 'e2e-owner-token';
/** The session the re-sign-in round trip returns: the fake counts it as a recent sign-in. */
const FRESH_TOKEN = 'e2e-fresh-token';
const USER = { id: 'gh:1', login: 'octo', name: 'Octo', avatarUrl: null };

// The Stash contract as the platform stores and returns it (validated, normalized).
const CONTRACT = {
  version: 1,
  resources: [
    { id: 'members', kind: 'users', title: 'Members', description: null, action: 'op_list_users', columns: [
      { key: 'display_name', label: 'Name', format: 'text' },
      { key: 'user_id', label: 'User ID', format: 'text' },
      { key: 'suspended', label: 'Suspended', format: 'boolean' },
    ],
    search: { param: 'q' },
    page: { param: 'after', column: 'user_id', size: 25 },
    detail: { action: 'op_member_detail', param: 'user_id', key: 'user_id', step_up: false, fields: [
      { key: 'display_name', label: 'Name', format: 'text' },
      { key: 'email', label: 'Email', format: 'text' },
      { key: 'pocket_count', label: 'Pockets', format: 'number' },
    ] } },
    { id: 'reports', kind: 'reports', title: 'Reports', description: null, action: 'op_list_reports', columns: [
      { key: 'reason', label: 'Reason', format: 'text' },
      { key: 'status', label: 'Status', format: 'badge' },
      { key: 'report_id', label: 'Report', format: 'text' },
    ],
    status: { column: 'status', param: 'status', states: [
      { value: 'open', label: 'Open' }, { value: 'reviewing', label: 'In review' }, { value: 'resolved', label: 'Resolved' },
    ] } },
    { id: 'history', kind: 'suspensions', title: 'Suspension history', description: null, action: 'op_list_suspensions', columns: [
      { key: 'user_id', label: 'User', format: 'text' },
      { key: 'status', label: 'Status', format: 'badge' },
      { key: 'suspension_id', label: 'Suspension', format: 'text' },
    ],
    related: { resource: 'members', param: 'user' },
    status: { column: 'status', param: null, states: [{ value: 'active', label: 'Active' }, { value: 'lifted', label: 'Lifted' }] } },
    { id: 'kyc', kind: 'verification', title: 'Identity checks', description: null, action: 'op_list_kyc', columns: [
      { key: 'full_name', label: 'Name', format: 'text' },
      { key: 'status', label: 'Status', format: 'badge' },
      { key: 'request_id', label: 'Request', format: 'text' },
    ] },
  ],
  actions: [
    { id: 'suspend_member', title: 'Suspend', resource: 'members', action: 'op_suspend_user', params: { user_id: 'user_id' }, confirm: 'Suspend this member?', step_up: true, destructive: true, transition: null, target: 'user_id' },
    { id: 'review', title: 'Start review', resource: 'reports', action: 'op_review_report', params: { report_id: 'report_id', from_status: 'status' }, confirm: 'Start reviewing this report?', step_up: false, destructive: false, target: 'report_id', transition: { from: ['open'], to: 'reviewing' } },
    { id: 'delete_report', title: 'Delete report', resource: 'reports', action: 'op_delete_report', params: { report_id: 'report_id' }, confirm: 'Delete this report?', step_up: true, destructive: true, transition: null, target: 'report_id' },
    { id: 'lift', title: 'Lift', resource: 'history', action: 'op_lift_suspension', params: { suspension_id: 'suspension_id', from_status: 'status', user_id: 'user_id' }, confirm: 'Lift this suspension?', step_up: false, destructive: false, target: 'user_id', transition: { from: ['active'], to: 'lifted' } },
  ],
};
type Action = (typeof CONTRACT.actions)[number];
type Row = Record<string, unknown>;

interface AuditRow {
  id: number; at: number; actor: { id: string; login: string | null }; role: string | null
  kind: 'enter' | 'audit' | 'read' | 'detail' | 'action'; resource: string | null; field: null
  operation: string; action: string | null; target: string | null; target_hidden: false
  status: number; outcome: 'success' | 'refused'
}

/** The PAS API as the console sees it, for one owner and one app, with state. */
class FakeApi {
  members: Row[] = [
    { display_name: 'Ada', user_id: 'u1', suspended: 0, email: 'ada@stash.test', pocket_count: 3 },
    { display_name: 'Bo', user_id: 'u2', suspended: 0, email: 'bo@stash.test', pocket_count: 1 },
  ];
  reports: Row[] = [
    { reason: 'spam', status: 'open', report_id: 'r1' },
    { reason: 'abuse', status: 'open', report_id: 'r2' },
    { reason: 'old', status: 'resolved', report_id: 'r3' },
  ];
  history: Row[] = [];
  audit: AuditRow[] = [];
  visits = new Set<string>();
  /** Every request the page sent to a backend host. */
  calls: { method: string; url: URL; auth: string | null; body: unknown }[] = [];
  /** Backend requests the fake does not know: the flow must not make any. */
  unexpected: string[] = [];

  private log(kind: AuditRow['kind'], operation: string, status: number, extra: Partial<AuditRow> = {}) {
    this.audit.push({
      id: this.audit.length + 1, at: Date.UTC(2026, 9, 7, 9, 0, this.audit.length), actor: { id: USER.id, login: USER.login }, role: null,
      kind, resource: null, field: null, operation, action: null, target: null, target_hidden: false,
      status, outcome: status < 400 ? 'success' : 'refused', ...extra,
    });
  }

  async handle(route: Route, request: Request): Promise<void> {
    const url = new URL(request.url());
    const method = request.method();
    const cors = {
      'access-control-allow-origin': request.headers()['origin'] ?? '*',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? 'authorization,content-type',
    };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });

    const auth = request.headers()['authorization'] ?? null;
    let body: unknown = null;
    try { body = request.postDataJSON(); } catch { body = request.postData(); }
    this.calls.push({ method, url, auth, body });
    const token = auth?.replace(/^Bearer /, '') ?? null;

    const reply = (status: number, json: unknown) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(json) });
    const path = `${url.origin}${url.pathname}`;

    // The re-sign-in round trip: the platform's OAuth start bounces straight back with a fresh session.
    if (path === `${API}/v1/auth/github/start`) {
      const back = new URL(url.searchParams.get('return_to')!);
      back.hash = `pas_session=${FRESH_TOKEN}`;
      return route.fulfill({ status: 302, headers: { location: back.toString() } });
    }
    if (token !== OWNER_TOKEN && token !== FRESH_TOKEN) return reply(401, { error: 'invalid or expired session' });

    // Console shell: who am I, my apps, agent projects.
    if (path === `${API}/v1/auth/me`) return reply(200, USER);
    if (path === `${API}/v1/apps/console/roles/ensure-member`) return reply(200, { ok: true });
    if (path === `${API}/v1/apps`) {
      return reply(200, { apps: [{ id: 'stash', creator_id: USER.id, created_at: Date.UTC(2026, 8, 1), d1_database_id: 'd1', name: 'Stash', category: null, description: null, icon: null, icon_bg: null, pro_features: null, has_submission: false, submission_status: null, team_role: 'owner' }] });
    }
    if (path === `${API}/v1/me/administered-apps`) return reply(200, { apps: [] });
    if (path === `${API}/v1/me/is-admin`) return reply(200, { admin: false });
    if (path === `${AGENTS}/v1/projects`) return reply(200, { projects: [] });
    // Dashboard stats (seen after the re-sign-in lands there): not under test, and both degrade to "—" on an error.
    if (path === `${API}/v1/subscription` || path === `${API}/v1/usage/owner-summary`) return reply(404, { error: 'not in the e2e fake' });

    const op = /^\/v1\/apps\/stash\/operator(\/.*)?$/.exec(url.pathname);
    if (url.origin !== API || !op) {
      this.unexpected.push(`${method} ${url.href}`);
      return reply(404, { error: 'not in the e2e fake' });
    }
    const rest = op[1] ?? '';

    if (rest === '' && method === 'GET') {
      return reply(200, {
        app: { id: 'stash', createdAt: Date.UTC(2026, 8, 1) },
        operator: { userId: USER.id, login: USER.login },
        baseline: { usersWithRoles: 2, activity: { days: 30, activeUsers: 7, sessionSeconds: 3600, apiCalls: 120 } },
        contract: CONTRACT,
      });
    }
    if (rest === '/entries' && method === 'POST') {
      const visit = (body as { visit: string }).visit;
      if (!this.visits.has(visit)) { this.visits.add(visit); this.log('enter', 'enter', 200, { target: visit }); }
      return reply(200, { recorded: true });
    }
    if (rest === '/audit' && method === 'GET') {
      const f = Object.fromEntries(url.searchParams);
      const rows = [...this.audit].reverse().filter((r) => (!f.kind || r.kind === f.kind) && (!f.outcome || r.outcome === f.outcome));
      this.log('audit', 'audit', 200);
      return reply(200, { rows, next_cursor: null, targets_hidden: false });
    }

    const list = /^\/resources\/([^/]+)$/.exec(rest);
    if (list && method === 'GET') {
      const id = list[1]!;
      // The owner holds no reviewer role: identity checks are refused, in their own panel only.
      if (id === 'kyc') { this.log('read', `read:${id}`, 403, { resource: id }); return reply(403, { error: 'requires app role' }); }
      const resource = CONTRACT.resources.find((r) => r.id === id)!;
      let rows = id === 'members' ? this.members : id === 'reports' ? this.reports : this.history;
      const q = url.searchParams.get('q');
      if (q) rows = rows.filter((r) => String(r.display_name).toLowerCase().includes(q.toLowerCase()));
      const related = url.searchParams.get('related');
      if (related) rows = rows.filter((r) => r.user_id === related);
      this.log('read', `read:${id}`, 200, { resource: id, target: related });
      // Declared columns only — never e.g. a member's email in the list.
      return reply(200, { rows: rows.map((r) => Object.fromEntries(resource.columns.map((c) => [c.key, r[c.key]]))), next_cursor: null });
    }

    const record = /^\/resources\/members\/records\/([^/]+)$/.exec(rest);
    if (record && method === 'GET') {
      const key = decodeURIComponent(record[1]!);
      const m = this.members.find((r) => r.user_id === key);
      this.log('detail', 'detail:members', m ? 200 : 404, { resource: 'members', target: key });
      if (!m) return reply(404, { error: 'record not found' });
      return reply(200, { record: { display_name: m.display_name, email: m.email, pocket_count: m.pocket_count } });
    }

    const act = /^\/actions\/([^/]+)$/.exec(rest);
    const action = act && method === 'POST' ? CONTRACT.actions.find((a) => a.id === act[1]) : undefined;
    if (action) return this.runAction(action, (body as { row: Row }).row, token === FRESH_TOKEN, reply);

    this.unexpected.push(`${method} ${url.href}`);
    return reply(404, { error: 'not in the e2e fake' });
  }

  private runAction(action: Action, row: Row, recentSignIn: boolean, reply: (s: number, j: unknown) => Promise<void>) {
    const target = String(row[action.target]);
    const done = (status: number, json: unknown) => { this.log('action', action.id, status, { target }); return reply(status, json); };
    if (action.step_up && !recentSignIn) return done(403, { error: 'step_up_required', message: 'Recent authentication required', max_age: 300 });
    if (action.transition && !action.transition.from.includes(String(row.status))) {
      return done(409, { error: `"${action.title}" is not available from status ${JSON.stringify(row.status)}` });
    }
    switch (action.id) {
      case 'suspend_member': {
        this.members.find((m) => m.user_id === row.user_id)!.suspended = 1;
        this.history.push({ user_id: row.user_id, status: 'active', suspension_id: `s${this.history.length + 1}` });
        break;
      }
      case 'review': this.reports.find((r) => r.report_id === row.report_id)!.status = 'reviewing'; break;
      case 'delete_report': this.reports = this.reports.filter((r) => r.report_id !== row.report_id); break;
      case 'lift': {
        this.history.find((h) => h.suspension_id === row.suspension_id)!.status = 'lifted';
        this.members.find((m) => m.user_id === row.user_id)!.suspended = 0;
        break;
      }
    }
    return done(200, { ok: true, changes: 1 });
  }

  /** The bodies of every POST to one action, in order. */
  actionBodies(id: string) {
    return this.calls.filter((c) => c.method === 'POST' && c.url.pathname === `/v1/apps/stash/operator/actions/${id}`).map((c) => c.body);
  }
}

async function setup(page: Page) {
  const api = new FakeApi();
  await page.route(/^https:\/\/(api|agents)\.proappstore\.online\//, (route, request) => api.handle(route, request));
  // Third-party assets (fonts, analytics beacon) are not under test: keep the run offline.
  await page.route((url) => url.hostname !== 'localhost' && !/^(api|agents)\.proappstore\.online$/.test(url.hostname), (route) => route.abort());
  // Signed in as the app owner: the SDK's cached session, as a real sign-in leaves it.
  await page.addInitScript(([token, user]) => {
    if (!localStorage.getItem('pas:session')) localStorage.setItem('pas:session', JSON.stringify({ token, user }));
  }, [OWNER_TOKEN, USER] as const);
  // Record and accept every confirm(); a test may decline the next one.
  const dialogs: string[] = [];
  let declineNext = false;
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    if (declineNext) { declineNext = false; void d.dismiss(); } else void d.accept();
  });
  return { api, dialogs, declineNext: () => { declineNext = true; } };
}

test('owner runs the full admin flow: browse, create, update, delete, custom action, audit, refusals', async ({ page }) => {
  const { api, dialogs, declineNext } = await setup(page);
  const section = (title: string) => page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true, level: 4 }) });
  const rowOf = (s: ReturnType<typeof section>, text: string) => s.getByRole('row').filter({ has: page.getByRole('cell', { name: text, exact: true }) });

  // ── Enter the operator view (deep link to the app's Operator tab) ──
  await page.goto('/#/apps/stash/operator');
  await expect(page.getByRole('heading', { name: 'Stash — Operator view' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Operator' }).first()).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Users with roles')).toBeVisible();
  await expect.poll(() => api.audit.filter((a) => a.kind === 'enter').length).toBe(1);
  const entry = api.calls.find((c) => c.url.pathname.endsWith('/operator/entries'))!;
  expect(entry.method).toBe('POST');
  expect(entry.body).toEqual({ visit: expect.any(String) });

  // ── Browse + search ──
  const members = section('Members');
  await expect(rowOf(members, 'Ada')).toBeVisible();
  await expect(rowOf(members, 'Bo')).toBeVisible();
  await expect(members.getByRole('columnheader')).toHaveText(['Name', 'User ID', 'Suspended', 'Actions']);
  await members.getByRole('searchbox', { name: 'Search Members' }).fill('bo');
  await members.getByRole('button', { name: 'Search' }).click();
  await expect(rowOf(members, 'Ada')).toHaveCount(0);
  await expect(rowOf(members, 'Bo')).toBeVisible();
  expect(api.calls.filter((c) => c.url.pathname.endsWith('/resources/members')).at(-1)!.url.searchParams.get('q')).toBe('bo');
  await members.getByRole('searchbox', { name: 'Search Members' }).fill('');
  await members.getByRole('button', { name: 'Search' }).click();
  await expect(rowOf(members, 'Ada')).toBeVisible();

  // ── Refusal: a 403 "requires app role" shows the console's copy in that panel only ──
  await expect(section('Identity checks').getByRole('alert')).toHaveText(
    "You don't hold the app role this needs. The app's owner grants roles under Settings → Access.",
  );

  // ── Open a record: its declared detail fields, and its (empty) suspension history ──
  await rowOf(members, 'Ada').getByRole('link', { name: 'Open' }).click();
  await expect(page).toHaveURL(/#\/apps\/stash\/operator\/members\/u1$/);
  await expect(page.getByRole('term')).toHaveText(['Name', 'Email', 'Pockets']);
  await expect(page.getByRole('definition')).toHaveText(['Ada', 'ada@stash.test', '3']);
  await expect(section('Suspension history').getByText('Nothing here.')).toBeVisible();
  expect(api.calls.filter((c) => c.url.pathname.endsWith('/resources/history')).at(-1)!.url.searchParams.get('related')).toBe('u1');
  await page.getByRole('link', { name: '← Back to operator view' }).click();

  // ── Create (Suspend), refused with step_up_required → the step-up UI ──
  await rowOf(members, 'Ada').getByRole('button', { name: 'Suspend' }).click();
  expect(dialogs.at(-1)).toBe("Suspend this member?\n\nThis can't be undone.");
  await expect(members.getByText('Suspend: This needs a recent sign-in. Sign in again, then retry.')).toBeVisible();
  expect(api.history).toEqual([]);
  // "Sign in again" starts the platform sign-in for the console, returning here; the fake bounces back with a fresh session.
  await members.getByRole('button', { name: 'Sign in again' }).click();
  await expect(page.getByText('Total Apps')).toBeVisible(); // back on the console, signed in again
  const start = api.calls.find((c) => c.url.pathname === '/v1/auth/github/start')!.url;
  expect(start.searchParams.get('app_id')).toBe('console');
  expect(new URL(start.searchParams.get('return_to')!).origin).toBe(new URL(page.url()).origin);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pas:session')!).token)).toBe(FRESH_TOKEN);

  // ── Create again, now with a recent sign-in: done, and visible on re-browse ──
  await page.goto('/#/apps/stash/operator');
  await rowOf(members, 'Ada').getByRole('button', { name: 'Suspend' }).click();
  await expect(members.getByText('Suspend: done.')).toBeVisible();
  await expect(rowOf(members, 'Ada').getByRole('cell').nth(2)).toHaveText('Yes');
  // The row as displayed — declared columns only (no email) — and nothing else.
  expect(api.actionBodies('suspend_member')).toEqual([
    { row: { display_name: 'Ada', user_id: 'u1', suspended: 0 } },
    { row: { display_name: 'Ada', user_id: 'u1', suspended: 0 } },
  ]);
  await rowOf(members, 'Ada').getByRole('link', { name: 'Open' }).click();
  const history = section('Suspension history');
  await expect(rowOf(history, 's1')).toBeVisible();
  await expect(rowOf(history, 's1').getByRole('cell').nth(1)).toHaveText('Active');

  // ── Custom action (plain, confirm only): Lift the new suspension ──
  await rowOf(history, 's1').getByRole('button', { name: 'Lift' }).click();
  expect(dialogs.at(-1)).toBe('Lift this suspension?');
  await expect(history.getByText('Lift: done.')).toBeVisible();
  await expect(rowOf(history, 's1').getByRole('cell').nth(1)).toHaveText('Lifted');
  await expect(rowOf(history, 's1').getByRole('button', { name: 'Lift' })).toHaveCount(0);
  expect(api.actionBodies('lift')).toEqual([{ row: { user_id: 'u1', status: 'active', suspension_id: 's1' } }]);
  await page.getByRole('link', { name: '← Back to operator view' }).click();

  // ── Update: a status transition, offered only from the states it leaves ──
  const reports = section('Reports');
  await expect(rowOf(reports, 'old').getByRole('button', { name: 'Start review' })).toHaveCount(0);
  await rowOf(reports, 'spam').getByRole('button', { name: 'Start review' }).click();
  expect(dialogs.at(-1)).toBe('Start reviewing this report?');
  await expect(reports.getByText('Start review: done.')).toBeVisible();
  await expect(rowOf(reports, 'spam').getByRole('cell').nth(1)).toHaveText('In review');
  await expect(rowOf(reports, 'spam').getByRole('button', { name: 'Start review' })).toHaveCount(0);
  expect(api.actionBodies('review')).toEqual([{ row: { reason: 'spam', status: 'open', report_id: 'r1' } }]);

  // ── Delete: destructive, so it warns; a declined confirmation sends nothing ──
  declineNext();
  await rowOf(reports, 'abuse').getByRole('button', { name: 'Delete report' }).click();
  expect(dialogs.at(-1)).toBe("Delete this report?\n\nThis can't be undone.");
  expect(api.actionBodies('delete_report')).toEqual([]);
  await rowOf(reports, 'abuse').getByRole('button', { name: 'Delete report' }).click();
  await expect(reports.getByText('Delete report: done.')).toBeVisible();
  await expect(rowOf(reports, 'abuse')).toHaveCount(0);
  await expect(rowOf(reports, 'spam')).toBeVisible();
  expect(api.actionBodies('delete_report')).toEqual([{ row: { reason: 'abuse', status: 'open', report_id: 'r2' } }]);

  // ── Audit: the trail shows what was just done, including the refusals ──
  await page.getByRole('button', { name: 'Show audit trail' }).click();
  const trail = page.getByRole('table', { name: 'Operator audit trail, newest first' });
  await expect(trail).toBeVisible();
  const filters = page.getByRole('form', { name: 'Filter the audit trail' });
  await filters.getByLabel('What').selectOption('action');
  await filters.getByRole('button', { name: 'Apply filters' }).click();
  expect(api.calls.filter((c) => c.url.pathname.endsWith('/operator/audit')).at(-1)!.url.searchParams.get('kind')).toBe('action');
  const cells = (r: number) => trail.getByRole('row').nth(r).getByRole('cell');
  await expect(trail.getByRole('row')).toHaveCount(1 + 5);
  // When | Who | What | Record | Outcome — newest first.
  await expect(cells(1).nth(2)).toHaveText('Ran action: Delete report');
  await expect(cells(1).nth(3)).toHaveText('r2');
  await expect(cells(2).nth(2)).toHaveText('Ran action: Start review');
  await expect(cells(3).nth(2)).toHaveText('Ran action: Lift');
  await expect(cells(4).nth(2)).toHaveText('Ran action: Suspend');
  await expect(cells(4).nth(4)).toHaveText('✓ Success');
  await expect(cells(5).nth(2)).toHaveText('Ran action: Suspend');
  await expect(cells(5).nth(4)).toHaveText('✕ Refused (403)');
  for (const r of [1, 2, 3, 4, 5]) await expect(cells(r).nth(1)).toHaveText('octo');

  await filters.getByLabel('What').selectOption('');
  await filters.getByLabel('Outcome').selectOption('refused');
  await filters.getByRole('button', { name: 'Apply filters' }).click();
  await expect(trail.getByRole('row').filter({ hasText: 'Listed: Identity checks' }).first()).toContainText('✕ Refused (403)');
  await filters.getByRole('button', { name: 'Clear' }).click();
  await expect(trail.getByRole('row').filter({ hasText: 'Opened operator view' })).toHaveCount(1);
  await expect(trail.getByRole('row').filter({ hasText: 'Opened record: Members' }).first()).toContainText('u1');

  // ── Every backend request carried a bearer session; none hit a route the fake doesn't know ──
  const authed = api.calls.filter((c) => c.url.pathname !== '/v1/auth/github/start');
  expect(authed.length).toBeGreaterThan(10);
  for (const c of authed) expect(c.auth, `${c.method} ${c.url.pathname}`).toMatch(new RegExp(`^Bearer (${OWNER_TOKEN}|${FRESH_TOKEN})$`));
  // Before the re-sign-in, the owner's token; after it, the fresh one.
  expect(api.calls.filter((c) => c.url.pathname.endsWith('/actions/suspend_member')).map((c) => c.auth)).toEqual([`Bearer ${OWNER_TOKEN}`, `Bearer ${FRESH_TOKEN}`]);
  expect(api.unexpected).toEqual([]);
});
