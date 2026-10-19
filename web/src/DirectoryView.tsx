// App directory (platform#424): find any app you can reach — or learn that an id
// is free, the platform's, or someone else's — by id, name, live URL, store page,
// repository URL or custom domain, filtered by lifecycle and access.

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ApiError } from './api'
import { hashFor } from './nav'
import {
  fetchDirectory, requestRecovery, LIFECYCLES, ACCESS_FILTERS,
  type AccessFilter, type DirectoryItem, type DirectoryResult, type Lifecycle,
} from './directoryApi'

interface Props {
  getToken: () => string | null
  /** Debounce for the search box, in ms. */
  debounceMs?: number
}

export const LIFECYCLE_LABELS: Record<Lifecycle, string> = {
  draft: 'Draft', provisioned: 'Provisioned', deployed: 'Deployed', live: 'Live',
  failed: 'Failed', unpublished: 'Unpublished', archived: 'Archived',
}
export const ACCESS_LABELS: Record<AccessFilter, string> = {
  mine: 'Owned by me', team: 'Team member', operator: 'Operator', transfer: 'Pending transfer', inaccessible: 'Not mine',
}
const ACCESS_LEVEL_LABELS: Record<DirectoryItem['accessLevel'], string> = {
  owner: 'Owner', team: 'Team', operator: 'Operator', transfer_recipient: 'Offered to you', inaccessible: 'Not yours',
}
const DEPLOY_LABELS: Record<NonNullable<DirectoryItem['deployStatus']>, string> = {
  not_provisioned: 'Not provisioned', provisioning: 'Provisioning…', provision_failed: 'Provisioning failed',
  deployed: 'Deployed', not_deployed: 'Not deployed yet',
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has expired. Sign in again to search your apps.'
    if (error.status === 400) return `That search was not accepted: ${error.message}`
    return `Could not load the app directory (${error.status}). Try again.`
  }
  return 'Could not reach the app directory. Check your connection and try again.'
}

function toggle<T>(set: T[], value: T): T[] {
  return set.includes(value) ? set.filter((v) => v !== value) : [...set, value]
}

