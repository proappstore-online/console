// Enquiries sent from the app's about- site (console#9, platform#412): the
// owner lists them (new / handled), reads one and marks it handled. The
// overview card on Settings → Storefront surfaces the new ones.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './api'
import { fetchEnquiries, setEnquiryStatus, type Enquiry, type EnquiryStatus } from './enquiriesApi'

interface Props {
  appId: string
  getToken: () => string | null
}

type Filter = EnquiryStatus | 'all'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'handled', label: 'Handled' },
  { key: 'all', label: 'All' },
]
const PAGE = 50

function formatTime(value: number): string {
  return new Date(value).toLocaleString()
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has expired. Sign in again to read enquiries.'
    if (error.status === 403) return 'Enquiries are available only to this app’s owner.'
    return `Could not load enquiries (${error.status}). Try again.`
  }
  return 'Could not reach the enquiries service. Check your connection and try again.'
}

export function AppEnquiries({ appId, getToken }: Props) {
  const [filter, setFilter] = useState<Filter>('new')
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [counts, setCounts] = useState<{ new: number; total: number } | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const version = useRef(0)

  const load = useCallback(async (before?: number) => {
    const v = ++version.current
    const append = before !== undefined
    if (append) setLoadingMore(true)
    else { setLoading(true); setError(null); setEnquiries([]); setSelectedId(null) }
    try {
      const page = await fetchEnquiries(appId, getToken(), { status: filter === 'all' ? undefined : filter, before, limit: PAGE })
      if (v !== version.current) return
      setEnquiries((prev) => append ? [...prev, ...page.enquiries] : page.enquiries)
      setCounts(page.counts)
      setHasMore(page.enquiries.length === PAGE)
    } catch (e) {
      if (v !== version.current) return
      setError(errorMessage(e))
    } finally {
      if (v === version.current) { setLoading(false); setLoadingMore(false) }
    }
  }, [appId, getToken, filter])

  useEffect(() => { void load() }, [load])
  useEffect(() => () => { version.current += 1 }, [])

  const selected = enquiries.find((e) => e.id === selectedId) ?? null

  const changeStatus = async (enquiry: Enquiry, status: EnquiryStatus) => {
    setSaving(true); setSaveError(null)
    try {
      await setEnquiryStatus(appId, getToken(), enquiry.id, status)
      setEnquiries((prev) => prev.map((e) => e.id === enquiry.id
        ? { ...e, status, handled_at: status === 'handled' ? Date.now() : null }
        : e))
      setCounts((c) => c && { ...c, new: Math.max(0, c.new + (status === 'new' ? 1 : -1)) })
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : 'Could not update the enquiry. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const more = () => {
    const last = enquiries.at(-1)
    if (last) void load(last.created_at)
  }

  return (
    <section className="max-w-6xl space-y-4 overflow-y-auto min-h-0 flex-1" aria-labelledby="app-enquiries-heading">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 id="app-enquiries-heading" className="display-font text-lg font-bold text-[var(--ink)]">Enquiries</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Messages visitors sent from this app’s about- site. Only you, the owner, can read them.</p>
            {counts && <p className="mt-1 text-xs text-[var(--muted)]">{counts.new} new · {counts.total} total</p>}
          </div>
          <div role="tablist" aria-label="Enquiry status" className="flex items-center gap-0.5 rounded-lg border border-[var(--line-strong)] p-0.5">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
                className={`px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap transition-colors ${
                  filter === f.key ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--panel-hover)]'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-[var(--error)]/30 bg-[var(--panel)] p-4 text-sm text-[var(--error)]">{error}</p>}
      {loading && <p className="py-12 text-center text-sm text-[var(--muted)]">Loading enquiries…</p>}

      {!loading && !error && (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
            {enquiries.length === 0 ? (
              <p className="p-8 text-center text-sm text-[var(--muted)]">
                {filter === 'new' ? 'No new enquiries.' : filter === 'handled' ? 'No handled enquiries yet.' : 'No enquiries yet. They arrive from the enquiry form on the app’s about- site.'}
              </p>
            ) : (
              <ul>
                {enquiries.map((e) => (
                  <li key={e.id} className="border-b border-[var(--line)] last:border-0">
                    <button type="button" onClick={() => { setSelectedId(e.id); setSaveError(null) }} aria-label={`Enquiry from ${e.name}`}
                      className={`w-full text-left p-3 hover:bg-[var(--panel-hover)] ${selectedId === e.id ? 'bg-[var(--panel-hover)]' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-[var(--ink)] truncate">{e.name}</span>
                        <span className="text-xs text-[var(--muted)] whitespace-nowrap">{formatTime(e.created_at)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <StatusBadge status={e.status} />
                        <span className="text-xs text-[var(--muted)] truncate">{e.message}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {hasMore && (
              <div className="border-t border-[var(--line)] p-3">
                <button type="button" onClick={more} disabled={loadingMore} className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-50">
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </div>
          <aside>
            {selected ? (
              <section aria-label="Enquiry" className="rounded-2xl border border-[var(--accent)] bg-[var(--panel)] p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[var(--ink)] break-words">{selected.name}</h3>
                    <a href={`mailto:${selected.email}`} className="text-xs text-[var(--accent)] break-all">{selected.email}</a>
                  </div>
                  <button type="button" onClick={() => setSelectedId(null)} className="text-xs text-[var(--muted)] hover:text-[var(--ink)]">Close</button>
                </div>
                <p className="text-xs text-[var(--muted)]">
                  Received {formatTime(selected.created_at)}
                  {selected.status === 'handled' && selected.handled_at && <> · handled {formatTime(selected.handled_at)}</>}
                </p>
                <p className="text-sm text-[var(--ink)] whitespace-pre-wrap break-words">{selected.message}</p>
                {saveError && <p role="alert" className="text-xs text-[var(--error)]">{saveError}</p>}
                {selected.status === 'new' ? (
                  <button type="button" disabled={saving} onClick={() => void changeStatus(selected, 'handled')}
                    className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {saving ? 'Saving…' : 'Mark handled'}
                  </button>
                ) : (
                  <button type="button" disabled={saving} onClick={() => void changeStatus(selected, 'new')}
                    className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-50">
                    {saving ? 'Saving…' : 'Mark as new'}
                  </button>
                )}
              </section>
            ) : (
              enquiries.length > 0 && <p className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 text-sm text-[var(--muted)]">Select an enquiry to read it.</p>
            )}
          </aside>
        </div>
      )}
    </section>
  )
}

function StatusBadge({ status }: { status: EnquiryStatus }) {
  return status === 'new'
    ? <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-semibold text-white">New</span>
    : <span className="rounded-full border border-[var(--line-strong)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">Handled</span>
}

/** Overview card: the count of new enquiries and the latest few, linking to the full list. */
export function EnquiriesSummary({ appId, getToken, onOpen }: Props & { onOpen: () => void }) {
  const [page, setPage] = useState<{ latest: Enquiry[]; newCount: number } | null>(null)

  // A failure leaves the card out; the Enquiries tab reports its own errors.
  useEffect(() => {
    let cancelled = false
    fetchEnquiries(appId, getToken(), { status: 'new', limit: 3 })
      .then((p) => { if (!cancelled) setPage({ latest: p.enquiries, newCount: p.counts.new }) }, () => {})
    return () => { cancelled = true }
  }, [appId, getToken])

  if (!page) return null
  return (
    <section aria-label="New enquiries" className="max-w-6xl rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--ink)]">
          Enquiries · <span className={page.newCount ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}>{page.newCount} new</span>
        </h3>
        <button type="button" onClick={onOpen} className="text-xs font-semibold text-[var(--accent)] hover:underline">View all enquiries →</button>
      </div>
      {page.latest.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted)]">No new enquiries from the about- site.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {page.latest.map((e) => (
            <li key={e.id} className="text-sm">
              <span className="font-medium text-[var(--ink)]">{e.name}</span>
              <span className="text-xs text-[var(--muted)]"> · {formatTime(e.created_at)}</span>
              <p className="text-xs text-[var(--muted)] truncate">{e.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
