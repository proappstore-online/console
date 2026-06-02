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
  const [tab, setTab] = useState<'overview' | 'agents'>(initialTab ?? 'agents')

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
    <div className="space-y-4">
      {/* Compact breadcrumb (Apps / name) + live link — no bulky icon/header */}
      <div className="flex items-center justify-between gap-3">
        <nav className="flex items-center gap-2 text-sm min-w-0">
          <button type="button" onClick={onBack} className="font-medium text-[var(--accent)] hover:underline">Apps</button>
          <span className="text-[var(--muted)]">/</span>
          <span className="font-semibold text-[var(--ink)] truncate">{appName ?? appId}</span>
        </nav>
        <a
          href={`https://${subdomain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] flex-shrink-0 whitespace-nowrap"
        >
          {subdomain} &rarr;
        </a>
      </div>

      {/* Tabs: Agents (the build/maintenance team) | Overview (listing/settings) */}
      <div className="flex gap-1 border-b border-[var(--line)]">
        {(['agents', 'overview'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-[var(--accent)] text-[var(--ink)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'agents' && (
        <AppAgents appId={appId} appName={appName} getToken={getToken} />
      )}

      {tab === 'overview' && loading && (
        <p className="text-[var(--muted)] py-12 text-center">Loading listing…</p>
      )}
      {tab === 'overview' && !loading && (loadError || !listing) && (
        <p className="text-[var(--muted)] py-12 text-center">
          No storefront listing yet — this app hasn't been published/provisioned. Use the <strong>Agents</strong> tab to build it.
        </p>
      )}
      {tab === 'overview' && !loading && listing && (
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
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