export function DirectoryView({ getToken, debounceMs = 300 }: Props) {
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<Lifecycle[]>([])
  const [access, setAccess] = useState<AccessFilter[]>([])
  const [result, setResult] = useState<DirectoryResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const version = useRef(0)
  // App passes a fresh closure each render; only the query should refetch.
  const tokenRef = useRef(getToken)
  tokenRef.current = getToken

  // Debounce typing; submitting the form searches at once.
  useEffect(() => {
    const t = setTimeout(() => setQ(input), debounceMs)
    return () => clearTimeout(t)
  }, [input, debounceMs])

  useEffect(() => {
    const v = ++version.current
    setLoading(true); setError(null)
    fetchDirectory(tokenRef.current(), { q, status, access })
      .then((r) => { if (v === version.current) setResult(r) })
      .catch((e) => { if (v === version.current) { setResult(null); setError(errorMessage(e)) } })
      .finally(() => { if (v === version.current) setLoading(false) })
  }, [q, status, access])
  useEffect(() => () => { version.current += 1 }, [])

  const submit = (e: FormEvent) => { e.preventDefault(); setQ(input) }
  const filtered = status.length > 0 || access.length > 0

  return (
    <section className="space-y-4" aria-labelledby="directory-heading">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-4">
        <div>
          <h2 id="directory-heading" className="display-font text-lg font-bold text-[var(--ink)]">App directory</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Find an app by id, name, live URL, store page, repository URL or custom domain — and check whether an id is free before you create one.
          </p>
        </div>

        <form role="search" onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="directory-search" className="sr-only">Search apps</label>
          <input
            id="directory-search"
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. chess-clubs, https://chess-clubs.proappstore.online, github.com/proappstore-online/chess-clubs"
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
            className="w-full min-w-0 flex-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">Search</button>
        </form>

        <FilterGroup legend="Status" options={LIFECYCLES} labels={LIFECYCLE_LABELS} selected={status} onToggle={(v) => setStatus((s) => toggle(s, v))} />
        <FilterGroup legend="Access" options={ACCESS_FILTERS} labels={ACCESS_LABELS} selected={access} onToggle={(v) => setAccess((s) => toggle(s, v))} />
        {filtered && (
          <button type="button" onClick={() => { setStatus([]); setAccess([]) }} className="text-xs font-semibold text-[var(--accent)] hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {result?.lookup && <LookupBanner lookup={result.lookup} getToken={getToken} />}

      {error && <p role="alert" className="rounded-xl border border-[var(--danger)]/30 bg-[var(--panel)] p-4 text-sm text-[var(--danger)]">{error}</p>}

      <div aria-live="polite" aria-busy={loading}>
        {loading && !result && <p className="py-12 text-center text-sm text-[var(--muted)]">Loading apps…</p>}
        {result && !error && (
          <>
            <p className="mb-2 text-xs text-[var(--muted)]">
              {result.total === 1 ? '1 app' : `${result.total} apps`}
              {result.truncated && ` — showing the first ${result.items.length}; narrow the search to see the rest`}
            </p>
            {result.items.length === 0 ? (
              <p className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-8 text-center text-sm text-[var(--muted)]">
                {q || filtered ? 'No apps match.' : 'You have no apps yet.'}
              </p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2" aria-label="Apps">
                {result.items.map((item) => <DirectoryCard key={item.id} item={item} highlighted={item.id === result.lookup?.id} />)}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function FilterGroup<T extends string>({ legend, options, labels, selected, onToggle }: {
  legend: string
  options: readonly T[]
  labels: Record<T, string>
  selected: T[]
  onToggle: (value: T) => void
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o)
          return (
            <button key={o} type="button" aria-pressed={on} aria-label={labels[o]} onClick={() => onToggle(o)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                on ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--panel-hover)]'
              }`}>
              {labels[o]}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/** The answer for the one id a search names: free, the platform's, yours, or someone else's. */
function LookupBanner({ lookup, getToken }: { lookup: NonNullable<DirectoryResult['lookup']>; getToken: () => string | null }) {
  const id = <code className="font-mono">{lookup.id}</code>
  const box = 'rounded-2xl border bg-[var(--panel)] p-4 text-sm'
  switch (lookup.status) {
    case 'unclaimed':
      return (
        <div role="status" className={`${box} border-[var(--success)]/40`}>
          <p className="text-[var(--ink)]"><strong>{id} is free.</strong> No app uses this id yet.</p>
          <a href={hashFor('provision')} className="mt-2 inline-block font-semibold text-[var(--accent)] hover:underline">Create an app with this id</a>
        </div>
      )
    case 'reserved':
      return <p role="status" className={`${box} border-[var(--line-strong)] text-[var(--ink)]`}>{id} is a platform hostname and cannot be used for an app.</p>
    case 'invalid':
      return <p role="status" className={`${box} border-[var(--line-strong)] text-[var(--ink)]`}>That is not a PAS app id or URL. App ids are lowercase letters, digits and hyphens, starting with a letter.</p>
    case 'yours':
      return <p role="status" className={`${box} border-[var(--accent)]/40 text-[var(--ink)]`}>{id} is your app.</p>
    case 'accessible':
      return <p role="status" className={`${box} border-[var(--accent)]/40 text-[var(--ink)]`}>{id} is an app you have access to.</p>
    case 'exists_inaccessible':
      return <RecoveryBanner appId={lookup.id} getToken={getToken} />
  }
}

function RecoveryBanner({ appId, getToken }: { appId: string; getToken: () => string | null }) {
  const [open, setOpen] = useState(false)
  const [evidence, setEvidence] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  const send = async (e: FormEvent) => {
    e.preventDefault()
    setState('sending'); setError(null)
    try {
      await requestRecovery(appId, getToken(), evidence.trim())
      setState('sent')
    } catch (err) {
      setState('idle')
      setError(err instanceof ApiError ? err.message : 'Could not send the request. Try again.')
    }
  }

  return (
    <div role="status" className="rounded-2xl border border-[var(--warning)]/50 bg-[var(--panel)] p-4 text-sm space-y-2">
      <p className="text-[var(--ink)]">
        <strong><code className="font-mono">{appId}</code> already exists, and you cannot manage it.</strong> Pick another id for a new app.
      </p>
      <p className="text-[var(--muted)]">
        If you created it under another sign-in, ask a platform admin to recover it. Ownership never moves because an app is down or empty, and the owner is not told who asked.
      </p>
      {state === 'sent' ? (
        <p className="font-semibold text-[var(--success)]">Recovery request sent. A platform admin will review it.</p>
      ) : !open ? (
        <button type="button" onClick={() => setOpen(true)} aria-expanded={false} className="font-semibold text-[var(--accent)] hover:underline">Request recovery</button>
      ) : (
        <form onSubmit={send} className="space-y-2">
          <label htmlFor="recovery-evidence" className="block text-xs font-semibold text-[var(--ink)]">How can you show you created this app?</label>
          <textarea id="recovery-evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)} required maxLength={2000} rows={3}
            placeholder="e.g. the GitHub account I used, the repository, my commits"
            className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
          {error && <p role="alert" className="text-xs text-[var(--danger)]">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" aria-label="Send recovery request" disabled={state === 'sending' || !evidence.trim()} className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {state === 'sending' ? 'Sending…' : 'Send recovery request'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm text-[var(--ink)]">Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}

function DirectoryCard({ item, highlighted }: { item: DirectoryItem; highlighted: boolean }) {
  const headingId = useId()
  const detailsTab = item.accessLevel === 'operator' ? 'operator' : null
  const details = item.links.details ? hashFor('app-detail', item.id, detailsTab) : null
  return (
    <li aria-labelledby={headingId}
      className={`rounded-2xl border bg-[var(--panel)] p-4 space-y-3 ${highlighted ? 'border-[var(--accent)]' : 'border-[var(--line)]'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={headingId} className="font-semibold text-[var(--ink)] break-words">
            {details ? <a href={details} className="hover:underline">{item.displayName}</a> : item.displayName}
          </h3>
          <code className="text-xs text-[var(--muted)] break-all">{item.id}</code>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {item.lifecycle && <Badge tone={item.lifecycle === 'failed' ? 'error' : item.lifecycle === 'live' ? 'success' : 'neutral'}>{LIFECYCLE_LABELS[item.lifecycle]}</Badge>}
          <Badge tone={item.accessLevel === 'inaccessible' ? 'warning' : 'accent'}>{ACCESS_LEVEL_LABELS[item.accessLevel]}{item.teamRole && item.accessLevel === 'team' ? ` · ${item.teamRole}` : ''}</Badge>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-[var(--muted)]">Deploy</dt>
        <dd className="text-[var(--ink)]">
          {item.deployStatus ? DEPLOY_LABELS[item.deployStatus] : '—'}
          {item.lastDeployAt && <span className="text-[var(--muted)]"> · {new Date(item.lastDeployAt).toLocaleDateString()}</span>}
        </dd>
        <dt className="text-[var(--muted)]">Route</dt>
        <dd className="min-w-0">
          <a href={item.routeUrl} target="_blank" rel="noreferrer" className="break-all text-[var(--accent)] hover:underline">{item.routeUrl.replace(/^https:\/\//, '')}</a>
          <span className="text-[var(--muted)]"> · {item.routeHealth === 'ok' ? 'up' : item.routeHealth === 'down' ? 'down' : item.routeHealth === 'timeout' ? 'not answering' : 'health not checked'}</span>
        </dd>
        <dt className="text-[var(--muted)]">Repository</dt>
        <dd className="text-[var(--ink)] break-all">{item.repoRef ?? '—'}</dd>
      </dl>

      {item.pendingTransfer && (
        <p className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-xs text-[var(--accent-deep)]">
          {item.pendingTransfer === 'incoming'
            ? 'Its owner has offered this app to you. Review and accept or decline it with the respond_ownership_transfer MCP tool.'
            : 'You have offered this app to another account. It stays yours until they accept.'}
        </p>
      )}

      <nav aria-label={`Links for ${item.displayName}`} className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
        {details && <a href={details} className="text-[var(--accent)] hover:underline">{item.accessLevel === 'operator' ? 'Open operator view' : 'Open'}</a>}
        {item.links.deployHistory && <a href={item.links.deployHistory} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">Deploy history</a>}
        {item.links.repository && <a href={item.links.repository} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">Repository</a>}
        {item.links.storePage && <a href={item.links.storePage} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">Store page</a>}
      </nav>
    </li>
  )
}

function Badge({ tone, children }: { tone: 'success' | 'error' | 'warning' | 'accent' | 'neutral'; children: ReactNode }) {
  const tones = {
    success: 'border-[var(--success)]/40 text-[var(--success)]',
    error: 'border-[var(--danger)]/40 text-[var(--danger)]',
    warning: 'border-[var(--warning)]/50 text-[var(--warning)]',
    accent: 'border-[var(--accent)]/40 text-[var(--accent)]',
    neutral: 'border-[var(--line-strong)] text-[var(--muted)]',
  }
  return <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tones[tone]}`}>{children}</span>
}
