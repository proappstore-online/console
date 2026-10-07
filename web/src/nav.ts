// Pure navigation + app-list helpers — no DOM, no network, so they're unit-testable.

export type View =
  | 'dashboard' | 'app-detail' | 'publish' | 'payouts'
  | 'subscription' | 'services' | 'admin' | 'profile' | 'ui-library' | 'connector-setup'

// Per-app workspace tabs, shown next to the project switcher in the navbar.
//  - research: brainstorm chat + live Knowledge Base preview
//  - build:    the agent kanban + activity feed
//  - data:     D1 table browser, SQL console, and schema graph
//  - test:     automated QA / E2E (Playwright, manual/opt-in)
//  - control:  the live VCQA code-health dashboard (ops/control)
//  - spending: cost breakdown by role, ticket, and ledger history
//  - operator: oversight of the app (#240) — shown only when the platform admits you: the
//              owner, or a holder of one of the app's admin_access roles (platform#293, #297)
//  - settings: listing / domains / app roles + agent team config / danger zone
export type AppTab = 'research' | 'build' | 'data' | 'test' | 'control' | 'analytics' | 'spending' | 'style' | 'operator' | 'settings'
export type AppSettingsTab = 'storefront' | 'publishing' | 'agents' | 'integrations' | 'access' | 'danger'

export const APP_TABS: { key: AppTab; label: string }[] = [
  { key: 'research', label: 'Research' },
  { key: 'build', label: 'Build' },
  { key: 'data', label: 'Data' },
  { key: 'test', label: 'Test' },
  { key: 'control', label: 'Control' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'spending', label: 'Spending' },
  { key: 'style', label: 'Style' },
  { key: 'operator', label: 'Operator' },
  { key: 'settings', label: 'Settings' },
]

export const APP_SETTINGS_TABS: { key: AppSettingsTab; label: string }[] = [
  { key: 'storefront', label: 'Storefront' },
  { key: 'publishing', label: 'Publishing' },
  { key: 'agents', label: 'Agents' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'access', label: 'Access' },
  { key: 'danger', label: 'Danger' },
]

export interface AppEntry {
  id: string
  name: string
  /** ISO timestamp string, derived from the backend's created_at (epoch ms). */
  createdAt: string
  category?: string | null
  description?: string | null
  hasSubmission?: boolean
  submissionStatus?: string | null
  /** false when the app exists only as an agent-teams project (not yet published). */
  published?: boolean
  /** true when an agent team (project) exists for this app. */
  hasAgentTeam?: boolean
  /** Caller's team role on the app ('owner' for the creator); absent for project-only apps. */
  teamRole?: string | null
  /** An app the caller only administers (an admin_access role, platform#297): it offers the operator view alone. */
  adminOnly?: boolean
}

/** Whether the platform admits the caller to an app's operator view (operator.ts probeOperatorAccess). */
export type OperatorAccessStatus = 'unknown' | 'allowed' | 'refused'

/**
 * The workspace tabs for an app (platform#297). The operator tab shows only when
 * the backend has admitted the caller (`allowed`) — the console never infers it
 * from a team role. An app the caller only administers offers nothing else: its
 * other tabs are the owner's and team's, and their data would be refused.
 */
export function appTabsFor(app: AppEntry | undefined, operator: OperatorAccessStatus = 'unknown'): { key: AppTab; label: string }[] {
  const tabs = app?.adminOnly ? APP_TABS.filter((t) => t.key === 'operator') : APP_TABS
  return operator === 'allowed' ? tabs : tabs.filter((t) => t.key !== 'operator')
}

/** The tab an app opens on: the operator view for an app the caller only administers. */
export function effectiveAppTab(app: AppEntry | undefined, tab: AppTab): AppTab {
  return app?.adminOnly ? 'operator' : tab
}

const VALID_VIEWS: View[] = [
  'dashboard', 'app-detail', 'publish', 'payouts', 'subscription', 'services', 'admin', 'profile', 'ui-library',
]

/** Where the platform sends the owner after GitHub's App install (platform#258). */
const CONNECTOR_SETUP_PATH = 'connectors/github/setup'

