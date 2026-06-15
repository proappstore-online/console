// Pure navigation + app-list helpers — no DOM, no network, so they're unit-testable.

export type View =
  | 'dashboard' | 'app-detail' | 'publish' | 'payouts'
  | 'subscription' | 'services' | 'admin' | 'profile' | 'ui-library'

// Per-app workspace tabs, shown next to the project switcher in the navbar.
//  - research: brainstorm chat + live Knowledge Base preview
//  - build:    the agent kanban + activity feed
//  - data:     D1 table browser, SQL console, and schema graph
//  - test:     automated QA / E2E (Playwright, manual/opt-in)
//  - control:  the live VCQA code-health dashboard (ops/control)
//  - spending: cost breakdown by role, ticket, and ledger history
//  - settings: listing / domains / app roles + agent team config / danger zone
export type AppTab = 'research' | 'build' | 'data' | 'test' | 'control' | 'analytics' | 'spending' | 'style' | 'settings'
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
}

const VALID_VIEWS: View[] = [
  'dashboard', 'app-detail', 'publish', 'payouts', 'subscription', 'services', 'admin', 'profile', 'ui-library',
]

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

/** Merge published apps (registry) with agent-teams projects, deduped by id. */
export function mergeApps(
  apps: AppEntry[],
  projects: { slug: string; name: string; createdAt: number }[],
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
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
