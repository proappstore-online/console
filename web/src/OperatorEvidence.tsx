/**
 * The evidence documents of one verification record (#240). Each is fetched
 * only when the owner or an admin asks, through the platform's evidence route (a recent
 * passkey step-up (#244) and a review role are required there), and shown
 * from an in-memory object URL: images inline, PDFs in a new tab. The URLs are
 * revoked when the page closes. The console never sees or shows a storage path.
 */

import { useState, useEffect } from 'react'
import { fetchOperatorEvidence, operatorErrorMessage, needsPasskey, needsReauth, type OperatorRow } from './operator'
import { OperatorStepUp } from './OperatorStepUp'
import { stepUpToken, stepUpWindow } from './passkeyStepUp'

interface Loaded { url: string; type: string }

export function OperatorEvidence({ appId, resourceId, recordKey, record, evidence, getToken, onReauth }: {
  appId: string
  resourceId: string
  recordKey: string
  record: OperatorRow
  evidence: { field: string; label: string }[]
  getToken: () => string | null
  onReauth?: () => void
}) {
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [reauth, setReauth] = useState(false)
  /** The document a passkey check was asked for, and the window the platform reported. */
  const [passkeyFor, setPasskeyFor] = useState<{ field: string; window: number } | null>(null)

  useEffect(() => () => { for (const d of Object.values(loaded)) URL.revokeObjectURL(d.url) }, [loaded])

  const view = async (field: string) => {
    // A held passkey step-up session opens documents; the plain session is refused with method 'passkey'.
    const token = stepUpToken() ?? getToken()
    if (!token) return
    setErrors((e) => ({ ...e, [field]: '' }))
    try {
      const blob = await fetchOperatorEvidence(token, appId, resourceId, recordKey, field)
      setLoaded((l) => ({ ...l, [field]: { url: URL.createObjectURL(blob), type: blob.type } }))
      setPasskeyFor(null)
    } catch (e) {
      setErrors((x) => ({ ...x, [field]: operatorErrorMessage(e) }))
      if (needsPasskey(e)) setPasskeyFor({ field, window: stepUpWindow(e) })
      else if (needsReauth(e)) setReauth(true)
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <h4 className="display-font text-base font-bold text-[var(--ink)]">Evidence</h4>
      <p className="mt-1 text-sm text-[var(--muted)]">Documents open here only. Every view is recorded.</p>
      <ul className="mt-4 space-y-4">
        {evidence.map(({ field, label }) => {
          const doc = loaded[field]
          return (
            <li key={field}>
              <p className="text-sm font-semibold text-[var(--ink)]">{label}</p>
              {record[field] !== true && <p className="text-sm text-[var(--muted)]">No document on file.</p>}
              {record[field] === true && !doc && (
                <button type="button" onClick={() => view(field)}
                  className="mt-1 rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]">
                  View {label}
                </button>
              )}
              {doc && doc.type.startsWith('image/') && (
                <img src={doc.url} alt={label} className="mt-2 max-h-96 rounded-lg border border-[var(--line)]" />
              )}
              {doc && !doc.type.startsWith('image/') && (
                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm text-[var(--accent)] underline">
                  Open {label} (PDF)
                </a>
              )}
              {errors[field] && <p role="alert" className="mt-1 text-sm text-[var(--error)]">{errors[field]}</p>}
            </li>
          )
        })}
      </ul>
      {passkeyFor && (
        <OperatorStepUp getToken={getToken} windowSeconds={passkeyFor.window} onReauth={onReauth}
          onVerified={() => view(passkeyFor.field)} />
      )}
      {reauth && onReauth && (
        <button type="button" onClick={onReauth}
          className="mt-3 rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-sm font-medium text-[var(--ink)]">
          Sign in again
        </button>
      )}
    </section>
  )
}
