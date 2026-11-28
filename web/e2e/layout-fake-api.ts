import type { Request, Route } from '@playwright/test';

// console#27: an in-memory PAS backend for the layout check (layout.spec.ts) —
// every request the console makes on any route, answered with realistic data
// that is deliberately long: provider-prefixed user ids, long emails and URLs,
// 40–64 character hashes, long names and messages. Shapes follow the console's
// own types (src/*Api.ts, src/types). A request the fake does not know is
// recorded in `unexpected` and answered 404: the spec fails on any.

export const OWNER_TOKEN = 'e2e-owner-token';
const NOW = Date.now();
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const UID = 'google:103954887935449123398';
const UID2 = 'github:58213377|oauth2-installation-00000000004417';
const UID3 = 'apple:001234.9f3c2b7a1e8d4c6b9a0f5e2d1c7b8a39.1042';
const EMAIL = 'alexandra.konstantinopoulou@rideshare-operations.example.com';
const SHA = '9f3c2a7e5b1d4f8a0c6e2b9d7a5f3c1e8b4d6a2f';
const TRACE = '7f3a9c1e5b2d4f6a8c0e1b3d5f7a9c2e4b6d8f0a1c3e5b7d9f2a4c6e8b0d1f3a';
const FP = 'e1d2c3b4a5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9';
const LONG_ID = 'stash-enterprise-fleet-telemetry-reconciliation-service-eu';
const LONG_URL = 'https://stash.proappstore.online/workspaces/rideshare-operations-northern-region/vehicles/fleet-maintenance-schedule/2026';
const LONG_TEXT = 'Synchronises the nightly settlement ledger for every driver cooperative in the Thessaloniki and Patras regions, reconciling disputed fares against the payment processor export before the 04:00 UTC cut-off.';
const LONG_ERR = "TypeError: Cannot read properties of undefined (reading 'settlementWindowStartIso') at reconcileCooperativeLedger (worker/src/jobs/settlement/reconcile-cooperative-ledger.ts:218:41)";
/** An unbroken run, as an app might store it: nothing to wrap at but the column edge. */
const UNBROKEN = 'driver_document_verification_request_9f3c2a7e5b1d4f8a0c6e2b9d7a5f3c1e8b4d6a2f';

export const USER = { id: UID, login: 'alexandra-konstantinopoulou-dispatch-engineering', name: 'Alexandra Konstantinopoulou-Papadimitriou', avatarUrl: null };

// ── Operator: a contract with every resource kind, long values in every column ──
export const OPERATOR_RECORD = UID;
const CONTRACT = {
  version: 1,
  resources: [
    { id: 'overview', kind: 'metrics', title: 'Overview', description: null, action: 'op_overview', columns: [
      { key: 'riders', label: 'Riders', format: 'number' }, { key: 'drivers', label: 'Drivers', format: 'number' },
      { key: 'open_reports', label: 'Open reports', format: 'number' }, { key: 'pending_documents', label: 'Pending documents', format: 'number' },
    ] },
    { id: 'drivers', kind: 'users', title: 'Drivers', description: 'Everyone who has applied to drive, with their current standing in the cooperative.', action: 'op_list_drivers', columns: [
      { key: 'display_name', label: 'Name', format: 'text' },
      { key: 'user_id', label: 'User ID', format: 'text' },
      { key: 'email', label: 'Email', format: 'text' },
      { key: 'joined_at', label: 'Joined', format: 'datetime' },
      { key: 'suspended', label: 'Suspended', format: 'boolean' },
    ],
    search: { param: 'q' },
    page: { param: 'after', column: 'user_id', size: 25 },
    detail: { action: 'op_driver_detail', param: 'user_id', key: 'user_id', step_up: false, fields: [
      { key: 'display_name', label: 'Name', format: 'text' },
      { key: 'email', label: 'Email', format: 'text' },
      { key: 'licence_number', label: 'Licence number', format: 'text' },
      { key: 'notes', label: 'Notes', format: 'text' },
    ] } },
    { id: 'documents', kind: 'verification', title: 'Driver documents', description: null, action: 'op_list_documents', columns: [
      { key: 'request_id', label: 'Request', format: 'text' },
      { key: 'document_type', label: 'Document', format: 'text' },
      { key: 'status', label: 'Status', format: 'badge' },
      { key: 'submitted_by', label: 'Submitted by', format: 'text' },
    ],
    status: { column: 'status', param: 'status', states: [
      { value: 'pending', label: 'Waiting for review' }, { value: 'accepted', label: 'Accepted' }, { value: 'rejected', label: 'Rejected' },
    ] } },
    { id: 'suspensions', kind: 'suspensions', title: 'Suspension history', description: null, action: 'op_list_suspensions', columns: [
      { key: 'suspension_id', label: 'Suspension', format: 'text' },
      { key: 'reason', label: 'Reason', format: 'text' },
      { key: 'status', label: 'Status', format: 'badge' },
    ],
    related: { resource: 'drivers', param: 'user' },
    status: { column: 'status', param: null, states: [{ value: 'active', label: 'Active' }, { value: 'lifted', label: 'Lifted' }] } },
  ],
  series: [],
  actions: [
    { id: 'suspend', title: 'Suspend driver', resource: 'drivers', action: 'op_suspend', params: { user_id: 'user_id' }, confirm: 'Suspend?', step_up: true, destructive: true, transition: null, target: 'user_id' },
    { id: 'accept', title: 'Accept document', resource: 'documents', action: 'op_accept', params: { request_id: 'request_id' }, confirm: 'Accept?', step_up: true, destructive: false, target: 'request_id', transition: { from: ['pending'], to: 'accepted' } },
    { id: 'reject', title: 'Reject document', resource: 'documents', action: 'op_reject', params: { request_id: 'request_id' }, confirm: 'Reject?', step_up: true, destructive: true, target: 'request_id', transition: { from: ['pending'], to: 'rejected' } },
    { id: 'lift', title: 'Lift suspension', resource: 'suspensions', action: 'op_lift', params: { suspension_id: 'suspension_id' }, confirm: 'Lift?', step_up: false, destructive: false, target: 'suspension_id', transition: { from: ['active'], to: 'lifted' } },
  ],
};
const OPERATOR_ROWS: Record<string, unknown[]> = {
  overview: [{ riders: 1284573, drivers: 48213, open_reports: 1234, pending_documents: 98765 }],
  drivers: [
    { display_name: 'Alexandra Konstantinopoulou-Papadimitriou', user_id: UID, email: EMAIL, joined_at: NOW - 40 * DAY, suspended: 0 },
    { display_name: 'Bartholomew Montgomery-Fitzwilliam III', user_id: UID2, email: 'bartholomew.montgomery-fitzwilliam@logistics-consulting-partners.example.co.uk', joined_at: NOW - 9 * DAY, suspended: 1 },
    { display_name: 'Nguyễn Thị Phương Thảo', user_id: UID3, email: 'phuong.thao@example.vn', joined_at: NOW - DAY, suspended: 0 },
  ],
  documents: [
    { request_id: UNBROKEN, document_type: 'Vehicle registration certificate (front and back)', status: 'pending', submitted_by: UID },
    { request_id: 'req_01JDZ5A1B2C3D4E5F6G7H8J9KM', document_type: 'Licence', status: 'accepted', submitted_by: UID2 },
  ],
  suspensions: [
    { suspension_id: `susp_${SHA}`, reason: 'Repeated self-referrals from the same device fingerprint across 14 accounts during the November promotion window', status: 'active' },
    { suspension_id: 'susp_2', reason: 'Old', status: 'lifted' },
  ],
};
const AUDIT_ROWS = [
  { id: 4, at: NOW - MIN, actor: { id: UID, login: null }, role: 'ops_pii', kind: 'detail', resource: 'drivers', field: null, operation: 'detail:drivers', action: 'op_driver_detail', target: UID, target_hidden: false, status: 200, outcome: 'success', reason: null },
  { id: 3, at: NOW - 5 * MIN, actor: { id: UID2, login: 'bartholomew-montgomery-fitzwilliam-logistics' }, role: null, kind: 'action', resource: 'documents', field: null, operation: 'accept', action: 'op_accept', target: UNBROKEN, target_hidden: false, status: 403, outcome: 'refused', reason: null },
  { id: 2, at: NOW - HOUR, actor: { id: UID, login: USER.login }, role: null, kind: 'read', resource: 'documents', field: null, operation: 'read:documents', action: 'op_list_documents', target: null, target_hidden: true, status: 200, outcome: 'success', reason: null },
  { id: 1, at: NOW - DAY, actor: { id: UID, login: USER.login }, role: null, kind: 'enter', resource: null, field: null, operation: 'enter', action: null, target: `visit-${TRACE}`, target_hidden: false, status: 200, outcome: 'success', reason: null },
];

