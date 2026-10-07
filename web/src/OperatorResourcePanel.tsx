/**
 * One declared operator resource (#240), rendered generically from the app's
 * contract: `metrics` as KPI tiles from the first row, every other kind as a
 * table of the declared columns with the resource's row actions. A list
 * resource may add search, "Load more" paging, an Open link to a record's
 * detail page, and a status workflow (a state filter, state labels, and actions
 * offered only from the states they leave). Listed on another record's page it
 * is scoped to that record (`related`). Everything the app supplies (titles,
 * labels, values) is rendered as text.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  fetchOperatorRows, runOperatorRowAction, actionAvailable, statusLabel, needsReauth, formatCell, operatorErrorMessage,
  returnedKeys, confirmText, isConflict,
  type OperatorResource, type OperatorAction, type OperatorRow,
} from './operator'
import { operatorRecordHash } from './nav'
import { Kpi } from './sectionPrimitives'

const BUTTON = 'rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-50'

export function OperatorResourcePanel({ appId, resource, actions, getToken, related, onReauth }: {
  appId: string
  resource: OperatorResource
  actions: OperatorAction[]
  getToken: () => string | null
  /** The record key this panel is listed for, on that record's page. */
  related?: string
  /** Start a fresh sign-in, for actions refused with step_up_required. */
  onReauth?: () => void
}) {
  const [rows, setRows] = useState<OperatorRow[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reauth, setReauth] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [state, setState] = useState<string | null>(null)

  /** First page for the current search and state, or the next page appended after `cursor`. */
  const load = useCallback(async (cursor: string | null = null) => {
    const token = getToken()
    if (!token) { setError('Your session has expired. Sign in again.'); return }
    try {
      const res = await fetchOperatorRows(token, appId, resource.id, { q: query, cursor, status: state, related: related ?? null })
      setRows((prev) => (cursor ? [...(prev ?? []), ...res.rows] : res.rows))
      setNext(res.next_cursor)
      setError(null)
    } catch (e) {
      setError(operatorErrorMessage(e))
    }
  }, [appId, resource.id, query, state, related, getToken])

  useEffect(() => { load() }, [load])

  const run = async (action: OperatorAction, row: OperatorRow) => {
    const token = getToken()
    if (!token || !window.confirm(confirmText(action))) return
    setBusy(true)
    setNotice(null)
    setReauth(false)
    try {
      await runOperatorRowAction(token, appId, action.id, row)
      setNotice(`${action.title}: done.`)
      await load()
    } catch (e) {
      setNotice(`${action.title}: ${operatorErrorMessage(e)}`)
      setReauth(needsReauth(e))
      if (isConflict(e)) await load() // the row moved on: show its current state
    } finally {
      setBusy(false)
    }
  }

  const filter = resource.status?.param ? resource.status : null
  // Only what the backend returned renders: a blocked field (platform#294) has no column at all.
  const columns = rows ? returnedKeys(resource.columns, rows) : []

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <h4 className="display-font text-base font-bold text-[var(--ink)]">{resource.title}</h4>
      {resource.description && <p className="mt-1 text-sm text-[var(--muted)]">{resource.description}</p>}

      {resource.search && (
        <form role="search" className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(draft.trim()) }}>
          <input type="search" aria-label={`Search ${resource.title}`} value={draft} maxLength={100}
            onChange={(e) => setDraft(e.target.value)} placeholder="Search"
            className="flex-1 rounded-lg border border-[var(--line-strong)] bg-transparent px-3 py-1.5 text-sm text-[var(--ink)]" />
          <button type="submit" className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]">Search</button>
        </form>
      )}

      {filter && (
        <div role="group" aria-label={`Filter ${resource.title} by status`} className="mt-3 flex flex-wrap gap-1">
          {[{ value: null, label: 'All' }, ...filter.states].map((s) => (
            <button key={s.value ?? '*'} type="button" aria-pressed={state === s.value} onClick={() => setState(s.value)}
              className={`${BUTTON} ${state === s.value ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--ink)]'}`}>
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4">
        {error && <p role="alert" className="text-sm text-[var(--error)]">{error}</p>}
        {!error && !rows && <p className="text-sm text-[var(--muted)]">Loading...</p>}
        {!error && rows && rows.length === 0 && <p className="text-sm text-[var(--muted)]">Nothing here.</p>}

        {!error && rows && rows.length > 0 && resource.kind === 'metrics' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {columns.map((col) => (
              <Kpi key={col.key} label={col.label} value={formatCell(rows[0]![col.key], col.format)} />
            ))}
          </div>
        )}

        {!error && rows && rows.length > 0 && resource.kind !== 'metrics' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                  {columns.map((col) => <th key={col.key} className="py-2 pr-4 font-semibold">{col.label}</th>)}
                  {(actions.length > 0 || resource.detail) && <th className="py-2 font-semibold"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-t border-[var(--line)]">
                    {columns.map((col) => {
                      const shown = (col.key === resource.status?.column && statusLabel(resource, row[col.key])) || formatCell(row[col.key], col.format)
                      return (
                        <td key={col.key} className="py-2 pr-4 text-[var(--ink)]">
                          {col.format === 'badge'
                            ? <span className="rounded-full border border-[var(--line-strong)] px-2 py-0.5 text-xs">{shown}</span>
                            : shown}
                        </td>
                      )
                    })}
                    {(actions.length > 0 || resource.detail) && (
                      <td className="py-2 whitespace-nowrap">
                        {resource.detail && row[resource.detail.key] != null && (
                          <a href={operatorRecordHash(appId, resource.id, String(row[resource.detail.key]))}
                            className={`${BUTTON} border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--ink)]`}>
                            Open
                          </a>
                        )}
                        {actions.filter((a) => actionAvailable(a, resource, row)).map((a) => (
                          <button key={a.id} type="button" title={a.step_up ? 'Needs a recent sign-in' : undefined}
                            disabled={busy} onClick={() => run(a, row)}
                            className={`ml-2 ${BUTTON} ${a.destructive ? 'border-[var(--error)] text-[var(--error)]' : 'border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--ink)]'}`}>
                            {a.title}
                          </button>
                        ))}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!error && next && (
          <button type="button" onClick={() => load(next)}
            className="mt-3 rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]">
            Load more
          </button>
        )}
        {notice && <p className="mt-3 text-sm text-[var(--muted)]">{notice}</p>}
        {reauth && onReauth && (
          <button type="button" onClick={onReauth}
            className="mt-2 rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-sm font-medium text-[var(--ink)]">
            Sign in again
          </button>
        )}
      </div>
    </section>
  )
}
