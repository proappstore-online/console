/**
 * AppDetail listing-editor sections — branding, listing copy, screenshots,
 * developer, social, and legal editors. Extracted from AppDetailSections.tsx.
 */

import { useState, useRef } from 'react'
import { uploadAsset, CATEGORIES } from './listings'
import {
  Section,
  useSection,
  Row,
  ColorInput,
  PrefixedInput,
  Preview,
  type SectionProps,
} from './sectionPrimitives'

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
  async function applyRepoFile(kind: 'privacy' | 'terms') {
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
              onClick={() => applyRepoFile('privacy')}
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
              onClick={() => applyRepoFile('terms')}
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
