/**
 * One declared operator resource (#240), rendered generically from the app's
 * contract: `metrics` as KPI tiles from the first row, every other kind as a
 * table of the declared columns, with the resource's row actions. A users
 * resource may add search, "Load more" paging and an Open link to a record's
 * detail page. Everything the app supplies (titles, labels, values) is
 * rendered as text.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  fetchOperatorRows, runOperatorAction, rowParams, formatCell, operatorErrorMessage,
  type OperatorResource, type OperatorAction, type OperatorRow,
} from './operator'
import { operatorRecordHash } from './nav'
import { Kpi } from './sectionPrimitives'

export function OperatorResourcePanel({ appId, resource, actions, getToken }: {
  appId: string
  resource: OperatorResource
  actions: OperatorAction[]
  getToken: () => string | null
}) {
  const [rows, setRows] = useState<OperatorRow[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')

  /** First page for the current search, or the next page appended after `cursor`. */
  const load = useCallback(async (cursor: string | null = null) => {
    const token = getToken()
    if (!token) { setError('Your session has expired. Sign in again.'); return }
    try {
      const res = await fetchOperatorRows(token, appId, resource.id, { q: query, cursor })
      setRows((prev) => (cursor ? [...(prev ?? []), ...res.rows] : res.rows))
      setNext(res.next_cursor)
      setError(null)
    } catch (e) {
      setError(operatorErrorMessage(e))
    }
  }, [appId, resource.id, query, getToken])

  useEffect(() => { load() }, [load])

  const run = async (action: OperatorAction, row: OperatorRow) => {
    const token = getToken()
    if (!token || !window.confirm(action.confirm)) return
    setBusy(true)
    setStatus(null)
    try {
      await runOperatorAction(token, appId, action.action, rowParams(action, row))
      setStatus(`${action.title}: done.`)
      await load()
    } catch (e) {
      setStatus(`${action.title}: ${operatorErrorMessage(e)}`)
    } finally {
      setBusy(false)
    }
  }

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

      <div className="mt-4">
        {error && <p role="alert" className="text-sm text-[var(--error)]">{error}</p>}
        {!error && !rows && <p className="text-sm text-[var(--muted)]">Loading...</p>}
        {!error && rows && rows.length === 0 && <p className="text-sm text-[var(--muted)]">Nothing here.</p>}

        {!error && rows && rows.length > 0 && resource.kind === 'metrics' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {resource.columns.map((col) => (
              <Kpi key={col.key} label={col.label} value={formatCell(rows[0]![col.key], col.format)} />
            ))}
          </div>
        )}

        {!error && rows && rows.length > 0 && resource.kind !== 'metrics' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                  {resource.columns.map((col) => <th key={col.key} className="py-2 pr-4 font-semibold">{col.label}</th>)}
                  {(actions.length > 0 || resource.detail) && <th className="py-2 font-semibold"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-t border-[var(--line)]">
                    {resource.columns.map((col) => (
                      <td key={col.key} className="py-2 pr-4 text-[var(--ink)]">
                        {col.format === 'badge'
                          ? <span className="rounded-full border border-[var(--line-strong)] px-2 py-0.5 text-xs">{formatCell(row[col.key], col.format)}</span>
                          : formatCell(row[col.key], col.format)}
                      </td>
                    ))}
                    {(actions.length > 0 || resource.detail) && (
                      <td className="py-2 whitespace-nowrap">
                        {resource.detail && row[resource.detail.key] != null && (
                          <a href={operatorRecordHash(appId, resource.id, String(row[resource.detail.key]))}
                            className="rounded-lg border border-[var(--line-strong)] px-2.5 py-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]">
                            Open
                          </a>
                        )}
                        {actions.map((a) => (
                          <button key={a.id} type="button" disabled={busy} onClick={() => run(a, row)}
                            title={a.step_up ? 'Needs a recent sign-in' : undefined}
                            className="ml-2 rounded-lg border border-[var(--line-strong)] px-2.5 py-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-50">
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
        {status && <p className="mt-3 text-sm text-[var(--muted)]">{status}</p>}
      </div>
    </section>
  )
}
