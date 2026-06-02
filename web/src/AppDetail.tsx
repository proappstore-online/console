import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  fetchListing,
  patchListing,
  uploadAsset,
  CATEGORIES,
  type Listing,
} from './listings'
import {
  fetchAppUsage,
  formatNumber,
  formatDuration,
  dayOfWeekLabel,
  type UsageResponse,
} from './usage'
import {
  fetchAnalyticsConfig,
  fetchAnalyticsDiagnostics,
  fetchAnalyticsEvents,
  fetchAnalyticsLive,
  fetchAnalyticsStats,
  updateAnalyticsConfig,
  formatViewCount,
  type AnalyticsConfig,
  type AnalyticsStats,
  type DiagnosticsResponse,
  type EventKindSummary,
  type LiveResponse,
} from './analytics'
import {
  listDomains,
  attachDomain,
  verifyDomain,
  removeDomain,
  cnameTarget,
  type Domain,
} from './domains'
import { RolesManager } from './RolesManager'
import { DbBrowser } from './DbBrowser'
import { WebhooksManager } from './WebhooksManager'
import { CodeHealth } from './CodeHealth'
import { AppAgents } from './AppAgents'

interface Props {
  appId: string
  appName: string | null
  getToken: () => string | null
  onBack: () => void
  onDelete: () => Promise<void>
  initialTab?: 'overview' | 'agents'
}

type SaveState = 'idle' | 'saving' | 'saved' | { error: string }

