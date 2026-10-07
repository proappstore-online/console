/**
 * The operator audit trail (#240): what the app's owner and its admins did in
 * this operator view (each under their own id). Owner-only on the platform —
 * an admin opening it is told so in words, not an error code — entries, reads, document views, metric reads, actions and every
 * refused attempt — newest first, 50 at a time. Opened on request (reading the
 * trail is itself recorded), filtered with ordinary form controls, a table on
 * wide screens and a stacked list on narrow ones. Targets of identity data are
 * hidden until a recent sign-in. Everything the platform returns renders as
 * text; the trail never carries params, paths or results.
 */

import { useState, useEffect, useCallback, type FormEvent } from 'react'
import {
  fetchOperatorAudit, operatorErrorMessage, needsReauth,
  type OperatorAuditFilters, type OperatorAuditRow, type OperatorContract,
} from './operator'

const KINDS: { value: OperatorAuditRow['kind']; label: string }[] = [
  { value: 'enter', label: 'Opened operator view' },
  { value: 'read', label: 'Listed' },
  { value: 'detail', label: 'Opened record' },
  { value: 'evidence', label: 'Viewed document' },
  { value: 'series', label: 'Viewed metric' },
  { value: 'action', label: 'Ran action' },
  { value: 'audit', label: 'Viewed audit trail' },
]
const FIELD = 'rounded-lg border border-[var(--line-strong)] bg-transparent px-2 py-1 text-sm text-[var(--ink)]'

/** What happened, in words, with the app's own titles for its resources and actions. */
export function describeAudit(row: OperatorAuditRow, contract: OperatorContract | null): string {
  const kind = KINDS.find((k) => k.value === row.kind)?.label ?? row.kind
  if (row.kind === 'action') return `${kind}: ${contract?.actions.find((a) => a.id === row.operation)?.title ?? row.operation}`
  if (!row.resource) return kind
  const resource = contract?.resources.find((r) => r.id === row.resource)
  const field = row.field ? resource?.detail?.evidence?.find((e) => e.field === row.field)?.label ?? row.field : null
  return `${kind}: ${resource?.title ?? row.resource}${field ? ` · ${field}` : ''}`
}

const outcomeText = (row: OperatorAuditRow) => (row.outcome === 'success' ? 'Success' : `Refused (${row.status})`)
const who = (row: OperatorAuditRow) => row.actor.login ?? row.actor.id

function Target({ row }: { row: OperatorAuditRow }) {
  if (row.target_hidden) return <span className="italic text-[var(--muted)]">Hidden</span>
  return <span className="break-all">{row.target ?? '—'}</span>
}