/** The `?installation_id=…&state=…&code=…` GitHub handed back, from a setup-route hash. */
export function parseConnectorSetup(rawHash: string): Record<string, string> {
  const query = rawHash.replace(/^#\/?/, '').split('?')[1] ?? ''
  return Object.fromEntries(new URLSearchParams(query))
}

export interface ParsedRoute {
  view: View
  param: string | null
  tab: AppTab | null
  settingsTab: AppSettingsTab | null
}

/** Parse a location hash into a view + optional app slug + optional app tab.
 *  App routes are `#/apps/<slug>` or `#/apps/<slug>/<tab>` (tab deep-links the
 *  per-app workspace). Settings subtabs are `#/apps/<slug>/settings/<subtab>`.
 *  `tab` / `settingsTab` are null when absent or not recognized. */
export function parseHash(rawHash: string): ParsedRoute {
  const hash = rawHash.replace(/^#\/?/, '')
  if (!hash || hash === 'dashboard') return { view: 'dashboard', param: null, tab: null, settingsTab: null }
  if (hash.startsWith('apps/')) {
    const [param, maybeTab, maybeSettingsTab] = hash.slice(5).split('/')
    if (!param) return { view: 'dashboard', param: null, tab: null, settingsTab: null }
    if (maybeTab === 'settings' && maybeSettingsTab === 'data') {
      return { view: 'app-detail', param, tab: 'data', settingsTab: null }
    }
    const tab = APP_TABS.some((t) => t.key === maybeTab) ? (maybeTab as AppTab) : null
    const settingsTab = tab === 'settings' && APP_SETTINGS_TABS.some((t) => t.key === maybeSettingsTab)
      ? (maybeSettingsTab as AppSettingsTab)
      : null
    return { view: 'app-detail', param, tab, settingsTab }
  }
  if (hash.startsWith(CONNECTOR_SETUP_PATH)) return { view: 'connector-setup', param: null, tab: null, settingsTab: null }
  if (VALID_VIEWS.includes(hash as View)) return { view: hash as View, param: null, tab: null, settingsTab: null }
  return { view: 'dashboard', param: null, tab: null, settingsTab: null }
}

/** Build the hash string for a view (inverse of parseHash). A tab is appended
 *  only for app-detail routes that carry one. */
export function hashFor(
  view: View,
  param?: string | null,
  tab?: AppTab | null,
  settingsTab?: AppSettingsTab | null,
): string {
  if (view === 'app-detail' && param) {
    if (tab === 'settings' && settingsTab) return `#/apps/${param}/settings/${settingsTab}`
    return tab ? `#/apps/${param}/${tab}` : `#/apps/${param}`
  }
  const path = view === 'dashboard' ? '' : view
  return path ? `#/${path}` : '#/'
}

/** Derive an app id/slug from a display name. Empty when the name has no
 *  alphanumerics (caller should reject). Prefixes `app-` if it starts non-letter. */
export function deriveSlug(name: string): string {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56)
  if (!id) return ''
  return (/^[a-z]/.test(id) ? id : `app-${id}`).slice(0, 56)
}

/** Merge published apps (registry) with agent-teams projects, deduped by id, then
 *  the apps the caller only administers (platform#297) — owner and team entries win. */
export function mergeApps(
  apps: AppEntry[],
  projects: { slug: string; name: string; createdAt: number }[],
  administered: AppEntry[] = [],
): AppEntry[] {
  const projSlugs = new Set(projects.map((p) => p.slug))
  const byId = new Map<string, AppEntry>()
  for (const a of apps) byId.set(a.id, { ...a, published: true, hasAgentTeam: projSlugs.has(a.id) })
  // Add project-only entries (in-progress apps not yet published)
  for (const p of projects) {
    if (byId.has(p.slug)) continue
    byId.set(p.slug, {
      id: p.slug,
      name: p.name,
      createdAt: new Date(p.createdAt).toISOString(),
      published: false,
      hasAgentTeam: true,
    })
  }
  for (const a of administered) if (!byId.has(a.id)) byId.set(a.id, { ...a, adminOnly: true, published: true })
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Deep link to one record of an operator resource (#240): `#/apps/<slug>/operator/<resource>/<key>`. */
export function operatorRecordHash(appId: string, resourceId: string, key: string): string {
  return `#/apps/${appId}/operator/${encodeURIComponent(resourceId)}/${encodeURIComponent(key)}`
}

/** The record an operator deep link names, or null on any other route. */
export function parseOperatorRecord(rawHash: string): { resourceId: string; key: string } | null {
  const [apps, , tab, resourceId, key, ...rest] = rawHash.replace(/^#\/?/, '').split('/')
  if (apps !== 'apps' || tab !== 'operator' || !resourceId || !key || rest.length) return null
  try {
    return { resourceId: decodeURIComponent(resourceId), key: decodeURIComponent(key) }
  } catch {
    return null // malformed %-escape
  }
}