const STASH_APP = { id: 'stash', creator_id: UID, created_at: NOW - 40 * DAY, d1_database_id: 'd1', name: 'Stash — Receipts, Payout Statements & Fleet Invoice Vault', category: 'productivity', description: LONG_TEXT, icon: null, icon_bg: null, pro_features: null, has_submission: true, submission_status: 'pending', team_role: 'owner' };

const PROMOTER = { promoter_id: 'prm_01JDXG000000000000000000000000000001', app_id: 'stash', status: 'active', code: 'K7Q2M9X4', code_active: true, display_name: USER.name, share_path: '/apps/stash?ref=K7Q2M9X4', share_url: 'https://proappstore.online/apps/stash?ref=K7Q2M9X4&utm_source=promoter&utm_campaign=rideshare-operations-emea-q4-2026-driver-referrals', app_public: true, status_reason: null, consented_at: NOW - 20 * DAY, created_at: NOW - 20 * DAY, updated_at: NOW - DAY };
const PUBLIC_PROFILE = { appId: 'stash', profile: { display_name: USER.name, label: 'Founder & dispatch engineering', visible: true, show_promotion: true, updated_at: new Date(NOW - DAY).toISOString() } };

const CHAT: Record<string, unknown> = {
  build: { messages: [
    { id: 'msg_b1', role: 'user', body: `Email ${EMAIL} a daily digest of every payout mismatch above the threshold, grouped by city and driver cohort.`, createdAt: NOW - 3 * HOUR },
    { id: 'msg_b2', role: 'po', body: `**Created ticket #142.** See ${LONG_URL}`, toolCall: { name: 'create_ticket', args: '{"title":"Reconcile driver payouts"}' }, createdAt: NOW - 3 * HOUR + MIN },
  ] },
  research: { messages: [
    { id: 'msg_r1', role: 'user', body: 'Research EU e-invoicing mandates (ViDA, Peppol BIS 3.0, Italy SdI, Poland KSeF).', createdAt: NOW - 30 * DAY },
    { id: 'msg_r2', role: 'Architect', body: `I wrote \`KNOWLEDGE.md\` and \`docs/e-invoicing-mandates-by-member-state-vida-peppol-sdi-ksef.md\`. ${LONG_TEXT}`, createdAt: NOW - 30 * DAY + 5 * MIN },
  ] },
  test: { messages: [
    { id: 'msg_t1', role: 'QA', body: 'Added `e2e/specs/invoice-bulk-upload-multipage-tiff-ocr-line-items-for-cooperative-treasurers.spec.ts` (6 tests).', createdAt: NOW - 6 * HOUR },
  ] },
};

