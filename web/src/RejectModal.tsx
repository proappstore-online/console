import { useState } from 'react'
import type { Submission } from './PublishView'
import { apiFetch } from './api'

// ---------------------------------------------------------------------------
// Reject modal
// ---------------------------------------------------------------------------

export function RejectModal({
  submission,
  getToken,
  onClose,
  onRejected,
}: {
  submission: Submission
  getToken: () => string | null
  onClose: () => void
  onRejected: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = reason.trim()
    if (trimmed.length < 1) {
      setError('Reason is required.')
      return
    }
    if (trimmed.length > 500) {
      setError('Reason must be 500 characters or fewer.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await apiFetch<unknown>(
        `/submissions/${encodeURIComponent(submission.id)}/reject`,
        {
          method: 'POST',
          token: getToken(),
          body: JSON.stringify({ reason: trimmed }),
        },
      )
      onRejected()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed.')
    } finally {
      setBusy(false)
    }
  }

  const over = reason.length > 500

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6 shadow-2xl"
      >
        <h3 className="display-font text-lg font-bold text-[var(--ink)]">
          Reject submission
        </h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {submission.name} · <span className="font-mono">{submission.app_id}</span>
        </p>

        <label className="mt-4 block text-sm font-medium text-[var(--ink)] mb-1">
          Reason <span className="text-[var(--muted)] font-normal">(visible to creator)</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          required
          maxLength={600}
          autoFocus
          placeholder="Explain what needs to change before resubmission..."
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--error)]/40"
        />
        <p className={`mt-1 text-xs ${over ? 'text-[var(--error)]' : 'text-[var(--muted)]'}`}>
          {reason.length}/500 characters
        </p>

        {error && (
          <p className="mt-2 text-xs text-[var(--error)]">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-1.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--panel-hover)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || over || reason.trim().length === 0}
            className="rounded-lg bg-[var(--error)] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Rejecting...' : 'Reject submission'}
          </button>
        </div>
      </form>
    </div>
  )
}
