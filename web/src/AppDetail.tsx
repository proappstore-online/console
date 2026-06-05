import { useState, useEffect, useCallback } from 'react'
import { fetchListing, type Listing } from './listings'
import { RolesManager } from './RolesManager'
import { DbBrowser } from './DbBrowser'
import { WebhooksManager } from './WebhooksManager'
import { CodeHealth } from './CodeHealth'
import { AppTest } from './AppTest'
import { AgentsView } from './AgentsView'
import { AppMcpTools } from './AppMcpTools'
import { AppSecrets } from './AppSecrets'
import { AppPublishing } from './AppPublishing'
import { AppAgents } from './AppAgents'
import type { AppTab } from './nav'
import {
  BrandingSection, ListingCopySection, ScreenshotsSection, DeveloperSection,
  SocialSection, LegalSection, UsageSection, AnalyticsSection, DomainsSection,
  StorefrontTile,
} from './AppDetailSections'

interface Props {
  appId: string
  appName: string | null
  getToken: () => string | null
  onDelete: () => Promise<void>
  /** Which per-app workspace tab is active (navbar switcher). */
  tab: AppTab
}

// Sub-navigation within the Settings tab — all per-app configuration lives here.
const SETTINGS_TABS = [
  { key: 'storefront', label: 'Storefront' },
  { key: 'publishing', label: 'Publishing' },
  { key: 'agents', label: 'Agents' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'access', label: 'Access & Data' },
  { key: 'danger', label: 'Danger' },
] as const
type SettingsTab = typeof SETTINGS_TABS[number]['key']

export function AppDetail({ appId, appName, getToken, onDelete, tab }: Props) {
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('storefront')
  const showSettings = tab === 'settings'

  useEffect(() => {
    let cancelled = false
    const token = getToken()
    if (!token) return
    fetchListing(token, appId)
      .then((l) => { if (!cancelled) setListing(l) })
      .catch((e: Error) => { if (!cancelled) setLoadError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [appId, getToken])

  const update = useCallback((next: Listing) => setListing(next), [])

  const subdomain = `${appId}.proappstore.online`

  return (
    <div className="flex-1 flex flex-col gap-2 min-h-0">
      {/* Navbar owns the project switcher / tab switcher / live link.
          Research + Build share ONE AppAgents instance (kept mounted across the
          switch so its WebSocket + state survive) — it just renders chat+KB vs
          kanban+activity based on `tab`. */}
      {(tab === 'research' || tab === 'build') && (
        <AppAgents appId={appId} appName={appName} getToken={getToken} tab={tab} />
      )}

      {tab === 'test' && (
        <AppTest appId={appId} getToken={getToken} />
      )}

      {tab === 'control' && (
        <div className="max-w-4xl space-y-3">
          <h2 className="display-font text-lg font-bold text-[var(--ink)]">{appName ?? appId} — Control</h2>
          <p className="text-sm text-[var(--muted)]">
            Interactive code-health dashboard (<a href="https://vibecodeqa.online" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)]">VCQA</a>).
            Click "Fix" on any issue to send it to the Dev agent.
          </p>
          <CodeHealth appId={appId} live getToken={getToken} />
        </div>
      )}

      {showSettings && (
        <div className="space-y-4">
          <h2 className="display-font text-lg font-bold text-[var(--ink)]">{appName ?? appId} — Settings</h2>

          {/* Sub-nav: all per-app configuration is grouped here. */}
          <div className="flex items-center gap-0.5 flex-wrap rounded-lg border border-[var(--line-strong)] p-0.5 w-fit max-w-full overflow-x-auto">
            {SETTINGS_TABS.map((s) => (
              <button key={s.key} type="button" onClick={() => setSettingsTab(s.key)}
                className={`px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap transition-colors ${
                  settingsTab === s.key ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--panel-hover)]'
                }`}>
                {s.label}
              </button>
            ))}
          </div>

          {settingsTab === 'storefront' && (
            <>
              {loading && <p className="text-[var(--muted)] py-12 text-center">Loading listing…</p>}
              {!loading && (loadError || !listing) && (
                <p className="text-[var(--muted)] py-12 text-center">
                  No storefront listing yet — this app hasn't been published/provisioned. Use the Build tab to create it.
                </p>
              )}
              {!loading && listing && (
                <div className="grid gap-6 lg:grid-cols-[1fr_320px] max-w-6xl">
                  <div className="space-y-6">
                    <BrandingSection appId={appId} listing={listing} update={update} getToken={getToken} />
                    <ListingCopySection appId={appId} listing={listing} update={update} getToken={getToken} />
                    <ScreenshotsSection appId={appId} listing={listing} update={update} getToken={getToken} />
                    <UsageSection appId={appId} getToken={getToken} />
                    <AnalyticsSection appId={appId} getToken={getToken} />
                    <DeveloperSection appId={appId} listing={listing} update={update} getToken={getToken} />
                    <SocialSection appId={appId} listing={listing} update={update} getToken={getToken} />
                    <LegalSection appId={appId} listing={listing} update={update} getToken={getToken} />
                  </div>
                  <aside className="hidden lg:block">
                    <div className="sticky top-24">
                      <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Storefront preview</h3>
                      <StorefrontTile listing={listing} appName={appName ?? appId} subdomain={subdomain} />
                    </div>
                  </aside>
                </div>
              )}
            </>
          )}

          {settingsTab === 'publishing' && (
            <div className="max-w-3xl space-y-6">
              <AppPublishing appId={appId} />
              <DomainsSection appId={appId} getToken={getToken} />
            </div>
          )}

          {settingsTab === 'agents' && (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
              <AgentsView appId={appId} appName={appName} getToken={getToken} />
            </div>
          )}

          {settingsTab === 'integrations' && (
            <div className="max-w-3xl space-y-6">
              <WebhooksManager appId={appId} getToken={getToken} />
              <AppMcpTools appId={appId} getToken={getToken} />
              <AppSecrets appId={appId} getToken={getToken} />
            </div>
          )}

          {settingsTab === 'access' && (
            <div className="max-w-3xl space-y-6">
              <RolesManager appId={appId} getToken={getToken} />
              <DbBrowser appId={appId} getToken={getToken} />
            </div>
          )}

          {settingsTab === 'danger' && (
            <div className="max-w-2xl rounded-2xl border border-[var(--error)]/30 bg-[var(--panel)] p-6">
              <h3 className="text-sm font-semibold text-[var(--error)] uppercase tracking-wide mb-3">Danger Zone</h3>
              {!showDeleteConfirm ? (
                <button type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="rounded-lg border border-[var(--error)]/40 px-4 py-2 text-sm font-semibold text-[var(--error)] hover:bg-[var(--error)]/10"
                >
                  Remove from dashboard
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--error)]">
                    This removes <strong>{appName ?? appId}</strong> from your dashboard listing.
                    The deployed app, repo, and DNS stay live.
                  </p>
                  <div className="flex gap-2">
                    <button type="button"
                      onClick={async () => { setDeleting(true); try { await onDelete() } finally { setDeleting(false) } }}
                      disabled={deleting}
                      className="rounded-lg bg-[var(--error)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {deleting ? 'Removing…' : 'Yes, remove'}
                    </button>
                    <button type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="rounded-lg border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