/** GET responses by `<host> <path>` (host: api, agents, data-stash, stash). */
const GET: Record<string, unknown> = {
  // Shell + dashboard
  'api /v1/auth/me': USER,
  'api /v1/apps': { apps: [STASH_APP,
    { ...STASH_APP, id: LONG_ID, name: 'Enterprise Fleet Telemetry Reconciliation Service (EU Region)', description: null, created_at: NOW - 90 * DAY, submission_status: 'rejected' }] },
  'agents /v1/projects': { projects: [
    { slug: 'stash', name: STASH_APP.name, createdAt: NOW - 41 * DAY },
    { slug: 'surge-pricing-heatmap-forecaster-for-metropolitan-ops', name: 'Surge Pricing Heatmap Forecaster for Metropolitan Operations Teams', createdAt: NOW - 2 * DAY },
  ] },
  'api /v1/me/administered-apps': { apps: [{ id: 'citywide-lost-and-found-dispatch-board', name: 'Citywide Lost & Found Dispatch Board', created_at: NOW - 300 * DAY }] },
  'api /v1/me/is-admin': { admin: true },
  'api /v1/subscription': { status: 'active', tier: 'pro', priceId: 'price_1QxZ8mK4rideshareOperationsProMonthlyEUR', currentPeriodEnd: NOW + 17 * DAY, cancelAtPeriodEnd: true },
  'api /v1/usage/owner-summary': { days: 30, appCount: 2, activeUsers: 1284573, sessionSeconds: 98765432, apiCalls: 45678901 },

  // Operator
  'api /v1/apps/stash/operator': {
    app: { id: 'stash', createdAt: NOW - 40 * DAY },
    operator: { userId: UID, login: USER.login },
    baseline: { usersWithRoles: 12, activity: { days: 30, activeUsers: 1284573, sessionSeconds: 98765432, apiCalls: 45678901 } },
    contract: CONTRACT,
  },
  'api /v1/apps/stash/operator/audit': { rows: AUDIT_ROWS, next_cursor: '3', targets_hidden: true },
  [`api /v1/apps/stash/operator/resources/drivers/records/${encodeURIComponent(OPERATOR_RECORD)}`]: { record: {
    display_name: 'Alexandra Konstantinopoulou-Papadimitriou', email: EMAIL, licence_number: 'GR-THE-2019-0000418823-B-CE-D1E-PROFESSIONAL', notes: `${LONG_TEXT} ${UNBROKEN}`,
  } },
  'api /v1/apps/stash/roles/declared': { roles: [
    { id: 'cooperative-treasurer', label: 'Cooperative treasurer (settlement approvals)', description: 'Reviews and approves the nightly settlement ledger and payout batches for every driver cooperative in their region before funds are released.', requires: ['regional-compliance-auditor'] },
    { id: 'regional-compliance-auditor', label: 'Regional compliance auditor', description: null, requires: [] },
  ] },

  // Analytics
  'api /v1/apps/stash/usage': { appId: 'stash', days: 30,
    series: Array.from({ length: 30 }, (_, i) => ({ day: ymd(NOW - (29 - i) * DAY), sessionSeconds: 36_000 + ((i * 7919) % 54_000), apiCalls: 12_000 + ((i * 3571) % 9_000), users: 140 + ((i * 37) % 160) })),
    totals: { sessionSeconds: 2_184_330, apiCalls: 498_771, users: 1_893 } },
  'api /v1/apps/stash/analytics/live': { appId: 'stash', window_minutes: 5, views: 47, unique_paths: 2, top_paths: [
    { path: '/workspaces/rideshare-operations-northern-region/vehicles/fleet-maintenance-schedule/2026/overdue-inspections', views: 21 }, { path: '/', views: 9 }] },
  'api /v1/apps/stash/analytics/stats': { appId: 'stash', days: 7, kind: 'pageview', bucket: 'day', path: null, stats: {
    total_views: 48_213, unique_paths: 312,
    series: Array.from({ length: 7 }, (_, i) => ({ t: ymd(NOW - (6 - i) * DAY), views: 5_200 + ((i * 1777) % 3_400) })),
    top_paths: [{ path: '/workspaces/rideshare-operations-northern-region/vehicles/fleet-maintenance-schedule/2026/overdue-inspections', views: 12_402 }, { path: '', views: 3_900 }],
    top_referrers: [{ referrer: 'https://community.rideshare-operations.example.com/forums/northern-region-drivers/threads/fleet-maintenance-tips-2026', views: 4_870 }, { referrer: '', views: 3_300 }],
    top_countries: [{ country: 'GR', views: 21_004 }, { country: 'VN', views: 9_870 }],
    device_split: [{ device: 'mobile', views: 31_220 }, { device: 'desktop', views: 15_004 }],
  } },
  'api /v1/apps/stash/analytics': { cfBeaconToken: '4f9a2c1e7b3d5f8a0c6e9b1d3f5a7c2e', ga4: 'G-RIDESHARE7Q2M9V3K8', plausible: 'stash.rideshare-operations-northern-region.example.com',
    customHead: '<script defer src="https://analytics.rideshare-operations.example.com/js/script.tagged-events.outbound-links.file-downloads.js"></script>', updatedAt: NOW - 14 * DAY },
  'api /v1/apps/stash/analytics/events': { appId: 'stash', days: 7, total_events: 7_324, events: [
    { kind: 'ride_requested_from_driver_dispatch_board_overnight_shift', count: 5_120 }, { kind: 'payout_export_downloaded', count: 2_204 }] },

  // Logs
  'api /v1/apps/stash/logs': { nextCursor: 'cursor_2', logs: [
    { ts: NOW - 4 * MIN, level: 'error', category: 'api_request', message: `Request to ${LONG_URL} failed with status 502 after 3 retries; upstream data-worker returned an empty body while reconciling the vehicle maintenance ledger`,
      data: { phase: 'api_request', route: '/v1/data/vehicles/fleet-maintenance-schedule', status: 502 }, clientId: 'anon_4c7e9a1b3d5f7e9a1c3b5d7f9e1a3c5b7d9f1e3a', userId: UID,
      build: { version: '2026.11.27-rc.14+build.7731', sha: SHA, sdkVersion: '1.16.112', branch: 'release/northern-region-fleet-maintenance' }, fingerprint: FP, traceId: TRACE, source: 'mediated',
      context: { v: 1, sdkVersion: '1.16.112', operation: 'data.query.vehicles.fleetMaintenanceSchedule', result: 'error', errorCode: 'UPSTREAM_EMPTY_BODY_RECONCILIATION_FAILED', durationMs: 18342 } },
    { ts: NOW - 47 * MIN, level: 'warn', category: 'auth', message: 'Sign-in callback rejected: state parameter expired after 600 seconds', data: { phase: 'sign_in' },
      clientId: null, userId: UID3, build: { version: '2026.11.26-stable.3+build.7702' }, fingerprint: SHA, traceId: null, source: 'server', context: null },
  ] },
  'api /v1/apps/stash/logs/groups': { groups: [
    { fingerprint: FP, occurrences: 1284, affected: 317, first_seen: NOW - 6 * DAY, last_seen: NOW - 4 * MIN, level: 'error', category: 'api_request', sample_message: `Request to ${LONG_URL} failed with status 502 after 3 retries` },
  ] },
  'api /v1/apps/stash/logs/build': { build: { version: '2026.11.27-rc.14+build.7731', sha: SHA, sdkVersion: '1.16.112', branch: 'release/northern-region-fleet-maintenance-and-driver-payouts', builtAt: NOW - 26 * HOUR }, ts: NOW - 4 * MIN },
  'api /v1/apps/stash/telemetry/health': { appId: 'stash', checkedAt: NOW - 30_000, status: 'degraded', countsReliable: true,
    alertCoverage: { complete: false, windowMs: DAY, gap: { start: NOW - 9 * HOUR, end: NOW - 8 * HOUR, recordedAt: NOW - 8 * HOUR } },
    components: {
      evaluator: { status: 'ok', lastOkAt: NOW - MIN, lastFailureAt: null, lastError: null },
      prune: { status: 'ok', lastOkAt: NOW - 2 * HOUR, lastFailureAt: null, lastError: null },
      aggregates: { status: 'degraded', lastOkAt: NOW - 3 * HOUR, lastFailureAt: NOW - 5 * MIN, lastError: 'D1_ERROR: too many SQL variables in batched upsert for app_log_aggregates_hourly_rollup_v3' },
    },
    windows: {
      lastHour: { signals: { runtime_error: 14, api_request_failed: 61 }, detailDropped: { client: 2, server: 0 } },
      lastDay: { signals: { runtime_error: 342, api_request_failed: 1284 }, detailDropped: { client: 118, server: 9 } },
    },
    requests: { status: 'ok', sampled: true,
      lastHour: { total: 18452, ok: 17911, clientErrors: 480, serverErrors: 61, serverErrorRate: 0.0033, latency: { lt_100ms: 12011, lt_500ms: 5120, lt_2s: 1190, ge_2s: 131 }, byFamily: {} },
      lastDay: { total: 402118, ok: 390004, clientErrors: 10830, serverErrors: 1284, serverErrorRate: 0.0032, latency: { lt_100ms: 270400, lt_500ms: 110233, lt_2s: 19011, ge_2s: 2474 }, byFamily: {} } },
    bucketMs: HOUR },

  // Enquiries
  'api /v1/apps/stash/team/recruitment': { appId: 'stash', accepting_requests: true, updated_at: NOW - 3 * DAY },
  'api /v1/apps/stash/enquiries': { enquiries: [
    { id: 'enq_01JDZ7Q4M9V3K8T2X6R5B1N0CW', type: 'team_join', name: 'Alexandra Konstantinopoulou-Vasilopoulou', email: EMAIL,
      message: 'I have spent the last six years running dispatch operations for a regional rideshare cooperative across Thessaloniki and Kavala, and would love to help.', status: 'new', created_at: NOW - 25 * MIN, handled_at: null, handled_by: null },
    { id: 'enq_01JDYZZZZZZZZZZZZZZZZZZZZ1', type: 'general', name: 'Nguyễn Thị Phương Thảo', email: 'phuong.thao.nguyen.thi@saigon-ride-collective.example.vn',
      message: `${UNBROKEN}${UNBROKEN} — is there an API for exporting payout history?`, status: 'new', created_at: NOW - 2 * DAY, handled_at: null, handled_by: null },
  ], counts: { new: 2, total: 27 }, new_general_count: 1, new_team_join_count: 1, next: null },

  // Promoters
  'api /v1/apps/stash/promoters/settings': { enrollment_open: true, referral_tracking: { ready: true, reason: null, protocol_version: 1 } },
  'api /v1/apps/stash/promoters': { promoters: [
    { promoter_id: 'prm_8f2c4e6a0b1d3f5a7c9e1b3d5f7a9c2e', display_name: 'Alexandra Konstantinopoulou — Northern Region Driver Community', code: 'ALEXANDRAKONSTANTINOPOULOU2026', status: 'active', status_reason: null },
    { promoter_id: 'prm_1a3c5e7b9d0f2a4c6e8b1d3f5a7c9e0b', display_name: 'Bartholomew Montgomery-Fitzwilliam', code: 'BMF-LOGISTICS-PARTNERS', status: 'suspended', status_reason: 'Repeated self-referrals from the same device fingerprint across 14 accounts during the November promotion window' },
  ], counts: { active: 1, suspended: 1, withdrawn: 0, total: 2 }, next: null },
  'api /v1/apps/stash/promoters/contributions': { app_id: 'stash',
    freshness: { as_of: NOW - 5 * MIN, referrals_recorded_since: NOW - 120 * DAY, note: 'Counts are recalculated every five minutes.' },
    totals: { promoters: 2, pending: 38, confirmed: 412, reversed: 17, expired: 63 },
    acquisition: { activations_recorded: 1893, referred_confirmed: 412, referred_reversed: 17, organic: 1464, note: 'Organic includes sign-ups whose referral link expired before activation.' },
    standings: [
      { promoter_id: 'prm_8f2c4e6a0b1d3f5a7c9e1b3d5f7a9c2e', display_name: 'Alexandra Konstantinopoulou — Northern Region Driver Community', rank: 1, counts: { pending: 20, confirmed: 251, reversed: 3, expired: 30 }, share_of_referred_users: { numerator: 251, denominator: 412, ratio: 0.6092, percent: 60.9, basis: 'confirmed' } },
      { promoter_id: 'prm_1a3c5e7b9d0f2a4c6e8b1d3f5a7c9e0b', display_name: null, rank: 2, counts: { pending: 6, confirmed: 43, reversed: 14, expired: 12 }, share_of_referred_users: { numerator: 43, denominator: 412, ratio: 0.1044, percent: 10.4, basis: 'confirmed' } },
    ], next: null },
  'api /v1/apps/stash/referrals': { referrals: [
    { referral_id: 'ref_01JDZ5A1B2C3D4E5F6G7H8J9KMc4e6a8b0', promoter_id: 'prm_1a3c5e7b9d0f2a4c6e8b1d3f5a7c9e0b', status: 'reversed', captured_at: NOW - 9 * DAY, expires_at: NOW + 21 * DAY, activated_at: NOW - 9 * DAY, confirmed_at: NOW - 8 * DAY, reversal_kind: 'fraud_invalid', reversal_reason: 'Same device fingerprint and payout bank account as the promoter; flagged by the weekly self-referral audit' },
    { referral_id: 'ref_01JDYZZZZZZZZZZZZZZZZZZZZ19e0b2d4f', promoter_id: 'prm_8f2c4e6a0b1d3f5a7c9e1b3d5f7a9c2e', status: 'pending', captured_at: NOW - 5 * HOUR, expires_at: NOW + 30 * DAY, activated_at: null, confirmed_at: null, reversal_kind: null, reversal_reason: null },
  ], counts: { pending: 38, confirmed: 412, reversed: 17, expired: 63 }, next: null },
  'api /v1/apps/stash/promoters/events': { events: [
    { id: 'pev_01', promoter_id: 'prm_1a3c5e7b9d0f2a4c6e8b1d3f5a7c9e0b', actor_kind: 'owner', action: 'status_change', from_status: 'active', to_status: 'suspended', reason: 'Repeated self-referrals from the same device fingerprint; suspended pending manual review', created_at: NOW - 8 * DAY },
  ], next: null },
  'api /v1/apps/stash/referrals/events': { events: [
    { id: 'rev_01', promoter_id: 'prm_1a3c5e7b9d0f2a4c6e8b1d3f5a7c9e0b', attribution_id: 'ref_01JDZ5A1B2C3D4E5F6G7H8J9KMc4e6a8b0', actor_kind: 'owner', action: 'reverse', from_status: 'confirmed', to_status: 'reversed', reason: 'Same device fingerprint and payout bank account as the promoter', created_at: NOW - 7 * DAY },
  ], next: null },

  // Spending
  'agents /v1/projects/stash/cost/detail': { totalUsd: 48.7316,
    byRole: [{ role: 'Dev', total: 31.2044, tokensIn: 6_840_112, tokensOut: 412_877 }, { role: 'QA', total: 5.9021, tokensIn: 2_998_004, tokensOut: 176_550 }],
    byTicket: [{ ticketId: 'tkt_7f3a9c1e5b2d4f6a8c0e1b3d', title: 'Reconcile the weekly driver payout ledger against the bank settlement export and surface mismatches per depot with drill-down to individual trips', total: 18.441,
      byRole: [{ role: 'Dev', total: 13.0012, tokensIn: 2_801_220, tokensOut: 170_040 }] }],
    ledger: [
      { ticketId: 'tkt_7f3a9c1e5b2d4f6a8c0e1b3d', role: 'Dev', costUsd: 2.441, tokensIn: 612_004, tokensOut: 18_220, model: 'claude-sonnet-4-5-20250929-extended-thinking-128k', createdAt: NOW - 12 * MIN },
      { ticketId: 'tkt_7f3a9c1e5b2d4f6a8c0e1b3d', role: 'QA', costUsd: 0.312, tokensIn: 210_330, tokensOut: 9_102, model: 'claude-haiku-4-5', createdAt: NOW - 40 * MIN },
    ] },

  // Build / research / test
  'agents /v1/projects/stash': { id: 'proj_01JDX9Q7M3K8V2R5T6Y4W1N0ZB', name: STASH_APP.name, slug: 'stash', costCapMonthlyUsd: 250, costSpentMonthlyUsd: 187.4321, maxRunMinutes: 25, status: 'paused' },
  'agents /v1/projects/stash/tickets': { tickets: [
    { id: 'tkt_01JDXA4F8N2P6Q9R3S7T1V5W0X', seq: 142, title: 'Reconcile driver payout statements against the nightly Stripe Connect ledger export and flag mismatches over €0.50', rawIdea: LONG_TEXT, status: 'dev-active', kind: 'build', assigneeRole: 'Dev', iterations: 3, costSpentUsd: 4.8123, updatedAt: NOW - 2 * MIN, stuckReason: null },
    { id: 'tkt_01JDXA5G9P3Q7R0S4T8V2W6X1Y', seq: 141, title: UNBROKEN, rawIdea: LONG_TEXT, status: 'needs-input', kind: 'build', assigneeRole: 'BA', iterations: 1, costSpentUsd: 0.9312, updatedAt: NOW - 3 * HOUR, stuckReason: 'Which VAT jurisdictions must the OCR extractor support at launch? Invoices from Norway, Switzerland and the UK are handled differently.' },
  ] },
  'agents /v1/projects/stash/roles': { roles: ['po', 'Architect', 'BA', 'Dev', 'QA'].map((role) => ({ role, runtime: 'cf-native', model: 'claude-sonnet-4-5-20250929-extended-thinking-128k', maxTokens: 64000, persona: 'Pragmatic, terse.', spineTools: ['read_file', 'write_file'], vendorTools: [] })) },
  'agents /v1/projects/stash/activity': { activity: [
    { id: 'act_01', type: 'tool', detail: 'Dev: batch_write_files (3): src/reconcile/ledgerDiff.ts, src/reconcile/thresholds.ts, src/reconcile/__fixtures__/stripe-connect-ledger-export-2026-11-27.json', createdAt: NOW - 25 * MIN },
    { id: 'act_02', type: 'deploy', detail: `Pushed ${SHA} to main; waiting for Cloudflare Pages build`, createdAt: NOW - 6 * MIN },
  ] },
  'agents /v1/projects/stash/files': { files: [
    { path: 'KNOWLEDGE.md', size: 18432 },
    { path: 'docs/e-invoicing-mandates-by-member-state-vida-peppol-sdi-ksef.md', size: 40211 },
    { path: 'e2e/specs/invoice-bulk-upload-multipage-tiff-ocr-line-items-for-cooperative-treasurers.spec.ts', size: 6123 },
  ] },
  'agents /v1/projects/stash/test-history': {
    runs: [
      { id: 'run_01', triggeredAt: NOW - 5 * HOUR, source: 'ci-push-main', commitSha: SHA, status: 'failed', passed: 41, failed: 1, skipped: 2, flaky: 1, durationMs: 184230, coveragePct: 78.4 },
      { id: 'run_02', triggeredAt: NOW - DAY, source: 'scheduled-nightly-regression-suite-eu-west', commitSha: null, status: 'running', passed: 0, failed: 0, skipped: 0, flaky: 0, durationMs: null, coveragePct: null },
    ],
    specTrending: { 'e2e/specs/invoice-bulk-upload-multipage-tiff-ocr-line-items-for-cooperative-treasurers.spec.ts': { pass: 7, fail: 3, total: 10, pct: 70 } },
    stats: { totalRuns: 37, passedRuns: 29, overallPct: 78 } },
  'agents /v1/projects/stash/agents': { agents: [
    { id: 'Architect', label: 'Architect', summary: 'Researches the domain with live web access and maintains KNOWLEDGE.md plus docs/.', surface: 'chat', thread: 'research',
      identity: `You research fare regulation for cooperatives. ${LONG_TEXT}`, identitySource: 'custom', systemPrompt: `${LONG_TEXT}\n${UNBROKEN}`, systemPromptSource: 'custom',
      tools: ['web_search', 'web_fetch', 'search_knowledge_base_for_cooperative_policies'], model: 'claude-opus-4-1-20250805', runtime: 'cf-native', maxTokens: 32000,
      editable: { fields: ['model', 'maxTokens'], via: 'PUT /projects/:slug/roles' } },
  ] },

  // Data
  'data-stash /tables': { tables: ['rides', 'cooperative_settlement_ledger_entries_partitioned_by_region'] },

  // Control
  'stash /.vcqa/report.json': { score: 71, grade: 'C', version: `vcqa-2.14.0+build.${SHA}`, timestamp: new Date(NOW - 3 * HOUR).toISOString(), checks: [
    { name: 'security-secrets-and-injection', score: 42, grade: 'F', issues: [
      { severity: 'error', message: 'Raw SQL built with string concatenation from request query parameter "region" — use bound parameters', file: 'web/src/features/driver-onboarding/components/DocumentUploadDropzoneWithVirusScanStatus.tsx', line: 1042, rule: 'no-sql-string-concat' },
    ] },
    { name: 'testing-coverage-and-assertion-density', score: 93, grade: 'A' },
  ] },

  // Server
  'api /v1/apps/stash/worker': { app_id: 'stash',
    worker: { enabled: 1, backend: 'cloudflare-workers-for-platforms:dispatch-namespace-pas-apps-production-eu', deployed_sha: SHA, deployed_ref: 'refs/heads/feature/settlement-ledger-reconciliation-for-cooperatives', deployed_at: NOW - 3 * HOUR, rotation_overlap_until: NOW + 22 * HOUR },
    last_deploy: { repository: 'proappstore-online/stash', ref: 'refs/heads/main', sha: SHA, status: 'succeeded', detail: 'Bundle 1.84 MiB; 14 routes, 6 schedules, 3 hooks registered', created_at: NOW - 3 * HOUR },
    deploys: [
      { repository: 'proappstore-online/stash', ref: 'refs/heads/feature/settlement-ledger-reconciliation-for-cooperatives', sha: SHA, status: 'failed', detail: 'Upload rejected: script exceeds 10 MiB compressed limit after bundling @aws-sdk/client-s3 with all regional endpoint metadata included', created_at: NOW - 9 * HOUR },
    ],
    invocations: [
      { id: 'inv_01JDX7R2A8B4C6D0E3F5G7H9J1', type: 'hook', name: 'github-push-events-for-driver-onboarding-docs', attempt: 3, status: 'failed', http_status: 500, error: LONG_ERR, pas_calls: 12, started_at: NOW - 2 * HOUR, finished_at: NOW - 2 * HOUR + 4000 },
    ],
    schedules: [
      { name: 'send-weekly-driver-earnings-digest-to-cooperative-treasurers', cron: '30 6 * * MON', consecutive_failures: 5, schedule_disabled_at: NOW - DAY },
    ] },
  'api /v1/apps/stash/worker/usage': { quotas: { invocations: 100000, cpu_ms: 3600000, hook_deliveries: 10000 }, cpu_ms_source: 'wall', worker_log_limit: 5000,
    today: { day: ymd(NOW), invocations: 84213, cpu_ms: 1293844, hook_deliveries: 9120, pas_calls: 1048576, log_entries: 4211 },
    days: [{ day: ymd(NOW), invocations: 84213, cpu_ms: 1293844, hook_deliveries: 9120, pas_calls: 1048576, log_entries: 4211 }] },
  'api /v1/apps/stash/scheduled-runs': { runs: [
    { run_id: `run_${SHA}`, action_name: 'archive_completed_rides_older_than_ninety_days_for_gdpr_retention', source: 'manifest', due_at: NOW - 3 * HOUR, claimed_at: NOW - 3 * HOUR, finished_at: NOW - 3 * HOUR + 9000, status: 'failed', changes: null,
      error: 'D1_ERROR: too many SQL variables at offset 31998: SQLITE_ERROR while binding parameters for DELETE FROM ride_events_archive_staging' },
  ] },
  'api /v1/apps/stash/hooks': { hooks: [
    { name: 'twilio-inbound-sms-ride-confirmation-replies', url: `${LONG_URL}/hooks/twilio-inbound-sms-ride-confirmation-replies/receiver`, verify_kind: 'hmac-sha256-hex-header:X-Twilio-Signature', secret_name: 'TWILIO_AUTH_TOKEN_FOR_INBOUND_SMS_SUBACCOUNT_EU', secret_set: false },
  ] },
  'api /v1/apps/stash/hook-deliveries': { deliveries: [
    { id: 'hd_1', hook: 'stripe-connect-payout-status-for-cooperative-treasurers', delivery_id: 'evt_1QJx8YLkdIwHu7ixq3Gm0f9ZsT4bRk2wVa6NcPe5Jh7Uy0Xo', event: 'payout.paid', received_at: NOW - 12 * MIN, status: 'failed', attempts: 3, finished_at: null, error: LONG_ERR },
  ] },
  'api /v1/apps/stash/connectors': { configured: true,
    connectors: [{ name: 'github-driver-onboarding-documentation-repository', kind: 'github', modes: ['app', 'pat'], pat_secret: 'GITHUB_FINE_GRAINED_PAT_FOR_ONBOARDING_DOCS_READONLY', events: ['push', 'pull_request', 'issues', 'release', 'workflow_run'], hook: 'github-push-events-for-driver-onboarding-docs' }],
    installations: [{ connector: 'github-driver-onboarding-documentation-repository', installation_id: 58293746, account_login: 'rideshare-operations-thessaloniki-cooperative', account_type: 'Organization', created_at: NOW - 30 * DAY }] },
  'api /v1/apps/stash/visibility/me': { mode: 'private', allowed: true },
  'api /v1/apps/stash/visibility': { mode: 'private', allowed_roles: ['cooperative-treasurer', 'dispatch-supervisor-night-shift', 'regional-compliance-auditor'] },

  // Settings
  'api /v1/apps/stash/listing': { appId: 'stash', iconUrl: null, themeColor: '#0f766e', splashColor: '#ecfeff',
    tagline: 'Cooperative-owned ride-hailing for Thessaloniki and Patras — fair fares, transparent payouts, no surge pricing ever',
    longDescription: `${LONG_TEXT}\n\n${UNBROKEN}`, category: 'transport',
    websiteUrl: 'https://www.rideshare-operations.example.com/cooperatives/thessaloniki-and-patras/about-the-driver-owned-platform?ref=pas',
    supportEmail: EMAIL, supportUrl: 'https://support.rideshare-operations.example.com/hc/en-gb/categories/360001234567-driver-and-rider-help-centre-for-cooperatives',
    socialTwitter: 'RideshareCoopThessaloniki', socialGithub: 'rideshare-operations-thessaloniki-cooperative', socialMastodon: '@rideshare_cooperative_thessaloniki@mastodon.rideshare-operations.example.com',
    socialBluesky: 'rideshare-cooperative-thessaloniki.bsky.social', privacyPolicyUrl: 'https://stash.proappstore.online/privacy.md', termsUrl: null, screenshots: [], updatedAt: NOW - 5 * HOUR },
  'api /v1/apps/stash/domains': { domains: [
    { domain: 'book-a-ride-now.patras-and-western-greece-driver-collective.example.com', status: 'pending', method: 'saas', cfStatus: 'pending_validation',
      instructions: { apex: false, cname: { name: 'book-a-ride-now.patras-and-western-greece-driver-collective.example.com', value: 'stash.custom-hostnames.proappstore.online' }, cnameTarget: 'stash.custom-hostnames.proappstore.online',
        txt: [{ name: '_cf-custom-hostname.book-a-ride-now.patras-and-western-greece-driver-collective.example.com', value: '9f3c2a7e-5b1d-4f8a-0c6e-2b9d7a5f3c1e' }] },
      addedAt: NOW - 2 * HOUR, verifiedAt: null },
  ] },
  'api /v1/apps/stash/webhooks': { webhooks: [{ id: 'wh_9f3c2a7e5b1d4f8a0c6e2b9d7a5f3c1e', event: 'notification.sent', url: `${LONG_URL}/webhooks/receiver/${SHA}`, active: 1, created_at: Math.floor((NOW - 14 * DAY) / 1000) }] },
  'api /v1/apps/stash/tools': { tools: [
    { name: 'list_rides_awaiting_settlement_for_cooperative_treasurer_review', description: LONG_TEXT, operation: 'query',
      sql: 'SELECT r.id, r.driver_id, r.fare_cents FROM rides r JOIN cooperative_settlement_ledger_entries_partitioned_by_region l ON l.ride_id = r.id WHERE l.status = :status LIMIT :limit',
      params: { status: { type: 'string' }, limit: { type: 'integer', default: 50, max: 200, optional: true } }, requires_auth: true, source: 'code', updated_at: NOW - 3 * HOUR, auth: { app_roles: ['cooperative-treasurer'] } },
  ] },
  'api /v1/apps/stash/secrets': { secrets: [{ name: 'STRIPE_CONNECT_WEBHOOK_SIGNING_SECRET_PRODUCTION_FOR_COOPERATIVE_PAYOUTS', createdAt: NOW - 40 * DAY, lastUsedAt: NOW - 12 * MIN }] },
  'api /v1/apps/stash/roles': { roles: [
    { userId: UID, roleName: 'owner', grantedBy: null, grantedAt: NOW - 120 * DAY, userLogin: USER.login, userAvatarUrl: null, grantedByLogin: null, grantedByAvatarUrl: null },
    { userId: UID3, roleName: 'cooperative-treasurer', grantedBy: UID, grantedAt: NOW - 5 * DAY, userLogin: null, userAvatarUrl: null, grantedByLogin: USER.login, grantedByAvatarUrl: null },
  ] },
  'api /v1/storefront/apps/stash/team': { members: [{ display_name: 'Alexandra Konstantinopoulou-Papadimitriou', label: 'Founder & dispatch engineering', is_creator: true }] },
  'api /v1/apps/stash/team/public': { appId: 'stash', members: [
    { user_id: UID3, role: 'cooperative-treasurer', display_name: 'Nguyễn Thị Phương Thảo', label: 'Treasurer, Thessaloniki cooperative', visible: true, updated_at: NOW - 3 * DAY },
  ] },
  'api /v1/apps/stash/team/public/me': PUBLIC_PROFILE,

  // Other views
  'api /v1/submissions': { submissions: [
    { id: 'sub_01JDXE0000000000000000000000000002', app_id: LONG_ID, creator_id: UID, status: 'rejected', name: 'Enterprise Fleet Telemetry Reconciliation Service (EU Region)', category: 'transport', description: LONG_TEXT, icon: null, icon_bg: null, pro_features: null, suggested_monthly_price_cents: null, repo_url: `https://github.com/proappstore-online/${LONG_ID}`, reviewer_id: UID2,
      rejection_reason: 'The storefront description promises real-time telematics ingestion from third-party OBD-II dongles, but the submitted build only reads CSV exports.', created_at: new Date(NOW - 9 * DAY).toISOString(), reviewed_at: new Date(NOW - 8 * DAY).toISOString() },
  ] },
  'api /v1/connect/status': { connected: true, stripeAccountId: 'acct_1QxZ8mK4RideshareOperationsEMEA0042', chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, country: 'GR', needsAction: false, updatedAt: NOW - DAY },
  'api /v1/payouts/me/preview': { subscriberPriceCents: 500, platformFeeBps: 1000, perSubscriberPoolCents: 450, months: [
    { month: ymd(NOW).slice(0, 7), isCurrent: true, daysCovered: 27, totalDays: 30, activeUsers: 18342, estimatedCents: 1234567, perApp: [{ appId: 'stash', estimatedCents: 845210 }, { appId: LONG_ID, estimatedCents: 301457 }] },
  ] },
  'api /v1/pricing': { proMonthly: { priceId: 'price_1QxZ8mK4rideshareOperationsProMonthlyEUR', currency: 'eur', dollars: 5 } },
  'api /v1/services/unread': { total: 12 },
  'api /v1/services/developers': { developers: [
    { creatorId: UID, login: USER.login, promptRateCents: 250, bioServices: `${LONG_TEXT} ${UNBROKEN}`, available: true, qualityScore: 9.4, avgPromptLength: 812, completedEngagements: 137, avgRating: 4.9, ratingCount: 121, appCount: 14, badges: ['top-rated', 'expert', 'fast-responder'] },
    { creatorId: UID3, promptRateCents: 100, bioServices: null, available: true, qualityScore: 7.1, avgPromptLength: 300, completedEngagements: 9, avgRating: 4.2, ratingCount: 6, badges: ['rising'] },
  ] },
  'api /v1/me/developer-reputation': { version: 1, policy_version: 3, generated_at: NOW - MIN, identity: 'verified_github', scope: 'current_authorized_apps',
    apps: [
      { app_id: 'stash', role: 'owner', membership_observed_since: NOW - 40 * DAY, state: 'ok', state_reason: 'Complete and fresh: every commit on the default branch was read within the last 24 hours.', verified: true, counts: { commits: 1842, additions: 284117, deletions: 99012 }, first_recorded_commit_at: NOW - 39 * DAY, last_recorded_commit_at: NOW - HOUR, last_refreshed_at: NOW - 2 * HOUR },
      { app_id: LONG_ID, role: 'developer', membership_observed_since: null, state: 'partial', state_reason: 'GitHub rate-limited the history walk after 30,000 commits; totals below are recorded so far and do not count toward badges.', verified: false, counts: { commits: 30000, additions: 1200345, deletions: 800123 }, first_recorded_commit_at: NOW - 400 * DAY, last_recorded_commit_at: NOW - 3 * DAY, last_refreshed_at: NOW - DAY },
    ],
    summary: { current_apps: 2, verified_contributed_repositories: 1, incomplete_apps: 1 },
    badges: [{ id: 'code-contributor', label: 'Code contributor', evidence: 'At least one eligible commit in a complete, fresh, verified repository.' }],
    history_note: 'Only apps you currently own or belong to are included.' },
  'api /v1/keys/providers': { providers: [
    { id: 'anthropic', name: 'Anthropic', docs_url: 'https://console.anthropic.com/settings/keys', key_prefix: 'sk-ant-' },
    { id: 'google-gemini-vertex-enterprise-europe-west4', name: 'Google Gemini (Vertex AI, europe-west4 enterprise tenancy)', docs_url: null, key_prefix: null },
  ] },
  'api /v1/keys/status': { keys: [{ provider: 'anthropic', label: 'rideshare-ops-production-agent-teams-key', createdAt: NOW - 60 * DAY, lastUsedAt: NOW - 5 * MIN }] },
  'api /v1/apps/console/kv/prefs': null,
  'api /v1/apps/directory': { query: null, lookup: null, total: 2, truncated: false, items: [
    { id: 'stash', displayName: STASH_APP.name, lifecycle: 'live', deployStatus: 'deployed', lastDeployAt: NOW - 6 * MIN, submissionStatus: 'pending', accessLevel: 'owner', teamRole: 'owner', pendingTransfer: null, routeUrl: 'https://stash.proappstore.online', routeHealth: 'ok', repoRef: `proappstore-online/stash@${SHA}`,
      links: { details: '/v1/apps/stash', deployHistory: 'https://github.com/proappstore-online/stash/actions/workflows/deploy-cloudflare-pages-production.yml', ownership: '/v1/apps/stash/ownership', storePage: 'https://proappstore.online/apps/stash', repository: 'https://github.com/proappstore-online/stash' }, createdAt: NOW - 40 * DAY },
    { id: LONG_ID, displayName: 'Enterprise Fleet Telemetry Reconciliation Service (EU Region)', lifecycle: 'failed', deployStatus: 'provision_failed', lastDeployAt: null, submissionStatus: 'rejected', accessLevel: 'team', teamRole: 'developer', pendingTransfer: 'incoming', routeUrl: `https://${LONG_ID}.proappstore.online`, routeHealth: 'timeout', repoRef: null,
      links: { details: '/v1/apps/x', deployHistory: null, ownership: '/v1/apps/x/ownership', storePage: null, repository: null }, createdAt: NOW - 90 * DAY },
  ] },
  'api /v1/analytics/admin/platform': { days: 7, bucket: 'day', total_views: 2483921, active_apps: 318, custom_events: 912345,
    series: Array.from({ length: 7 }, (_, i) => ({ t: ymd(NOW - (6 - i) * DAY), views: 300000 + i * 17123 })),
    top_apps: [{ app: 'stash', views: 912003 }, { app: LONG_ID, views: 401223 }], top_countries: [{ country: 'GR', views: 800000 }], device_split: [{ device: 'mobile', views: 1600000 }] },
  'api /v1/analytics/admin/apps': { days: 7, totals: { views: 1313235, apps: 3, apps_with_views: 2, apps_without_views: 1 },
    series: Array.from({ length: 7 }, (_, i) => ({ t: ymd(NOW - (6 - i) * DAY), views: 180000 + i * 4000 })),
    apps: [
      { app_id: LONG_ID, registered: true, views: 401223, series: [{ t: ymd(NOW - DAY), views: 50000 }, { t: ymd(NOW), views: 70000 }] },
      { app_id: 'unregistered-preview-deploy-7f3a9c2e41b8d06c5e2f19a4b7d3c8e0', registered: false, views: 0, series: [] },
    ] },
  'api /v1/admin/test-principals': { next_cursor: null, principals: [
    { id: 'tp_9f3c2a7e5b1d4f8a0c6e2b9d7a5f3c1e', slug: 'stash-e2e-settlement-ledger-smoke-tests-for-cooperative-treasurers', user_id: 'test-principal:stash-e2e-settlement-ledger-smoke-tests', description: LONG_TEXT, status: 'active', created_by: UID, created_at: NOW - 20 * DAY, disabled_at: null, updated_at: NOW - 2 * DAY },
  ] },
  'api /v1/admin/test-principals/tp_9f3c2a7e5b1d4f8a0c6e2b9d7a5f3c1e': {
    principal: { id: 'tp_9f3c2a7e5b1d4f8a0c6e2b9d7a5f3c1e', slug: 'stash-e2e-settlement-ledger-smoke-tests-for-cooperative-treasurers', user_id: 'test-principal:stash-e2e-settlement-ledger-smoke-tests', description: LONG_TEXT, status: 'active', created_by: UID, created_at: NOW - 20 * DAY, disabled_at: null, updated_at: NOW - 2 * DAY },
    grants: [
      { id: 'og_1', repository: 'proappstore-online/stash-end-to-end-settlement-ledger-regression-suite', workflow: '.github/workflows/nightly-settlement-ledger-playwright-regression.yml', ref: 'refs/heads/main', user_id: 'test-principal:stash', label: null, created_by: UID, created_at: NOW - 19 * DAY, revoked_at: null, last_minted_at: NOW - 2 * HOUR, mint_count: 1432, principal_id: 'tp_9f3c2a7e5b1d4f8a0c6e2b9d7a5f3c1e', environment: 'production-eu-west-1', expires_at: NOW + 11 * DAY, session_ttl_seconds: 900, scope: 'user' },
    ] },
  'api /v1/admin/test-principal-events': { next_cursor: null, events: [
    { id: 9101, principal_id: 'tp_9f3c2a7e5b1d4f8a0c6e2b9d7a5f3c1e', grant_id: 'og_1', action: 'grant.created', actor: EMAIL, detail: '{}', at: NOW - 19 * DAY, request_id: `req_${TRACE}`, reason: 'Release workflow migrated to the reusable deploy workflow in proappstore-online/.github' },
  ] },
  'api /v1/promoters/me': { promoters: [PROMOTER] },
  'api /v1/storefront/promoters/apps': { next: null, apps: [{ appId: 'stash', iconUrl: null, tagline: 'Receipts vault', category: 'productivity' }, { appId: LONG_ID, iconUrl: null, tagline: null, category: 'transport' }] },
  'api /v1/storefront/promoters/apps/stash/readiness': { enrollment_open: true, referral_tracking: { ready: true, reason: null, protocol_version: 1 } },
  'api /v1/apps/stash/promoters/me': { promoter: PROMOTER },
  'api /v1/apps/stash/promoters/me/contributions': { version: 1, app_id: 'stash',
    freshness: { as_of: NOW - 4 * MIN, referrals_recorded_since: NOW - 180 * DAY, note: 'Referrals are counted from first authenticated app use.' },
    contributions: {
      promotion: { promoter_status: 'active', recorded: true, first_confirmed_at: NOW - 18 * DAY, counts: { pending: 14, confirmed: 1287, reversed: 3, expired: 41 }, share_of_referred_users: { numerator: 1287, denominator: 9034, ratio: 0.14246, percent: 14.2, basis: 'confirmed referrals among all promoters for this app and period' }, standing: { rank: 2, ranked_promoters: 117, tied_on_count: true } },
      code: { available: false, reason: 'Code contributions are reported separately in the app team’s Contributions tab.' },
    } },
  'api /v1/apps/stash/promoters/me/referrals': { promoter_status: 'active', counts: { pending: 14, confirmed: 1287 }, next: null, referrals: [
    { referral_id: 'ref_01JDXH0000000000000000000000000000000001', status: 'confirmed', captured_at: NOW - 2 * DAY, expires_at: NOW + 12 * DAY, activated_at: NOW - DAY, confirmed_at: NOW - DAY },
  ] },
};

