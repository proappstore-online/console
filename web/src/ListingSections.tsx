/**
 * AppDetail listing-editor sections — branding, listing copy, screenshots,
 * developer, social, and legal editors. Extracted from AppDetailSections.tsx.
 */

import { useState, useRef } from 'react'
import { uploadAsset, CATEGORIES } from './listings'
import { api } from './agents/lib'
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
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  const generateWithAI = async () => {
    const token = getToken()
    if (!token) return
    setGenerating(true)
    setGenError(null)
    try {
      const r = await api(`/projects/${appId}/generate-listing`, token, { method: 'POST', body: {} }) as { listing?: { tagline?: string; longDescription?: string; category?: string }; error?: string }
      if (r.error) { setGenError(r.error); return }
      if (r.listing?.tagline) set('tagline', r.listing.tagline)
      if (r.listing?.longDescription) set('longDescription', r.listing.longDescription)
      if (r.listing?.category) set('category', r.listing.category)
    } catch (e) {
      setGenError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Section title="Listing" hint="What the storefront shows on the app's detail page." state={state} onSave={save}>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={generateWithAI} disabled={generating}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50 transition-colors"
          title="Generate tagline, description, and category from your app's source code using AI (uses your Anthropic API key)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          {generating ? 'Generating…' : 'Generate with AI'}
        </button>
        {genError && <span className="text-xs text-[var(--error)]">{genError}</span>}
      </div>
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
