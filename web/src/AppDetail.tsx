import { useState, useEffect, useCallback, useRef } from 'react'
import {
  fetchListing,
  patchListing,
  uploadAsset,
  CATEGORIES,
  type Listing,
} from './listings'

interface Props {
  appId: string
  appName: string | null
  getToken: () => string | null
  onBack: () => void
  onDelete: () => Promise<void>
}

type SaveState = 'idle' | 'saving' | 'saved' | { error: string }

export function AppDetail({ appId, appName, getToken, onBack, onDelete }: Props) {
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  if (loading) {
    return <p className="text-[var(--muted)] py-12 text-center">Loading listing…</p>
  }
  if (loadError || !listing) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="text-sm font-medium text-[var(--accent)] hover:underline">
          &larr; Back
        </button>
        <p className="text-[var(--error)]">{loadError ?? 'No listing data.'}</p>
      </div>
    )
  }

  const subdomain = `${appId}.proappstore.online`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm font-medium text-[var(--accent)] hover:underline">
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
        <Preview iconUrl={listing.iconUrl} splashColor={listing.splashColor} />
        <div>
          <h2 className="display-font text-3xl font-bold text-[var(--ink)]">{appName ?? appId}</h2>
          <p className="text-sm text-[var(--muted)] font-mono">{appId}</p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <BrandingSection appId={appId} listing={listing} update={update} getToken={getToken} />
          <ListingCopySection appId={appId} listing={listing} update={update} getToken={getToken} />
          <ScreenshotsSection appId={appId} listing={listing} update={update} getToken={getToken} />
          <DeveloperSection appId={appId} listing={listing} update={update} getToken={getToken} />
          <SocialSection appId={appId} listing={listing} update={update} getToken={getToken} />
          <LegalSection appId={appId} listing={listing} update={update} getToken={getToken} />

          <div className="rounded-2xl border border-[var(--error)]/30 bg-[var(--glass-strong)] p-6">
            <h3 className="text-sm font-semibold text-[var(--error)] uppercase tracking-wide mb-3">Danger Zone</h3>
            {!showDeleteConfirm ? (
              <button
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
                  <button
                    onClick={async () => { setDeleting(true); try { await onDelete() } finally { setDeleting(false) } }}
                    disabled={deleting}
                    className="rounded-lg bg-[var(--error)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {deleting ? 'Removing…' : 'Yes, remove'}
                  </button>
                  <button
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
  hint?: string
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
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--glass-strong)] p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="display-font text-lg font-bold text-[var(--ink)]">{title}</h3>
        {stateLabel && <span className={`text-xs ${stateColor}`}>{stateLabel}</span>}
      </div>
      {hint && <p className="text-sm text-[var(--muted)] mb-4">{hint}</p>}
      <div className="space-y-4">{children}</div>
      <div className="mt-5 flex justify-end">
        <button
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
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-lg border border-[var(--line-strong)] bg-[var(--glass)] px-3 py-1.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--glass-hover)] disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : draft.iconUrl ? 'Replace icon' : 'Upload icon'}
            </button>
            {draft.iconUrl && (
              <button
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
              <button onClick={() => move(idx, -1)} disabled={idx === 0} className="disabled:opacity-30">&larr;</button>
              <span>{idx + 1}</span>
              <button onClick={() => move(idx, 1)} disabled={idx === current.length - 1} className="disabled:opacity-30">&rarr;</button>
            </div>
            <button
              onClick={() => remove(idx)}
              className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-6 h-6 text-xs leading-none"
              aria-label="Remove"
            >×</button>
          </div>
        ))}
        {current.length < 8 && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="aspect-[9/16] rounded-lg border-2 border-dashed border-[var(--line-strong)] text-3xl text-[var(--muted)] hover:bg-[var(--glass-hover)] disabled:opacity-50"
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

  return (
    <Section title="Legal" hint="Public policies. Paste a URL or upload a markdown file." state={state} onSave={save}>
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
          <button
            onClick={() => privacyRef.current?.click()}
            disabled={busy === 'privacy'}
            className="self-start text-xs text-[var(--muted)] hover:text-[var(--ink)] underline"
          >
            {busy === 'privacy' ? 'Uploading…' : 'or upload privacy.md'}
          </button>
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
          <button
            onClick={() => termsRef.current?.click()}
            disabled={busy === 'terms'}
            className="self-start text-xs text-[var(--muted)] hover:text-[var(--ink)] underline"
          >
            {busy === 'terms' ? 'Uploading…' : 'or upload terms.md'}
          </button>
        </div>
      </Row>
    </Section>
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
      <span className="px-3 py-2 text-sm text-[var(--muted)] bg-[var(--glass)] border-r border-[var(--line-strong)]">{prefix}</span>
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
      style={{ background: splashColor ?? 'var(--glass)' }}
    >
      {iconUrl ? (
        <img src={iconUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-2xl text-[var(--muted)]">?</span>
      )}
    </div>
  )
}

function StorefrontTile({
  listing, appName, subdomain,
}: { listing: Listing; appName: string; subdomain: string }) {
  return (
    <div
      className="rounded-2xl border border-[var(--line)] p-4 shadow-sm overflow-hidden"
      style={{ background: listing.splashColor ?? 'var(--glass-strong)' }}
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