// Contributions: the summary and the people list are cross-checked by the console, so they share these.
const FRESHNESS = { refresh_mode: 'scheduled', last_success_at: NOW - 12 * MIN, last_success_iso: new Date(NOW - 12 * MIN).toISOString(), last_attempt_at: NOW - 12 * MIN, next_refresh_at: NOW + 18 * MIN, age_ms: 12 * MIN, rate_limited_until: null, backfill_complete: true, head_sha: SHA, rewrite_detected_at: null, note: 'Refreshed every 30 minutes from the GitHub App installation.' };
const PERIOD = { from: null, to: null, from_iso: null, to_iso: null, rule: 'Commits with committer date from <= date < to, UTC, half-open interval' };
const SHARE_BASIS = 'Share is each person’s eligible additions divided by all eligible additions.';
GET['api /v1/apps/stash/contributions'] = { app_id: 'stash', state: 'ok', state_reason: 'All reachable history on the default branch has been counted.', complete: true,
  repository: { full_name: 'proappstore-online/stash', status: 'verified', default_branch: 'main', verified_at: NOW - 40 * DAY },
  period: PERIOD, policy_version: 3,
  policy: { version: 3, counts: 'Added and removed lines in source, configuration and test files on the default branch', tests: 'counted like source', documentation: 'excluded', excluded: ['lockfiles (package-lock.json, pnpm-lock.yaml, yarn.lock)'], merge_commits: 'Merge commits are not counted', authorship: 'Credit goes to the commit author', period: 'UTC half-open interval on committer date' },
  freshness: FRESHNESS,
  totals: { additions: 140_279, deletions: 45_314, commits: 1_692, people: 2, truncated_commits: 3, co_authored_commits: 57 },
  buckets: { bots: { additions: 22_110, deletions: 9_870, commits: 412 }, unlinked: { additions: 4_310, deletions: 1_022, commits: 38 } },
  excluded: { unreachable_commits: 14, merge_commits_not_counted: 288 }, share_basis: SHARE_BASIS };