export function AppDetail({ appId, appName, getToken, onBack, onDelete, initialTab }: Props) {
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [tab, setTab] = useState<'overview' | 'agents'>(initialTab ?? 'overview')

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-sm font-medium text-[var(--accent)] hover:underline">
          &larr; Back to Dashboard
        </button>
        <a
          href={`https://${subdomain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]"
        >
          {subdomain} &rarr;
        </a>
      </div>

      <header className="flex items-center gap-4">
        <Preview iconUrl={listing?.iconUrl ?? null} splashColor={listing?.splashColor ?? null} />
        <div>
          <h2 className="display-font text-3xl font-bold text-[var(--ink)]">{appName ?? appId}</h2>
          <p className="text-sm text-[var(--muted)] font-mono">{appId}</p>
        </div>
      </header>

      {/* Tabs: Overview (listing/settings) | Agents (the build/maintenance team) */}
      <div className="flex gap-1 border-b border-[var(--line)]">
        {(['overview', 'agents'] as const).map((t) => (
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

interface SectionProps {
  appId: string
  listing: Listing
  update: (next: Listing) => void
  getToken: () => string | null
}

function Section({
  title, hint, state, children, onSave,
}: {
  title: string
  hint?: React.ReactNode
  state: SaveState
  children: React.ReactNode
  onSave: () => void | Promise<void>
}) {
  const stateLabel =
    state === 'idle' ? null :
    state === 'saving' ? 'Saving…' :
    state === 'saved' ? 'Saved' :
    state.error
  const stateColor =
    state === 'saved' ? 'text-[var(--success)]' :
    typeof state === 'object' ? 'text-[var(--error)]' :
    'text-[var(--muted)]'
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="display-font text-lg font-bold text-[var(--ink)]">{title}</h3>
        {stateLabel && <span className={`text-xs ${stateColor}`}>{stateLabel}</span>}
      </div>
      {hint && <p className="text-sm text-[var(--muted)] mb-4">{hint}</p>}
      <div className="space-y-4">{children}</div>
      <div className="mt-5 flex justify-end">
        <button type="button"
          onClick={() => onSave()}
          disabled={state === 'saving'}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {state === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  )
}

function useSection<K extends keyof Listing>(
  appId: string,
  listing: Listing,
  update: (next: Listing) => void,
  getToken: () => string | null,
  keys: readonly K[],
) {
  const [state, setState] = useState<SaveState>('idle')
  const [draft, setDraft] = useState<Partial<Listing>>(() =>
    Object.fromEntries(keys.map((k) => [k, listing[k]])) as Partial<Listing>,
  )
  const listingRef = useRef(listing)
  useEffect(() => {
    listingRef.current = listing
    setDraft(Object.fromEntries(keys.map((k) => [k, listing[k]])) as Partial<Listing>)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.updatedAt])

  const set = useCallback(<K2 extends K>(k: K2, v: Listing[K2]) => {
    setDraft((d) => ({ ...d, [k]: v }))
  }, [])

  const save = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setState({ error: 'Not signed in.' })
      return
    }
    setState('saving')
    try {
      const next = await patchListing(token, appId, draft)
      update(next)
      setState('saved')
      setTimeout(() => setState('idle'), 2000)
    } catch (e) {
      setState({ error: (e as Error).message })
    }
  }, [appId, draft, getToken, update])

  return { state, draft, set, save }
}

function BrandingSection({ appId, listing, update, getToken }: SectionProps) {
  const { state, draft, set, save } = useSection(appId, listing, update, getToken, [
    'iconUrl', 'themeColor', 'splashColor',
  ])
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleIconFile(file: File) {
    const token = getToken()
    if (!token) return
    setUploading(true)
    try {
      const { url } = await uploadAsset(token, appId, 'icon', file)
      set('iconUrl', url)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Section title="Branding" hint="Icon, theme, and tile colors used on the storefront." state={state} onSave={save}>
      <Row label="Icon">
        <div className="flex items-center gap-3">
          <Preview iconUrl={draft.iconUrl ?? null} splashColor={draft.splashColor ?? null} />
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleIconFile(f) }}
              className="hidden"
            />
            <button type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-1.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--panel-hover)] disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : draft.iconUrl ? 'Replace icon' : 'Upload icon'}
            </button>
            {draft.iconUrl && (
              <button type="button"
                onClick={() => set('iconUrl', null)}
                className="text-xs text-[var(--muted)] hover:text-[var(--error)] text-left"
              >
                Remove
              </button>
            )}
            <p className="text-xs text-[var(--muted)]">PNG, JPEG, WebP or SVG. 5MB max. Square works best.</p>
          </div>
        </div>
      </Row>

      <Row label="Theme color">
        <ColorInput value={draft.themeColor ?? ''} onChange={(v) => set('themeColor', v)} placeholder="#e11d48" />
      </Row>
      <Row label="Splash color">
        <ColorInput value={draft.splashColor ?? ''} onChange={(v) => set('splashColor', v)} placeholder="#fff1f2" />
      </Row>
    </Section>
  )
}

function ListingCopySection({ appId, listing, update, getToken }: SectionProps) {
  const { state, draft, set, save } = useSection(appId, listing, update, getToken, [
    'tagline', 'longDescription', 'category',
  ])
  return (
    <Section title="Listing" hint="What the storefront shows on the app's detail page." state={state} onSave={save}>
      <Row label="Category">
        <select
          value={draft.category ?? ''}
          onChange={(e) => set('category', e.target.value || null)}
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
        >
          <option value="">— pick one —</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Row>
      <Row label="Tagline" hint={`Up to 60 chars. ${(draft.tagline ?? '').length}/60`}>
        <input
          type="text"
          maxLength={60}
          value={draft.tagline ?? ''}
          onChange={(e) => set('tagline', e.target.value || null)}
          placeholder="One sentence that sells the app."
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm"
        />
      </Row>
      <Row label="Long description" hint="Markdown supported on the storefront. 5000 chars max.">
        <textarea
          rows={6}
          maxLength={5000}
          value={draft.longDescription ?? ''}
          onChange={(e) => set('longDescription', e.target.value || null)}
          placeholder="Describe your app in detail. What does it do, who is it for, what's special about it?"
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm font-mono"
        />
      </Row>
    </Section>
  )
}

function ScreenshotsSection({ appId, listing, update, getToken }: SectionProps) {
  const { state, draft, set, save } = useSection(appId, listing, update, getToken, ['screenshots'])
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const current = draft.screenshots ?? []

  async function handleFiles(files: FileList) {
    const token = getToken()
    if (!token) return
    setUploading(true)
    try {
      const next = [...current]
      for (const file of Array.from(files)) {
        if (next.length >= 8) break
        const idx = next.length
        const { url } = await uploadAsset(token, appId, `screenshot-${idx as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7}`, file)
        next.push(url)
      }
      set('screenshots', next)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function remove(idx: number) {
    set('screenshots', current.filter((_, i) => i !== idx))
  }
  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir
    if (j < 0 || j >= current.length) return
    const next = [...current]
    ;[next[idx], next[j]] = [next[j]!, next[idx]!]
    set('screenshots', next)
  }

  return (
    <Section title="Screenshots" hint="Up to 8. Drag-equivalent reorder via the arrows; first one is the hero." state={state} onSave={save}>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {current.map((url, idx) => (
          <div key={url} className="relative aspect-[9/16] rounded-lg overflow-hidden border border-[var(--line-strong)] bg-[var(--paper)] group">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs flex items-center justify-between px-2 py-1 opacity-0 group-hover:opacity-100 transition">
              <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="disabled:opacity-30">&larr;</button>
              <span>{idx + 1}</span>
              <button type="button" onClick={() => move(idx, 1)} disabled={idx === current.length - 1} className="disabled:opacity-30">&rarr;</button>
            </div>
            <button type="button"
              onClick={() => remove(idx)}
              className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-6 h-6 text-xs leading-none"
              aria-label="Remove"
            >×</button>
          </div>
        ))}
        {current.length < 8 && (
          <button type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="aspect-[9/16] rounded-lg border-2 border-dashed border-[var(--line-strong)] text-3xl text-[var(--muted)] hover:bg-[var(--panel-hover)] disabled:opacity-50"
          >
            {uploading ? '…' : '+'}
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
    </Section>
  )
}

function DeveloperSection({ appId, listing, update, getToken }: SectionProps) {
  const { state, draft, set, save } = useSection(appId, listing, update, getToken, [
    'websiteUrl', 'supportEmail', 'supportUrl',
  ])
  return (
    <Section title="Developer" hint="How people get in touch when something breaks." state={state} onSave={save}>
      <Row label="Website">
        <input
          type="url"
          value={draft.websiteUrl ?? ''}
          onChange={(e) => set('websiteUrl', e.target.value || null)}
          placeholder="https://your-company.com"
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm"
        />
      </Row>
      <Row label="Support email">
        <input
          type="email"
          value={draft.supportEmail ?? ''}
          onChange={(e) => set('supportEmail', e.target.value || null)}
          placeholder="support@your-company.com"
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm"
        />
      </Row>
      <Row label="Support URL" hint="A help center or contact page. Optional if you've set a support email.">
        <input
          type="url"
          value={draft.supportUrl ?? ''}
          onChange={(e) => set('supportUrl', e.target.value || null)}
          placeholder="https://help.your-company.com"
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm"
        />
      </Row>
    </Section>
  )
}

function SocialSection({ appId, listing, update, getToken }: SectionProps) {
  const { state, draft, set, save } = useSection(appId, listing, update, getToken, [
    'socialTwitter', 'socialGithub', 'socialMastodon', 'socialBluesky',
  ])
  return (
    <Section title="Social" hint="Linked from the storefront listing footer." state={state} onSave={save}>
      <Row label="X / Twitter handle">
        <PrefixedInput
          prefix="@"
          value={draft.socialTwitter ?? ''}
          onChange={(v) => set('socialTwitter', v || null)}
          placeholder="yourhandle"
        />
      </Row>
      <Row label="GitHub handle">
        <PrefixedInput
          prefix="github.com/"
          value={draft.socialGithub ?? ''}
          onChange={(v) => set('socialGithub', v || null)}
          placeholder="yourname"
        />
      </Row>
      <Row label="Mastodon URL">
        <input
          type="url"
          value={draft.socialMastodon ?? ''}
          onChange={(e) => set('socialMastodon', e.target.value || null)}
          placeholder="https://mastodon.social/@you"
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm"
        />
      </Row>
      <Row label="Bluesky handle">
        <PrefixedInput
          prefix="@"
          value={draft.socialBluesky ?? ''}
          onChange={(v) => set('socialBluesky', v || null)}
          placeholder="you.bsky.social"
        />
      </Row>
    </Section>
  )
}

function LegalSection({ appId, listing, update, getToken }: SectionProps) {
  const { state, draft, set, save } = useSection(appId, listing, update, getToken, [
    'privacyPolicyUrl', 'termsUrl',
  ])
  const privacyRef = useRef<HTMLInputElement>(null)
  const termsRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'privacy' | 'terms' | null>(null)
  // Probe results: undefined = not yet probed, true = file responded 200, false = 404/other.
  const [repoProbe, setRepoProbe] = useState<{ privacy?: boolean; terms?: boolean }>({})

  async function uploadMd(kind: 'privacy-policy' | 'terms', file: File) {
    const token = getToken()
    if (!token) return
    setBusy(kind === 'privacy-policy' ? 'privacy' : 'terms')
    try {
      const blob = new Blob([await file.text()], { type: 'text/markdown' })
      const { url } = await uploadAsset(token, appId, kind, blob)
      if (kind === 'privacy-policy') set('privacyPolicyUrl', url)
      else set('termsUrl', url)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  // Set the URL to the app's own subdomain (CF Pages serves web/public/<file>),
  // then HEAD-probe to surface a friendly warning when the file is missing.
  async function useRepoFile(kind: 'privacy' | 'terms') {
    const file = kind === 'privacy' ? 'privacy.md' : 'terms.md'
    const url = `https://${appId}.proappstore.online/${file}`
    if (kind === 'privacy') set('privacyPolicyUrl', url)
    else set('termsUrl', url)
    try {
      const res = await fetch(url, { method: 'HEAD' })
      setRepoProbe((prev) => ({ ...prev, [kind]: res.ok }))
    } catch {
      setRepoProbe((prev) => ({ ...prev, [kind]: false }))
    }
  }

  const PLATFORM_PRIVACY = 'https://proappstore.online/privacy'
  const PLATFORM_TERMS = 'https://proappstore.online/terms'
  const TEMPLATE = 'https://proappstore.online/privacy-template'

  return (
    <Section
      title="Legal"
      hint={
        <>
          The platform's <a href={PLATFORM_PRIVACY} target="_blank" rel="noopener noreferrer" className="underline">privacy policy</a> and <a href={PLATFORM_TERMS} target="_blank" rel="noopener noreferrer" className="underline">terms</a> already cover standard platform behavior (auth, billing, storage, usage analytics, deletion). Link to those if your app doesn't add anything app-specific; otherwise <a href={TEMPLATE} target="_blank" rel="noopener noreferrer" className="underline">copy the template</a> and host or upload your own.
        </>
      }
      state={state}
      onSave={save}
    >
      <Row label="Privacy policy">
        <div className="flex flex-col gap-2">
          <input
            type="url"
            value={draft.privacyPolicyUrl ?? ''}
            onChange={(e) => set('privacyPolicyUrl', e.target.value || null)}
            placeholder="https://your-site.com/privacy"
            className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm"
          />
          <input
            ref={privacyRef}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMd('privacy-policy', f) }}
          />
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
            <button type="button"
              onClick={() => useRepoFile('privacy')}
              className="hover:text-[var(--ink)] underline"
            >
              Use privacy.md from my app
            </button>
            <span>·</span>
            <button type="button"
              onClick={() => set('privacyPolicyUrl', PLATFORM_PRIVACY)}
              className="hover:text-[var(--ink)] underline"
            >
              Use the platform policy
            </button>
            <span>·</span>
            <a href={TEMPLATE} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--ink)] underline">
              Copy the template
            </a>
            <span>·</span>
            <button type="button"
              onClick={() => privacyRef.current?.click()}
              disabled={busy === 'privacy'}
              className="hover:text-[var(--ink)] underline"
            >
              {busy === 'privacy' ? 'Uploading…' : 'Upload privacy.md'}
            </button>
          </div>
          {repoProbe.privacy === false && (
            <p className="text-xs text-[var(--warning)]">
              {`No privacy.md found at https://${appId}.proappstore.online/privacy.md yet. Commit `}
              <code className="font-mono">web/public/privacy.md</code>
              {` to your app repo and push — CF Pages will serve it.`}
            </p>
          )}
          {repoProbe.privacy === true && (
            <p className="text-xs text-[var(--success)]">Looks good — the file responds 200.</p>
          )}
        </div>
      </Row>
      <Row label="Terms of service">
        <div className="flex flex-col gap-2">
          <input
            type="url"
            value={draft.termsUrl ?? ''}
            onChange={(e) => set('termsUrl', e.target.value || null)}
            placeholder="https://your-site.com/terms"
            className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm"
          />
          <input
            ref={termsRef}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMd('terms', f) }}
          />
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
            <button type="button"
              onClick={() => useRepoFile('terms')}
              className="hover:text-[var(--ink)] underline"
            >
              Use terms.md from my app
            </button>
            <span>·</span>
            <button type="button"
              onClick={() => set('termsUrl', PLATFORM_TERMS)}
              className="hover:text-[var(--ink)] underline"
            >
              Use the platform terms
            </button>
            <span>·</span>
            <button type="button"
              onClick={() => termsRef.current?.click()}
              disabled={busy === 'terms'}
              className="hover:text-[var(--ink)] underline"
            >
              {busy === 'terms' ? 'Uploading…' : 'Upload terms.md'}
            </button>
          </div>
          {repoProbe.terms === false && (
            <p className="text-xs text-[var(--warning)]">
              {`No terms.md found at https://${appId}.proappstore.online/terms.md yet. Commit `}
              <code className="font-mono">web/public/terms.md</code>
              {` to your app repo and push.`}
            </p>
          )}
          {repoProbe.terms === true && (
            <p className="text-xs text-[var(--success)]">Looks good — the file responds 200.</p>
          )}
        </div>
      </Row>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Usage — read-only analytics section. Wired to GET /v1/apps/:id/usage?days=30.
