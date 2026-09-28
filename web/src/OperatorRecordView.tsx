/**
 * One record of a declared operator resource (#240): the resource's declared
 * detail fields, read through the owner-only record route, then every resource
 * declared `related` to it listed for this record (e.g. a member's suspension
 * history, with its row actions). Reached by
 * `#/apps/<slug>/operator/<resource>/<key>`. Values render as text.
 */

import { useState, useEffect } from 'react'
import { fetchOperatorRecord, formatCell, operatorErrorMessage, type OperatorContract, type OperatorRow } from './operator'
import { OperatorResourcePanel } from './OperatorResourcePanel'

export function OperatorRecordView({ appId, contract, resourceId, recordKey, getToken, onReauth }: {
  appId: string
  contract: OperatorContract | null
  resourceId: string
  recordKey: string
  getToken: () => string | null
  onReauth?: () => void
}) {
  const resource = contract?.resources.find((r) => r.id === resourceId)
  const related = contract?.resources.filter((r) => r.related?.resource === resourceId) ?? []
  const [record, setRecord] = useState<OperatorRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const detail = resource?.detail

  useEffect(() => {
    let cancelled = false
    setRecord(null)
    setError(null)
    const token = getToken()
    if (!resource || !detail) { setError('This app does not declare a detail page for that record.'); return }
    if (!token) { setError('Your session has expired. Sign in again.'); return }
    fetchOperatorRecord(token, appId, resource.id, recordKey)
      .then((r) => { if (!cancelled) setRecord(r.record) })
      .catch((e) => { if (!cancelled) setError(operatorErrorMessage(e)) })
    return () => { cancelled = true }
  }, [appId, resource, detail, recordKey, getToken])

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
        <a href={`#/apps/${appId}/operator`} className="text-sm text-[var(--muted)] hover:text-[var(--ink)]">← Back to operator view</a>
        <h3 className="mt-3 display-font text-base font-bold text-[var(--ink)]">{resource?.title ?? 'Record'}</h3>
        <p className="text-xs text-[var(--muted)] break-all">{recordKey}</p>

        <div className="mt-4">
          {error && <p role="alert" className="text-sm text-[var(--error)]">{error}</p>}
          {!error && !record && <p className="text-sm text-[var(--muted)]">Loading...</p>}
          {!error && record && detail && (
            <dl className="grid grid-cols-1 sm:grid-cols-[12rem_1fr] gap-x-4 gap-y-2 text-sm">
              {detail.fields.map((f) => (
                <div key={f.key} className="contents">
                  <dt className="font-semibold text-[var(--muted)]">{f.label}</dt>
                  <dd className="text-[var(--ink)] break-words">{formatCell(record[f.key], f.format)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>
      {record && related.map((r) => (
        <OperatorResourcePanel key={r.id} appId={appId} resource={r} getToken={getToken} related={recordKey} onReauth={onReauth}
          actions={contract?.actions.filter((a) => a.resource === r.id) ?? []} />
      ))}
    </div>
  )
}