GET['api /v1/apps/stash/contributions/people'] = { app_id: 'stash', state: 'ok', state_reason: 'All reachable history on the default branch has been counted.', complete: true,
  period: PERIOD, freshness: FRESHNESS, policy_version: 3, share_basis: SHARE_BASIS, tie_order: 'additions desc, then github_account_id asc', eligible_additions: 140_279,
  people: [
    { rank: 1, github_account_id: 58293746, github_login: 'alexandra-konstantinopoulou-dispatch-engineering', matched: true, user_id: UID, additions: 98_402, deletions: 30_114, commits: 1_102, last_commit_at: NOW - 3 * HOUR, last_commit_iso: new Date(NOW - 3 * HOUR).toISOString(), share: { numerator: 98_402, denominator: 140_279, ratio: 0.7015, percent: 70.1, basis: 'eligible additions' } },
    { rank: 2, github_account_id: 61029384, github_login: 'dimitrios-papadopoulos-thessaloniki-cooperative', matched: true, user_id: UID2, additions: 41_877, deletions: 15_200, commits: 590, last_commit_at: NOW - 2 * DAY, last_commit_iso: new Date(NOW - 2 * DAY).toISOString(), share: { numerator: 41_877, denominator: 140_279, ratio: 0.2985, percent: 29.9, basis: 'eligible additions' } },
  ], next: null };