// ---------------------------------------------------------------------------

function UsageSection({ appId, getToken }: { appId: string; getToken: () => string | null }) {
  const [data, setData] = useState<UsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const token = getToken()
    if (!token) {
      setLoading(false)
      setError('Not signed in.')
      return
    }
    setLoading(true)
    setError(null)
    fetchAppUsage(token, appId, 30)
      .then((u) => { if (!cancelled) setData(u) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [appId, getToken])

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="display-font text-lg font-bold text-[var(--ink)]">Usage</h3>
        <span className="text-xs text-[var(--muted)]">Last 30 days</span>
      </div>
      <p className="text-sm text-[var(--muted)] mb-4">
        How subscribers are using your app. Updated daily.
      </p>

      {loading && <UsageSkeleton />}

      {!loading && error && (
        <p className="text-sm text-[var(--error)]">Couldn't load usage. {error}</p>
      )}

      {!loading && !error && data && <UsageBody data={data} />}
    </section>
  )
}

function UsageBody({ data }: { data: UsageResponse }) {
  const { series, totals } = data
  const hasAnyActivity =
    totals.users > 0 || totals.sessionSeconds > 0 || totals.apiCalls > 0

  if (!hasAnyActivity) {
    return (
      <p className="text-sm text-[var(--muted)] py-6 text-center">
        No usage data yet. Once your app is being used by subscribers, daily
        activity will appear here.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi label="Active users" value={formatNumber(totals.users)} />
        <Kpi label="Session time" value={formatDuration(totals.sessionSeconds)} />
        <Kpi label="API calls" value={formatNumber(totals.apiCalls)} />
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
            Daily session minutes
          </h4>
        </div>
        <SessionMinutesChart series={series} />
      </div>

      <div>
        <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Last 7 days · active users
        </h4>
        <WeekStrip series={series} />
      </div>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 display-font text-2xl font-bold text-[var(--ink)]">{value}</p>
    </div>
  )
}

function SessionMinutesChart({ series }: { series: UsageResponse['series'] }) {
  // Render bars in a viewBox so they scale to the section's width.
  const { bars, maxMinutes } = useMemo(() => {
    const minutes = series.map((d) => Math.round(d.sessionSeconds / 60))
    const peak = Math.max(1, ...minutes)
    return { bars: minutes, maxMinutes: peak }
  }, [series])

  if (series.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">No daily data in this window.</p>
    )
  }

  // Use a fixed viewBox; bars sit on a baseline at viewBox y = H.
  const W = 600
  const H = 120
  const gap = 2
  const slot = W / series.length
  const barW = Math.max(1, slot - gap)

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Daily session minutes for the last 30 days"
        className="w-full h-32 block"
      >
        {/* Faint baseline */}
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="currentColor" strokeOpacity="0.15" />
        {bars.map((m, i) => {
          const h = (m / maxMinutes) * (H - 4)
          const x = i * slot + gap / 2
          const y = H - h
          const day = series[i]!.day
          return (
            <rect
              key={day}
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={1}
              className="fill-[var(--accent)]"
            >
              <title>{`${day}: ${formatNumber(m)} min · ${formatNumber(series[i]!.users)} users`}</title>
            </rect>
          )
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--muted)] font-mono">
        <span>{series[0]?.day}</span>
        <span>peak {formatNumber(maxMinutes)} min/day</span>
        <span>{series[series.length - 1]?.day}</span>
      </div>
    </div>
  )
}

