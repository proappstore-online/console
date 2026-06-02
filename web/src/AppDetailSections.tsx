/**
 * AppDetail section components — branding/listing/screenshots/developer/social/
 * legal editors, usage + analytics + domains panels, and shared primitives.
 * Extracted from AppDetail.tsx so the orchestrator stays lean.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
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

// Analytics + Domains sections now live in their own files; re-export them so
// AppDetail's import surface is unchanged.
export { AnalyticsSection } from './AnalyticsSection'
export { DomainsSection } from './DomainsSection'

export type SaveState = 'idle' | 'saving' | 'saved' | { error: string }

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

export function BrandingSection({ appId, listing, update, getToken }: SectionProps) {
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

export function ListingCopySection({ appId, listing, update, getToken }: SectionProps) {
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

export function ScreenshotsSection({ appId, listing, update, getToken }: SectionProps) {
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

export function DeveloperSection({ appId, listing, update, getToken }: SectionProps) {
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

export function SocialSection({ appId, listing, update, getToken }: SectionProps) {
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

export function LegalSection({ appId, listing, update, getToken }: SectionProps) {
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

export function UsageSection({ appId, getToken }: { appId: string; getToken: () => string | null }) {
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

export function Kpi({ label, value }: { label: string; value: string }) {
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

export function UsageSkeleton() {
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

export function Preview({ iconUrl, splashColor }: { iconUrl: string | null; splashColor: string | null }) {
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


export function StorefrontTile({
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