/** Answers a GET whose body depends on the query string. */
function dynamicGet(key: string, url: URL): unknown {
  if (key === 'agents /v1/projects/stash/chat/history') return CHAT[url.searchParams.get('thread') ?? ''] ?? { messages: [] };
  if (key === 'agents /v1/projects/stash/files/content') {
    const path = url.searchParams.get('path') ?? '';
    return { path, truncated: false, content: `# ${path}\n\n${LONG_TEXT}\n\n| Member state | Mandate | Retention |\n|---|---|---|\n| Italy | SdI | 10y |\n\nSource: ${LONG_URL}/${UNBROKEN}\n` };
  }
  const resource = /^api \/v1\/apps\/stash\/operator\/resources\/([^/]+)$/.exec(key);
  if (resource) return { rows: OPERATOR_ROWS[resource[1]!] ?? [], next_cursor: resource[1] === 'drivers' ? UID3 : null };
  return undefined;
}

/** The rows of the first table, as DbBrowser's row browser asks for them. */
function dataQuery(sql: string): unknown {
  if (/^SELECT \* FROM "/.test(sql)) return { meta: { rows_read: 2 }, results: [
    { id: 'ride_01JDX8Q6Z3V9K2M4N7P1R5T8W0', driver_id: UID2, rider_email: EMAIL, pickup_geohash: 'sx0r7q2m9f', fare_cents: 1840, status: 'completed', notes: LONG_TEXT, metadata: { surge: false, coop: 'thessaloniki' }, completed_at: NOW - 3 * HOUR },
    { id: 'ride_01JDX7R2A8B4C6D0E3F5G7H9J1', driver_id: UID3, rider_email: 'k@example.com', pickup_geohash: 'sw8z1x', fare_cents: 920, status: 'disputed', notes: null, metadata: null, completed_at: NOW - DAY },
  ] };
  return undefined;
}