function WeekStrip({ series }: { series: UsageResponse['series'] }) {
  const last7 = series.slice(-7)
  if (last7.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No recent days.</p>
  }
  return (
    <div className="grid grid-cols-7 gap-2">
      {last7.map((d) => (
        <div
          key={d.day}
          className="rounded-lg border border-[var(--line)] bg-[var(--panel)] py-2 text-center"
          title={`${d.day}: ${formatNumber(d.users)} active users`}
        >
          <div className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide">
            {dayOfWeekLabel(d.day)}
          </div>
          <div className="display-font text-lg font-bold text-[var(--ink)] leading-tight">
            {formatNumber(d.users)}
          </div>
        </div>
      ))}
    </div>
  )
}

function UsageSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="h-3 w-20 rounded bg-[var(--line)]" />
            <div className="mt-2 h-6 w-24 rounded bg-[var(--line)]" />
          </div>
        ))}
      </div>
      <div className="h-32 rounded-xl border border-[var(--line)] bg-[var(--panel)]" />
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg border border-[var(--line)] bg-[var(--panel)]" />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium text-[var(--ink)]">{label}</span>
        {hint && <span className="text-xs text-[var(--muted)]">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

function ColorInput({ value, onChange, placeholder }: { value: string; onChange: (v: string | null) => void; placeholder: string }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 rounded border border-[var(--line-strong)] cursor-pointer bg-transparent"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder={placeholder}
        className="flex-1 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm font-mono"
      />
    </div>
  )
}

function PrefixedInput({
  prefix, value, onChange, placeholder,
}: { prefix: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] overflow-hidden">
      <span className="px-3 py-2 text-sm text-[var(--muted)] bg-[var(--panel)] border-r border-[var(--line-strong)]">{prefix}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/^@/, ''))}
        placeholder={placeholder}
        className="flex-1 px-3 py-2 text-sm bg-transparent focus:outline-none"
      />
    </div>
  )
}