export function OperatorAuditPanel({ appId, contract, getToken, onReauth }: {
  appId: string
  contract: OperatorContract | null
  getToken: () => string | null
  onReauth?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<OperatorAuditFilters>({})
  const [filters, setFilters] = useState<OperatorAuditFilters>({})
  const [rows, setRows] = useState<OperatorAuditRow[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reauth, setReauth] = useState(false)

  const load = useCallback(async (cursor: string | null) => {
    const token = getToken()
    if (!token) { setError('Your session has expired. Sign in again.'); return }
    setLoading(true)
    try {
      const res = await fetchOperatorAudit(token, appId, filters, cursor)
      setRows((prev) => (cursor ? [...(prev ?? []), ...res.rows] : res.rows))
      setNext(res.next_cursor)
      setHidden((h) => (cursor ? h || res.targets_hidden : res.targets_hidden))
      setError(null)
      setReauth(false)
    } catch (e) {
      setError(operatorErrorMessage(e))
      setReauth(needsReauth(e))
    } finally {
      setLoading(false)
    }
  }, [appId, filters, getToken])

  useEffect(() => { if (open) load(null) }, [open, load])

  const apply = (e: FormEvent) => {
    e.preventDefault()
    setFilters(Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v?.trim()]).filter(([, v]) => v)))
  }
  const set = (k: keyof OperatorAuditFilters) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }))

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="display-font text-base font-bold text-[var(--ink)]">Audit trail</h3>
        <button type="button" aria-expanded={open} aria-controls="operator-audit" onClick={() => setOpen((o) => !o)}
          className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]">
          {open ? 'Hide audit trail' : 'Show audit trail'}
        </button>
      </div>
      <p className="mt-1 text-sm text-[var(--muted)]">What was opened, viewed and done in this operator view, including refused attempts. Viewing it is recorded too.</p>

      {open && (
        <div id="operator-audit" className="mt-4" aria-busy={loading}>
          <form onSubmit={apply} aria-label="Filter the audit trail" className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">What
              <select value={draft.kind ?? ''} onChange={set('kind')} className={FIELD}>
                <option value="">Everything</option>
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">Outcome
              <select value={draft.outcome ?? ''} onChange={set('outcome')} className={FIELD}>
                <option value="">Any</option>
                <option value="success">Success</option>
                <option value="refused">Refused</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">Record
              <input type="text" value={draft.target ?? ''} onChange={set('target')} maxLength={200} className={FIELD} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">Who (user id)
              <input type="text" value={draft.actor ?? ''} onChange={set('actor')} maxLength={100} className={FIELD} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">From
              <input type="date" value={draft.from ?? ''} onChange={set('from')} className={FIELD} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">To
              <input type="date" value={draft.to ?? ''} onChange={set('to')} className={FIELD} />
            </label>
            <div className="flex gap-2 sm:col-span-3 lg:col-span-6">
              <button type="submit" className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-sm font-medium text-[var(--ink)]">Apply filters</button>
              <button type="button" onClick={() => { setDraft({}); setFilters({}) }}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]">Clear</button>
            </div>
          </form>

          <div className="mt-4">
            {error && (
              <div>
                <p role="alert" className="text-sm text-[var(--error)]">{error}</p>
                {reauth && onReauth && (
                  <button type="button" onClick={onReauth} className="mt-2 rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-sm font-medium text-[var(--ink)]">Sign in again</button>
                )}
              </div>
            )}
            {!error && !rows && <p className="text-sm text-[var(--muted)]">Loading...</p>}
            {!error && rows && rows.length === 0 && <p className="text-sm text-[var(--muted)]">Nothing recorded for these filters.</p>}
            {!error && rows && rows.length > 0 && (
              <div className={loading ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
                {hidden && (
                  <p className="mb-3 text-sm text-[var(--muted)]">
                    Records of identity checks and documents are hidden until you sign in again.{' '}
                    {onReauth && <button type="button" onClick={onReauth} className="underline text-[var(--ink)]">Sign in again</button>}
                  </p>
                )}
                <table className="hidden w-full text-sm sm:table">
                  <caption className="sr-only">Operator audit trail, newest first</caption>
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                      <th scope="col" className="py-2 pr-4 font-semibold">When</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Who</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">What</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Record</th>
                      <th scope="col" className="py-2 font-semibold">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-[var(--line)] align-top">
                        <td className="py-2 pr-4 whitespace-nowrap text-[var(--muted)]"><time dateTime={new Date(r.at).toISOString()}>{new Date(r.at).toLocaleString()}</time></td>
                        <td className="py-2 pr-4 text-[var(--ink)]">{who(r)}{r.role && <span className="block text-xs text-[var(--muted)]">as {r.role}</span>}</td>
                        <td className="py-2 pr-4 text-[var(--ink)]">{describeAudit(r, contract)}</td>
                        <td className="py-2 pr-4 text-[var(--ink)]"><Target row={r} /></td>
                        <td className="py-2 whitespace-nowrap text-[var(--ink)]">{r.outcome === 'success' ? '✓ ' : '✕ '}{outcomeText(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="space-y-3 sm:hidden" aria-label="Operator audit trail, newest first">
                  {rows.map((r) => (
                    <li key={r.id} className="rounded-xl border border-[var(--line)] p-3 text-sm">
                      <p className="font-medium text-[var(--ink)]">{describeAudit(r, contract)}</p>
                      <p className="text-xs text-[var(--muted)]"><time dateTime={new Date(r.at).toISOString()}>{new Date(r.at).toLocaleString()}</time> · {who(r)}</p>
                      <p className="mt-1 text-[var(--ink)]">Record: <Target row={r} /></p>
                      <p className="text-[var(--ink)]">{r.outcome === 'success' ? '✓ ' : '✕ '}{outcomeText(r)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!error && next && (
              <button type="button" disabled={loading} onClick={() => load(next)}
                className="mt-3 rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-50">
                Load more
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
