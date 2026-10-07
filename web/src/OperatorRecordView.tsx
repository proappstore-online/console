/**
 * One record of a declared operator resource (#240): the resource's declared
 * detail fields, read through the operator record route (owner or a declared
 * admin, platform#293) — only the fields it returned render; for a verification
 * record, its evidence documents and the decisions open from its current
 * state; then every resource declared `related` to it listed for this record
 * (e.g. a member's suspension history, with its row actions). Reached by
 * `#/apps/<slug>/operator/<resource>/<key>`. Values render as text.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  fetchOperatorRecord, runOperatorRowAction, actionAvailable, needsReauth, formatCell, operatorErrorMessage,
  returnedKeys, confirmText, isConflict,
  type OperatorAction, type OperatorContract, type OperatorRow,
} from './operator'
import { OperatorResourcePanel } from './OperatorResourcePanel'
import { OperatorEvidence } from './OperatorEvidence'
import { OperatorStepUp } from './OperatorStepUp'
import { passkeysAvailable, stepUpToken, stepUpWindow } from './passkeyStepUp'

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
  const [notice, setNotice] = useState<string | null>(null)
  const [reauth, setReauth] = useState(false)
  /** The step-up window of the last refusal: a passkey check also satisfies a recent-sign-in requirement. */
  const [stepUpSeconds, setStepUpSeconds] = useState(300)
  const [busy, setBusy] = useState(false)
  // A held passkey step-up session (#244) counts as a recent sign-in for the record and its decisions.
  const operatorToken = useCallback(() => stepUpToken() ?? getToken(), [getToken])
  const [version, setVersion] = useState(0)
  const detail = resource?.detail
  const evidence = detail?.evidence ?? []
  // Verification decisions are taken here, after the evidence has been seen.
  const decisions = resource?.kind === 'verification' && record
    ? (contract?.actions ?? []).filter((a) => a.resource === resourceId && actionAvailable(a, resource, record))
    : []

  useEffect(() => {
    let cancelled = false
    setRecord(null)
    setError(null)
    const token = operatorToken()
    if (!resource || !detail) { setError('This app does not declare a detail page for that record.'); return }
    if (!token) { setError('Your session has expired. Sign in again.'); return }
    fetchOperatorRecord(token, appId, resource.id, recordKey)
      .then((r) => { if (!cancelled) setRecord(r.record) })
      .catch((e) => { if (!cancelled) { setError(operatorErrorMessage(e)); setReauth(needsReauth(e)); setStepUpSeconds(stepUpWindow(e)) } })
    return () => { cancelled = true }
  }, [appId, resource, detail, recordKey, operatorToken, version])

  const decide = async (action: OperatorAction) => {
    const token = operatorToken()
    if (!token || !record || !window.confirm(confirmText(action))) return
    setBusy(true)
    setNotice(null)
    setReauth(false)
    try {
      await runOperatorRowAction(token, appId, action.id, record)
      setNotice(`${action.title}: done.`)
      setVersion((v) => v + 1)
    } catch (e) {
      setNotice(`${action.title}: ${operatorErrorMessage(e)}`)
      setReauth(needsReauth(e))
      setStepUpSeconds(stepUpWindow(e))
      if (isConflict(e)) setVersion((v) => v + 1) // the record moved on: show its current state
    } finally {
      setBusy(false)
    }
  }

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
              {returnedKeys(detail.fields, [record]).filter((f) => !evidence.some((e) => e.field === f.key)).map((f) => (
                <div key={f.key} className="contents">
                  <dt className="font-semibold text-[var(--muted)]">{f.label}</dt>
                  <dd className="text-[var(--ink)] break-words">
                    {(f.key === resource?.status?.column && resource.status.states.find((s) => s.value === record[f.key])?.label) || formatCell(record[f.key], f.format)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {decisions.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {decisions.map((a) => (
                <button key={a.id} type="button" title={a.step_up ? 'Needs a recent sign-in' : undefined}
                  disabled={busy} onClick={() => decide(a)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${a.destructive ? 'border-[var(--error)] text-[var(--error)]' : 'border-[var(--line-strong)] text-[var(--ink)]'}`}>
                  {a.title}
                </button>
              ))}
            </div>
          )}
          {notice && <p className="mt-3 text-sm text-[var(--muted)]">{notice}</p>}
          {reauth && passkeysAvailable() && (
            <OperatorStepUp getToken={getToken} windowSeconds={stepUpSeconds} onReauth={onReauth}
              onVerified={() => { setReauth(false); setNotice(null); setVersion((v) => v + 1) }} />
          )}
          {reauth && onReauth && (
            <button type="button" onClick={onReauth}
              className="mt-2 rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-sm font-medium text-[var(--ink)]">
              Sign in again
            </button>
          )}
        </div>
      </section>
      {record && returnedKeys(evidence.map((e) => ({ ...e, key: e.field })), [record]).length > 0 && (
        <OperatorEvidence appId={appId} resourceId={resourceId} recordKey={recordKey} record={record}
          evidence={returnedKeys(evidence.map((e) => ({ ...e, key: e.field })), [record])} getToken={getToken} onReauth={onReauth} />
      )}
      {record && related.map((r) => (
        <OperatorResourcePanel key={r.id} appId={appId} resource={r} getToken={getToken} related={recordKey} onReauth={onReauth}
          actions={contract?.actions.filter((a) => a.resource === r.id) ?? []} />
      ))}
    </div>
  )
}