function Preview({ iconUrl, splashColor }: { iconUrl: string | null; splashColor: string | null }) {
  return (
    <div
      className="w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden border border-[var(--line-strong)]"
      style={{ background: splashColor ?? 'var(--panel)' }}
    >
      {iconUrl ? (
        <img src={iconUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-2xl text-[var(--muted)]">?</span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Analytics — visitor stats + BYO tag config. Pulls from the backend's
// `/analytics` (config) and `/analytics/stats` (Workers Analytics Engine
// aggregates) endpoints. Owner-only — relies on the bearer-token auth.
// ---------------------------------------------------------------------------

function AnalyticsSection({ appId, getToken }: { appId: string; getToken: () => string | null }) {
  const [stats, setStats] = useState<AnalyticsStats | null>(null)
  const [config, setConfig] = useState<AnalyticsConfig | null>(null)
  // Active event kind being graphed. 'pageview' is the default; clicking a
  // custom-event row in the panel below swaps it. Switching kind reuses the
  // same stats query + body component — one less thing to maintain.
  const [kind, setKind] = useState<string>('pageview')
  // Active path drill-down. Empty string means "no filter" (aggregate view);
  // clicking a row in the Top pages list sets this to that path. The whole
  // dashboard then re-renders narrowed to that single page.
  const [path, setPath] = useState<string>('')
  const [events, setEvents] = useState<EventKindSummary[]>([])
  const [days, setDays] = useState<1 | 7 | 30 | 90>(7)
  // Server defaults the bucket — `hour` when days=1, `day` otherwise. The
  // response tells us which it used so the chart labels match.
  const [bucket, setBucket] = useState<'hour' | 'day'>('day')
  const [loading, setLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const token = getToken()
    if (!token) return
    setLoading(true)
    setStatsError(null)
    Promise.all([
      fetchAnalyticsStats(token, appId, days, kind, undefined, path || undefined),
      fetchAnalyticsConfig(token, appId),
      fetchAnalyticsEvents(token, appId, days).then((r) => r.events).catch(() => [] as EventKindSummary[]),
    ])
      .then(([statsRes, c, ev]) => {
        if (!cancelled) {
          setStats(statsRes.stats)
          setBucket(statsRes.bucket)
          setConfig(c)
          setEvents(ev)
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setStatsError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [appId, getToken, days, kind, path])

  const isCustomKind = kind !== 'pageview'
  const isPathFiltered = path !== ''

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="display-font text-lg font-bold text-[var(--ink)]">
          {isPathFiltered ? (
            <>
              Path:{' '}
              <span className="font-mono text-base">{path}</span>{' '}
              <button type="button"
                onClick={() => setPath('')}
                className="text-xs font-normal text-[var(--muted)] hover:text-[var(--ink)] underline ml-1"
              >
                ← back to all pages
              </button>
            </>
          ) : isCustomKind ? (
            <>
              Event:{' '}
              <span className="font-mono text-base">{kind}</span>{' '}
              <button type="button"
                onClick={() => setKind('pageview')}
                className="text-xs font-normal text-[var(--muted)] hover:text-[var(--ink)] underline ml-1"
              >
                ← back to pageviews
              </button>
            </>
          ) : (
            'Visitor analytics'
          )}
        </h3>
        <div className="flex gap-1 text-xs">
          {[1, 7, 30, 90].map((d) => (
            <button type="button"
              key={d}
              onClick={() => setDays(d as 1 | 7 | 30 | 90)}
              className={`px-2 py-1 rounded ${days === d ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-[var(--muted)] mb-4">
        {isPathFiltered
          ? `Pageviews on ${path} only. Click "back to all pages" to widen.`
          : isCustomKind
            ? `Custom event tracked from app code via window.pasAnalytics.event("${kind}", ...).`
            : 'First-party page-view stats powered by Workers Analytics Engine. Cookieless, no PII.'}
      </p>

      {loading && <UsageSkeleton />}
      {!loading && statsError && (
        <p className="text-sm text-[var(--error)]">Couldn't load analytics. {statsError}</p>
      )}
      {!loading && !statsError && stats && (
        <AnalyticsBody
          stats={stats}
          days={days}
          kind={kind}
          bucket={bucket}
          appId={appId}
          getToken={getToken}
          activePath={path}
          onPickPath={(p) => setPath(p)}
        />
      )}

      <LiveView appId={appId} getToken={getToken} />

      {!loading && !statsError && !isCustomKind && (
        <div className="mt-6 pt-6 border-t border-[var(--line)]">
          <CustomEventsPanel events={events} days={days} onPickKind={setKind} />
        </div>
      )}

      <div className="mt-6 pt-6 border-t border-[var(--line)]">
        <AnalyticsConfigForm
          appId={appId}
          config={config}
          onSaved={setConfig}
          getToken={getToken}
        />
      </div>
    </section>
  )
}

/**
 * Lists custom event kinds (anything except 'pageview') sorted by count.
 * Empty state explains how to fire one — most creators don't realise the
 * SDK exposes window.pasAnalytics.event() until they're told.
 */
function CustomEventsPanel({
  events,
  days,
  onPickKind,
}: {
  events: EventKindSummary[]
  days: number
  onPickKind: (kind: string) => void
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
        Custom events
      </h4>
      {events.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">
          No custom events fired in the last {days} days. Fire one from your app code:
          <code className="block mt-1 px-2 py-1 bg-[var(--panel)] rounded text-[10px] font-mono">
            window.pasAnalytics.event('purchase', {`{ amount: 999 }`})
          </code>
        </p>
      ) : (
        <ul className="space-y-1">
          {events.map((e) => (
            <li key={e.kind}>
              <button type="button"
                onClick={() => onPickKind(e.kind)}
                className="w-full text-left rounded px-2 py-1.5 hover:bg-[var(--panel)] transition-colors flex items-baseline justify-between"
              >
                <span className="font-mono text-sm text-[var(--ink)]">{e.kind}</span>
                <span className="text-xs text-[var(--muted)] tabular-nums">{formatViewCount(e.count)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AnalyticsBody({
  stats,
  days,
  kind = 'pageview',
  bucket = 'day',
  appId,
  getToken,
  activePath = '',
  onPickPath,
}: {
  stats: AnalyticsStats
  days: number
  kind?: string
  bucket?: 'hour' | 'day'
  appId: string
  getToken: () => string | null
  activePath?: string
  onPickPath?: (path: string) => void
}) {
  const isCustom = kind !== 'pageview'
  const isPathFiltered = activePath !== ''
  const noun = isCustom ? `${kind} events` : 'page views'
  const windowLabel = days === 1 ? 'in the last 24h' : `in the last ${days} days`
  if (stats.total_views === 0) {
    return (
      <DiagnosticsHint
        appId={appId}
        getToken={getToken}
        noun={noun}
        windowLabel={windowLabel}
        isCustom={isCustom}
        kind={kind}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi
          label={`${isCustom ? noun : 'Page views'} (${days === 1 ? '24h' : `${days}d`})`}
          value={formatViewCount(stats.total_views)}
        />
        <Kpi label={isCustom ? 'Unique paths fired on' : 'Unique paths'} value={String(stats.unique_paths)} />
        <Kpi label="Top country" value={stats.top_countries[0]?.country || '—'} />
      </div>

      <DailyViewsChart series={stats.series} bucket={bucket} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Top pages: hidden when we're already filtered to one path (the
            list would just be the active path with itself). Each row is a
            button that drills into that path when there's an onPickPath
            handler — turns the dashboard from "look at numbers" into
            "click into the hot page to see its referrers + chart." */}
        {!isPathFiltered && (
          <RankedList
            title={isCustom ? 'Top pages firing event' : 'Top pages'}
            rows={stats.top_paths.map((r) => ({ label: r.path || '/', value: r.views }))}
            onPick={!isCustom && onPickPath ? (label) => onPickPath(label) : undefined}
          />
        )}
        <RankedList title="Top referrers" rows={stats.top_referrers.map((r) => ({ label: r.referrer || '(direct)', value: r.views }))} />
        <RankedList title="Top countries" rows={stats.top_countries.map((r) => ({ label: r.country || '—', value: r.views }))} />
        <RankedList title="Device" rows={stats.device_split.map((r) => ({ label: r.device, value: r.views }))} />
      </div>
    </div>
  )
}

/**
 * Live view: polls /v1/apps/:id/analytics/live every 30s and shows a
 * pulsing "X right now" counter + the hottest paths in the last 5 minutes.
 * Renders nothing while loading the first response so we don't flash 0 →
 * real-count on every navigation.
 */
/**
 * Smart empty-state. When `total_views == 0`, we fetch /analytics/diagnostics
 * and render a hint based on the *worst still-actionable* cause. The default
 * "no data yet :)" is a UX dead-end; this turns the empty state into a
 * checklist that tells the creator exactly what to do next.
 *
 * Three rendered shapes, by verdict:
 *   - no_dataset_binding | no_stats_query: platform-side config missing.
 *     Render the deploy checklist; the creator can't fix this, but at least
 *     they know it isn't their app's fault.
 *   - never_seen_event: dataset is bound + queryable, but no event has ever
 *     been written for this app. Most likely the loader script isn't in the
 *     app's HTML. Render the loader URL + a "paste this into <head>" snippet.
 *   - silent_24h: events have been written before but nothing in 24h. App
 *     might be deployed but offline / domain misconfigured / 100% bot
 *     traffic getting dropped server-side.
 *
 * If the diagnostics endpoint itself errors (eg 503 because dataset binding
 * isn't there yet), fall back to the simple "no data yet" message.
 */
function DiagnosticsHint({
  appId,
  getToken,
  noun,
  windowLabel,
  isCustom,
  kind,
}: {
  appId: string
  getToken: () => string | null
  noun: string
  windowLabel: string
  isCustom: boolean
  kind: string
}) {
  const [diag, setDiag] = useState<DiagnosticsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const token = getToken()
    if (!token) return
    fetchAnalyticsDiagnostics(token, appId)
      .then((r) => { if (!cancelled) setDiag(r) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [appId, getToken])

  // Diagnostics still loading or unavailable — render the simple message.
  if (!diag) {
    return (
      <div className="py-6 text-center space-y-2">
        <p className="text-sm text-[var(--muted)]">
          No {noun} {windowLabel}.{' '}
          {isCustom
            ? `Once your app calls window.pasAnalytics.event("${kind}", ...) and a visitor triggers it, the counts will appear here.`
            : 'Once visitors land on your app, the chart will fill in.'}
        </p>
        {error && (
          <p className="text-xs text-[var(--muted)]">
            (Diagnostics unavailable — usually means the analytics dataset isn't wired in the backend yet.)
          </p>
        )}
      </div>
    )
  }

  if (diag.verdict === 'ok') {
    // Verdict says ok but total_views is 0 — happens when we're viewing a
    // custom-event kind that nobody's fired. Just say so.
    return (
      <p className="text-sm text-[var(--muted)] py-6 text-center">
        No {noun} {windowLabel}.{' '}
        {isCustom
          ? `Once your app calls window.pasAnalytics.event("${kind}", ...) and a visitor triggers it, the counts will appear here.`
          : 'Once visitors land on your app, the chart will fill in.'}
      </p>
    )
  }

  return (
    <div className="py-4 space-y-3">
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <h4 className="text-sm font-semibold text-[var(--ink)] mb-2">
          No {noun} {windowLabel}. Here's why:
        </h4>
        <DiagnosticsBody diag={diag} />
      </div>
    </div>
  )
}

function DiagnosticsBody({ diag }: { diag: DiagnosticsResponse }) {
  const Step = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <li className="flex items-start gap-2 text-sm">
      <span
        aria-label={ok ? 'pass' : 'fail'}
        className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          ok ? 'bg-[var(--success)]/15 text-[var(--success)]' : 'bg-[var(--error)]/15 text-[var(--error)]'
        }`}
      >
        {ok ? '✓' : '✕'}
      </span>
      <span className="text-[var(--ink)]">{children}</span>
    </li>
  )

  if (diag.verdict === 'no_dataset_binding') {
    return (
      <div className="space-y-2">
        <ul className="space-y-1.5">
          <Step ok={diag.checks.dataset_bound}>
            Workers Analytics Engine dataset bound on the backend Worker.
          </Step>
          <Step ok={diag.checks.stats_queryable}>
            CF Analytics SQL API credentials present.
          </Step>
        </ul>
        <p className="text-xs text-[var(--muted)] pt-1">
          Platform-side config — the dashboard can't show numbers until the
          dataset binding is added to <code className="font-mono">wrangler.toml</code>.
          See <code className="font-mono">ANALYTICS-GO-LIVE.md</code> step 3.
        </p>
      </div>
    )
  }

  if (diag.verdict === 'no_stats_query') {
    return (
      <div className="space-y-2">
        <ul className="space-y-1.5">
          <Step ok={true}>Workers Analytics Engine dataset bound.</Step>
          <Step ok={false}>
            CF Analytics SQL API credentials missing — set <code className="font-mono">CF_ACCOUNT_ID</code> + <code className="font-mono">CF_ANALYTICS_API_TOKEN</code> as worker secrets.
          </Step>
        </ul>
      </div>
    )
  }

  if (diag.verdict === 'never_seen_event') {
    return (
      <div className="space-y-3">
        <ul className="space-y-1.5">
          <Step ok={true}>Backend wired (dataset bound + queryable).</Step>
          <Step ok={false}>
            No event has ever been recorded for this app — the loader script is probably missing from your HTML.
          </Step>
        </ul>
        <p className="text-xs text-[var(--muted)]">Paste this into <code className="font-mono">web/index.html</code> &lt;head&gt;:</p>
        <pre className="text-xs font-mono bg-[var(--panel)] p-2 rounded overflow-x-auto">
{`<script src="${diag.loader_url}" defer></script>`}
        </pre>
      </div>
    )
  }

  if (diag.verdict === 'silent_24h') {
    return (
      <div className="space-y-2">
        <ul className="space-y-1.5">
          <Step ok={true}>Loader has fired before (events recorded historically).</Step>
          <Step ok={false}>No events in the last 24 hours.</Step>
        </ul>
        <p className="text-xs text-[var(--muted)]">
          Either the app has no traffic right now, or the loader broke. Open
          your app and check the browser console; or hit the loader URL directly:{' '}
          <a className="font-mono underline" href={diag.loader_url} target="_blank" rel="noreferrer">
            {diag.loader_url}
          </a>
        </p>
      </div>
    )
  }

  return null
}

function LiveView({ appId, getToken }: { appId: string; getToken: () => string | null }) {
  const [data, setData] = useState<LiveResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const tick = () => {
      const token = getToken()
      if (!token) return
      fetchAnalyticsLive(token, appId)
        .then((r) => {
          if (!cancelled) {
            setData(r)
            setError(null)
          }
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message)
        })
    }
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [appId, getToken])

  if (error && !data) return null // silent if live endpoint isn't deployed yet
  if (!data) return null

  return (
    <div className="mt-5 flex items-center gap-3 rounded-xl bg-[var(--panel)] border border-[var(--line)] px-4 py-2">
      <span className="relative inline-flex h-2.5 w-2.5">
        <span
          className={`absolute inline-flex h-full w-full rounded-full bg-[var(--success)] ${data.views > 0 ? 'animate-ping opacity-60' : 'opacity-30'}`}
        />
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${data.views > 0 ? 'bg-[var(--success)]' : 'bg-[var(--muted)]'}`}
        />
      </span>
      <div className="text-sm">
        <span className="font-bold text-[var(--ink)] tabular-nums">{formatViewCount(data.views)}</span>{' '}
        <span className="text-[var(--muted)]">page view{data.views === 1 ? '' : 's'} in the last 5 min</span>
        {data.top_paths.length > 0 && (
          <>
            {' · hot now: '}
            {data.top_paths.slice(0, 3).map((p, i) => (
              <span key={p.path}>
                {i > 0 && ', '}
                <span className="font-mono text-xs">{p.path || '/'}</span>
                <span className="text-[var(--muted)] text-xs">{` (${p.views})`}</span>
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function DailyViewsChart({
  series,
  bucket,
}: {
  series: AnalyticsStats['series']
  bucket: 'hour' | 'day'
}) {
  const { bars, maxViews } = useMemo(() => {
    const vs = series.map((d) => d.views)
    return { bars: vs, maxViews: Math.max(1, ...vs) }
  }, [series])

  if (series.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        No {bucket === 'hour' ? 'hourly' : 'daily'} data in this window.
      </p>
    )
  }

  // For hour buckets the `t` looks like "2026-05-21 14:00:00"; show just
  // "14:00". For day buckets it's "2026-05-21"; show "05-21".
  const labelFor = (t: string): string => {
    if (bucket === 'hour') return t.slice(11, 16) || t
    return t.slice(5, 10) || t
  }

  const W = 600
  const H = 120
  const gap = 2
  const slot = W / series.length
  const barW = Math.max(1, slot - gap)

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${bucket === 'hour' ? 'Hourly' : 'Daily'} page views (${series.length} ${bucket}s)`}
        className="w-full h-32 block"
      >
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="currentColor" strokeOpacity="0.15" />
        {bars.map((v, i) => {
          const h = (v / maxViews) * (H - 2)
          return (
            <rect
              key={i}
              x={i * slot}
              y={H - h}
              width={barW}
              height={h}
              fill="var(--accent)"
              opacity={v > 0 ? 0.85 : 0.2}
            >
              <title>{`${series[i].t}: ${v} view${v === 1 ? '' : 's'}`}</title>
            </rect>
          )
        })}
      </svg>
      <div className="flex justify-between mt-1 text-[10px] text-[var(--muted)]">
        <span>{labelFor(series[0]?.t ?? '')}</span>
        <span>peak {maxViews}</span>
        <span>{labelFor(series[series.length - 1]?.t ?? '')}</span>
      </div>
    </div>
  )
}

function RankedList({
  title,
  rows,
  onPick,
}: {
  title: string
  rows: Array<{ label: string; value: number }>
  /** When provided, each row becomes a button that calls onPick(label).
   *  Used by the Top pages list to drill into a specific path. */
  onPick?: (label: string) => void
}) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  const renderRow = (r: { label: string; value: number }, i: number) => {
    const inner = (
      <>
        <div className="flex justify-between mb-0.5">
          <span className="text-[var(--ink)] truncate">{r.label}</span>
          <span className="text-[var(--muted)] tabular-nums">{formatViewCount(r.value)}</span>
        </div>
        <div className="h-1 bg-[var(--line)] rounded overflow-hidden">
          <div className="h-1 bg-[var(--accent)]" style={{ width: `${(r.value / max) * 100}%` }} />
        </div>
      </>
    )
    return (
      <li key={i} className="text-xs">
        {onPick ? (
          <button type="button"
            onClick={() => onPick(r.label)}
            className="w-full text-left rounded px-1.5 py-1 -mx-1.5 hover:bg-[var(--panel)] transition-colors"
            title={`Drill into ${r.label}`}
          >
            {inner}
          </button>
        ) : (
          inner
        )}
      </li>
    )
  }
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
        {title}
      </h4>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">No data.</p>
      ) : (
        <ul className="space-y-1">{rows.slice(0, 5).map(renderRow)}</ul>
      )}
    </div>
  )
}

function AnalyticsConfigForm({
  appId,
  config,
  onSaved,
  getToken,
}: {
  appId: string
  config: AnalyticsConfig | null
  onSaved: (c: AnalyticsConfig) => void
  getToken: () => string | null
}) {
  const [ga4, setGa4] = useState(config?.ga4 ?? '')
  const [plausible, setPlausible] = useState(config?.plausible ?? '')
  const [customHead, setCustomHead] = useState(config?.customHead ?? '')
  const [state, setState] = useState<SaveState>('idle')

  useEffect(() => {
    setGa4(config?.ga4 ?? '')
    setPlausible(config?.plausible ?? '')
    setCustomHead(config?.customHead ?? '')
  }, [config])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = getToken()
    if (!token) return
    setState('saving')
    try {
      const fresh = await updateAnalyticsConfig(token, appId, {
        ga4: ga4.trim() || null,
        plausible: plausible.trim() || null,
        custom_head: customHead.trim() || null,
      })
      onSaved(fresh)
      setState('saved')
      setTimeout(() => setState('idle'), 2000)
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : 'failed' })
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
        Add your own tags (optional)
      </h4>
      <p className="text-xs text-[var(--muted)]">
        Wire Google Analytics, Plausible, or a custom &lt;head&gt; snippet on top of the
        cookieless first-party tracking already in place. The platform CF Web Analytics token
        {config?.cfBeaconToken ? ' is active' : ' will be auto-provisioned at next publish'}.
      </p>
      <label className="block">
        <span className="text-xs text-[var(--muted)]">Google Analytics 4 ID</span>
        <input
          type="text"
          placeholder="G-XXXXXXXXXX"
          value={ga4}
          onChange={(e) => setGa4(e.target.value)}
          className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] placeholder-[var(--muted)]"
        />
      </label>
      <label className="block">
        <span className="text-xs text-[var(--muted)]">Plausible domain</span>
        <input
          type="text"
          placeholder="mysite.com"
          value={plausible}
          onChange={(e) => setPlausible(e.target.value)}
          className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] placeholder-[var(--muted)]"
        />
      </label>
      <label className="block">
        <span className="text-xs text-[var(--muted)]">Custom &lt;head&gt; snippet (max 4 KB)</span>
        <textarea
          rows={3}
          placeholder='<meta name="custom" content="..." />'
          value={customHead}
          onChange={(e) => setCustomHead(e.target.value)}
          className="mt-1 w-full px-3 py-2 font-mono text-xs rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] placeholder-[var(--muted)]"
        />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit"
          disabled={state === 'saving'}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--accent)] text-[var(--paper)] disabled:opacity-50"
        >
          {state === 'saving' ? 'Saving…' : 'Save analytics tags'}
        </button>
        {state === 'saved' && <span className="text-xs text-[var(--success)]">Saved.</span>}
        {typeof state === 'object' && state.error && (
          <span className="text-xs text-[var(--error)]">{state.error}</span>
        )}
      </div>
    </form>
  )
}