const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

export class FakeApi {
  /** Backend requests the fake does not know: the check must not make any. */
  unexpected: string[] = [];

  async handle(route: Route, request: Request): Promise<void> {
    const url = new URL(request.url());
    const method = request.method();
    const cors = {
      'access-control-allow-origin': request.headers()['origin'] ?? '*',
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? 'authorization,content-type',
    };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    // Images (the Control tab's badge): any small image will do.
    if (request.resourceType() === 'image') return route.fulfill({ status: 200, headers: cors, contentType: 'image/png', body: TINY_PNG });
    const reply = (json: unknown, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(json) });

    const host = url.hostname.replace(/\.proappstore\.online$/, '');
    const key = `${host} ${url.pathname}`;
    let body: unknown = null;
    try { body = request.postDataJSON(); } catch { body = null; }

    if (method === 'GET') {
      if (Object.prototype.hasOwnProperty.call(GET, key)) return reply(GET[key]);
      const dynamic = dynamicGet(key, url);
      if (dynamic !== undefined) return reply(dynamic);
    }
    if (method === 'POST') {
      if (key === 'api /v1/apps/console/roles/ensure-member' || key === 'api /v1/usage/ping' || key === 'api /v1/apps/console/logs') return reply({ ok: true });
      if (key === 'api /v1/apps/stash/operator/entries') return reply({ recorded: true });
      if (key === 'data-stash /query') {
        const result = dataQuery(String((body as { sql?: unknown } | null)?.sql ?? ''));
        if (result !== undefined) return reply(result);
      }
    }
    this.unexpected.push(`${method} ${url.href}`);
    return reply({ error: 'not in the e2e fake' }, 404);
  }
}
