import { useState, useEffect, useCallback } from 'react'
import { fetchListing, type Listing } from './listings'
import { RolesManager } from './RolesManager'
import { DbBrowser } from './DbBrowser'
import { WebhooksManager } from './WebhooksManager'
import { CodeHealth } from './CodeHealth'
import { AppAgents } from './AppAgents'
import {
  BrandingSection, ListingCopySection, ScreenshotsSection, DeveloperSection,
  SocialSection, LegalSection, UsageSection, AnalyticsSection, DomainsSection,
  StorefrontTile,
} from './AppDetailSections'

interface Props {
  appId: string
  appName: string | null
  getToken: () => string | null
  onBack: () => void
  onDelete: () => Promise<void>
  initialTab?: 'overview' | 'agents'
}

export function AppDetail({ appId, appName, getToken, onBack, onDelete, initialTab }: Props) {
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Settings (listing/config) live behind a button now — the agents workspace is
  // the page; settings open as a separate full view to free up vertical space.
  const [showSettings, setShowSettings] = useState(initialTab === 'overview')

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
    <div className="space-y-3">
      {/* Compact breadcrumb (Apps / name [/ Settings]) + Settings button + live link */}
      <div className="flex items-center justify-between gap-3">
        <nav className="flex items-center gap-2 text-sm min-w-0">
          <button type="button" onClick={onBack} className="font-medium text-[var(--accent)] hover:underline">Apps</button>
          <span className="text-[var(--muted)]">/</span>
          {showSettings ? (
            <button type="button" onClick={() => setShowSettings(false)} className="font-medium text-[var(--accent)] hover:underline truncate">{appName ?? appId}</button>
          ) : (
            <span className="font-semibold text-[var(--ink)] truncate">{appName ?? appId}</span>
          )}
          {showSettings && (
            <>
              <span className="text-[var(--muted)]">/</span>
              <span className="font-semibold text-[var(--ink)]">Settings</span>
            </>
          )}
        </nav>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowSettings((s) => !s)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              showSettings
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            {showSettings ? 'Close settings' : 'Settings'}
          </button>
          <a
            href={`https://${subdomain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] whitespace-nowrap"
          >
            {subdomain} &rarr;
          </a>
        </div>
      </div>

      {!showSettings && (
        <AppAgents appId={appId} appName={appName} getToken={getToken} />
      )}

      {showSettings && loading && (
        <p className="text-[var(--muted)] py-12 text-center">Loading listing…</p>
      )}
      {showSettings && !loading && (loadError || !listing) && (
        <p className="text-[var(--muted)] py-12 text-center">
          No storefront listing yet — this app hasn't been published/provisioned. Use the agents workspace to build it.
        </p>
      )}
      {showSettings && !loading && listing && (
      <div className="grid gap-6 lg:grid-cols-[1fr_320px] max-w-6xl">
        <div className="space-y-6">
          <BrandingSection appId={appId} listing={listing} update={update} getToken={getToken} />
          <ListingCopySection appId={appId} listing={listing} update={update} getToken={getToken} />
          <ScreenshotsSection appId={appId} listing={listing} update={update} getToken={getToken} />
          <UsageSection appId={appId} getToken={getToken} />
          <AnalyticsSection appId={appId} getToken={getToken} />
          <DomainsSection appId={appId} getToken={getToken} />
          <DeveloperSection appId={appId} listing={listing} update={update} getToken={getToken} />
          <SocialSection appId={appId} listing={listing} update={update} getToken={getToken} />
          <LegalSection appId={appId} listing={listing} update={update} getToken={getToken} />
          <RolesManager appId={appId} getToken={getToken} />
          <WebhooksManager appId={appId} getToken={getToken} />
          <CodeHealth appId={appId} />
          <DbBrowser appId={appId} getToken={getToken} />

          <div className="rounded-2xl border border-[var(--error)]/30 bg-[var(--panel)] p-6">
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
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Storefront preview</h3>
            <StorefrontTile listing={listing} appName={appName ?? appId} subdomain={subdomain} />
          </div>
        </aside>
      </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