function StorefrontTile({
  listing, appName, subdomain,
}: { listing: Listing; appName: string; subdomain: string }) {
  return (
    <div
      className="rounded-2xl border border-[var(--line)] p-4 shadow-sm overflow-hidden"
      style={{ background: listing.splashColor ?? 'var(--panel)' }}
    >
      <div className="flex items-center gap-3 mb-3">
        <Preview iconUrl={listing.iconUrl} splashColor={null} />
        <div className="min-w-0">
          <p className="font-semibold text-[var(--ink)] truncate">{appName}</p>
          <p className="text-xs text-[var(--muted)] truncate">{subdomain}</p>
        </div>
      </div>
      {listing.tagline && <p className="text-sm text-[var(--ink)] line-clamp-2 mb-2">{listing.tagline}</p>}
      {listing.category && (
        <span className="inline-block text-[10px] font-bold uppercase tracking-wide bg-[var(--ink)] text-[var(--paper)] rounded px-1.5 py-0.5">
          {listing.category}
        </span>
      )}
    </div>
  )
}

// ─── Custom domains ─────────────────────────────────────────────────────────
//
// Owner-facing UI for BYO custom domains. Wraps the same /v1/apps/:id/domains
// endpoints the `pas domain` CLI hits. No background polling — Verify is an
// explicit user action, matching the owner-pays-for-refresh model.
// Buying a domain isn't supported yet; see docs/custom-domain-purchase-plan.md.

