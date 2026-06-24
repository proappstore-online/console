/**
 * Shared primitives for the AppDetail editor sections — the Section frame,
 * the useSection draft/save hook, small form controls, and storefront preview
 * bits. Extracted from AppDetailSections.tsx.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { patchListing, type Listing } from './listings'

export type SaveState = 'idle' | 'saving' | 'saved' | { error: string }

export interface SectionProps {
  appId: string
  listing: Listing
  update: (next: Listing) => void
  getToken: () => string | null
}

export function Section({
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

export function useSection<K extends keyof Listing>(
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

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

export function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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

export function ColorInput({ value, onChange, placeholder }: { value: string; onChange: (v: string | null) => void; placeholder: string }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${placeholder} (color picker)`}
        className="h-9 w-12 rounded border border-[var(--line-strong)] cursor-pointer bg-transparent"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm font-mono"
      />
    </div>
  )
}

export function PrefixedInput({
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
        aria-label={`${prefix}${placeholder}`}
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
