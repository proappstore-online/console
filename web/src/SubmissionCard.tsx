import { useState } from 'react'
import type { Submission, SubmissionStatus } from './publishTypes'
import { relativeTime } from './publishHelpers'

// ---------------------------------------------------------------------------
// Submission card
// ---------------------------------------------------------------------------

export function SubmissionCard({
  submission,
  onCancel,
  onEditResubmit,
}: {
  submission: Submission
  onCancel: () => void
  onEditResubmit: () => void
}) {
  const [busy, setBusy] = useState(false)

  const handleCancel = async () => {
    if (!window.confirm('Cancel this submission? You can resubmit later.')) return
    setBusy(true)
    try {
      await onCancel()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={submission.status} />
            <span className="font-semibold text-[var(--ink)]">{submission.name}</span>
            <span className="text-xs text-[var(--muted)]">·</span>
            <span className="text-xs text-[var(--muted)] capitalize">{submission.category}</span>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)] font-mono">{submission.app_id}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Submitted {relativeTime(submission.created_at)}
          </p>
        </div>
      </div>

      {submission.status === 'rejected' && submission.rejection_reason && (
        <div className="mt-3 rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/10 p-3 text-sm text-[var(--error)]">
          <p className="font-semibold mb-1">Rejection reason</p>
          <p>{submission.rejection_reason}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {submission.status === 'pending' && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy}
            className="rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--panel-hover)] disabled:opacity-50"
          >
            {busy ? 'Cancelling...' : 'Cancel submission'}
          </button>
        )}
        {submission.status === 'rejected' && (
          <button
            type="button"
            onClick={onEditResubmit}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Edit & resubmit
          </button>
        )}
        {submission.status === 'published' && (
          <a
            href={`https://${submission.app_id}.proappstore.online`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--panel-hover)]"
          >
            Open {submission.app_id}.proappstore.online &rarr;
          </a>
        )}
      </div>
    </div>
  )
}

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  const styles: Record<SubmissionStatus, string> = {
    pending: 'bg-[var(--warning)]/15 text-[var(--warning)]',
    approved: 'bg-[var(--sky-soft)] text-[var(--sky-deep)]',
    rejected: 'bg-[var(--error)]/15 text-[var(--error)]',
    published: 'bg-[var(--mint-soft)] text-[var(--mint-deep)]',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles[status]}`}
    >
      {status}
    </span>
  )
}