function DomainsSection({
  appId,
  getToken,
}: {
  appId: string
  getToken: () => string | null
}) {
  const [domains, setDomains] = useState<Domain[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [attachState, setAttachState] = useState<'idle' | 'attaching' | { error: string }>('idle')

  const reload = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const { domains } = await listDomains(token, appId)
      setDomains(domains)
      setLoadError(null)
    } catch (e) {
      setLoadError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [appId, getToken])

  useEffect(() => {
    setLoading(true)
    reload()
  }, [reload])

  const onAttach = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = getToken()
    if (!token) return
    const trimmed = input.trim().toLowerCase()
    if (!trimmed) return
    setAttachState('attaching')
    try {
      await attachDomain(token, appId, trimmed)
      setInput('')
      setAttachState('idle')
      await reload()
    } catch (err) {
      setAttachState({ error: (err as Error).message })
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <h3 className="display-font text-lg font-bold text-[var(--ink)] mb-1">Custom domains</h3>
      <p className="text-sm text-[var(--muted)] mb-4">
        Bring a domain you already own. Cloudflare provisions the SSL cert automatically
        once your DNS points to the project. We don't sell domains — use Cloudflare
        Registrar, Porkbun, or Namecheap.
      </p>

      {loading && <p className="text-sm text-[var(--muted)]">Loading…</p>}

      {!loading && loadError && (
        <p className="text-sm text-[var(--error)]">Couldn't load domains. {loadError}</p>
      )}

      {!loading && !loadError && domains && domains.length === 0 && (
        <p className="text-sm text-[var(--muted)] italic mb-4">No custom domains attached yet.</p>
      )}

      {!loading && !loadError && domains && domains.length > 0 && (
        <ul className="space-y-3 mb-6">
          {domains.map((d) => (
            <DomainRow
              key={d.domain}
              appId={appId}
              d={d}
              getToken={getToken}
              onChange={reload}
            />
          ))}
        </ul>
      )}

      <form onSubmit={onAttach} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="app.yourdomain.com"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={attachState === 'attaching'}
          className="flex-1 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm font-mono text-[var(--ink)] placeholder:text-[var(--muted)]/60 focus:outline-none focus:border-[var(--ink)] disabled:opacity-50"
        />
        <button type="submit"
          disabled={!input.trim() || attachState === 'attaching'}
          className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-[var(--paper)] hover:opacity-90 disabled:opacity-50"
        >
          {attachState === 'attaching' ? 'Attaching…' : 'Attach'}
        </button>
      </form>
      {typeof attachState === 'object' && (
        <p className="mt-2 text-sm text-[var(--error)]">{attachState.error}</p>
      )}
    </section>
  )
}

function DomainRow({
  appId,
  d,
  getToken,
  onChange,
}: {
  appId: string
  d: Domain
  getToken: () => string | null
  onChange: () => Promise<void>
}) {
  const [verifyState, setVerifyState] = useState<'idle' | 'verifying' | { error: string }>('idle')
  const [removeState, setRemoveState] = useState<'idle' | 'confirm' | 'removing' | { error: string }>('idle')

  const onVerify = async () => {
    const token = getToken()
    if (!token) return
    setVerifyState('verifying')
    try {
      await verifyDomain(token, appId, d.domain)
      setVerifyState('idle')
      await onChange()
    } catch (err) {
      setVerifyState({ error: (err as Error).message })
    }
  }

  const onRemove = async () => {
    const token = getToken()
    if (!token) return
    setRemoveState('removing')
    try {
      await removeDomain(token, appId, d.domain)
      await onChange()
      // Component unmounts on successful remove via parent reload.
    } catch (err) {
      setRemoveState({ error: (err as Error).message })
    }
  }

  const badgeColor =
    d.status === 'active'
      ? 'bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]/30'
      : d.status === 'pending'
        ? 'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/30'
        : 'bg-[var(--error)]/15 text-[var(--error)] border-[var(--error)]/30'

  return (
    <li className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-[var(--ink)] truncate">{d.domain}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 border ${badgeColor}`}>
              {d.status === 'pending' ? 'pending DNS' : d.status}
            </span>
            {d.cfStatus && d.cfStatus !== d.status && (
              <span className="text-[10px] text-[var(--muted)] font-mono">CF: {d.cfStatus}</span>
            )}
          </div>
          {d.status === 'active' ? (
            <p className="text-xs text-[var(--muted)] mt-1">
              Verified {new Date(d.verifiedAt ?? d.addedAt).toLocaleString()} ·{' '}
              <a href={`https://${d.domain}`} target="_blank" rel="noreferrer" className="underline">
                open
              </a>
            </p>
          ) : (
            <p className="text-xs text-[var(--muted)] mt-1">
              Status as of {new Date(d.addedAt).toLocaleString()} — click Verify after adding DNS to refresh.
            </p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {d.status !== 'active' && (
            <button type="button"
              onClick={onVerify}
              disabled={verifyState === 'verifying'}
              className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--ink)]/5 disabled:opacity-50"
            >
              {verifyState === 'verifying' ? 'Checking…' : 'Verify'}
            </button>
          )}
          <button type="button"
            onClick={() => setRemoveState('confirm')}
            disabled={removeState === 'confirm' || removeState === 'removing'}
            className="rounded-lg border border-[var(--error)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--error)] hover:bg-[var(--error)]/10 disabled:opacity-50"
          >
            {removeState === 'removing' ? 'Detaching…' : 'Detach'}
          </button>
        </div>
      </div>

      {typeof verifyState === 'object' && (
        <p className="mt-2 text-xs text-[var(--error)]">{verifyState.error}</p>
      )}

      {removeState === 'confirm' && (
        <div className="mt-3 pt-3 border-t border-[var(--error)]/30 space-y-2">
          <p className="text-xs text-[var(--ink)]">
            Detach <span className="font-mono font-semibold">{d.domain}</span>?
            Cloudflare will stop serving the app at this hostname.
          </p>
          <p className="text-xs text-[var(--muted)]">
            <strong className="text-[var(--ink)]">Also remove the CNAME at your registrar</strong>{' '}
            ({d.domain} → {cnameTarget(appId)}) so the domain isn't left pointing at our infra.
            That DNS lives on your account — we can't touch it.
          </p>
          <div className="flex gap-2 pt-1">
            <button type="button"
              onClick={onRemove}
              disabled={removeState !== 'confirm'}
              className="rounded-lg bg-[var(--error)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Yes, detach
            </button>
            <button type="button"
              onClick={() => setRemoveState('idle')}
              className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {typeof removeState === 'object' && (
        <p className="mt-2 text-xs text-[var(--error)]">{removeState.error}</p>
      )}

      {d.status !== 'active' && <DomainDnsHint appId={appId} d={d} />}
    </li>
  )
}

function DomainDnsHint({ appId, d }: { appId: string; d: Domain }) {
  const target = cnameTarget(appId)
  const validation = d.validationData
  const errMsg = d.verificationData?.error_message || validation?.error_message
  return (
    <div className="mt-3 pt-3 border-t border-[var(--line)] space-y-3">
      <div>
        <p className="text-xs font-semibold text-[var(--ink)] mb-1">Add this DNS record at your registrar:</p>
        <div className="rounded-lg bg-[var(--ink)]/5 p-3 text-xs font-mono space-y-1">
          <div><span className="text-[var(--muted)]">Type:</span>  CNAME</div>
          <div><span className="text-[var(--muted)]">Name:</span>  {d.domain}</div>
          <div className="break-all"><span className="text-[var(--muted)]">Value:</span> {target}</div>
        </div>
        <p className="text-[11px] text-[var(--muted)] mt-1.5 italic">
          Apex domains (e.g. example.com without a subdomain) can't use a raw CNAME — use
          ALIAS / ANAME if your registrar supports it, or A/AAAA records pointing to Cloudflare.
        </p>
      </div>

      {validation?.method === 'txt' && validation.txt_name && validation.txt_value && (
        <div>
          <p className="text-xs font-semibold text-[var(--ink)] mb-1">Plus this TXT record for SSL validation:</p>
          <div className="rounded-lg bg-[var(--ink)]/5 p-3 text-xs font-mono space-y-1">
            <div><span className="text-[var(--muted)]">Type:</span>  TXT</div>
            <div className="break-all"><span className="text-[var(--muted)]">Name:</span>  {validation.txt_name}</div>
            <div className="break-all"><span className="text-[var(--muted)]">Value:</span> {validation.txt_value}</div>
          </div>
        </div>
      )}

      {errMsg && (
        <p className="text-xs text-[var(--error)]"><strong>Last check:</strong> {errMsg}</p>
      )}
    </div>
  )
}
