import { useState, useMemo } from 'react'
import { StatusBadge } from './PublishView'
import type { Submission } from './PublishView'
import { apiFetch } from './api'
import { relativeTime, shortId, truncate } from './adminHelpers'
import type { ApproveResponse, ProvisionResult } from './adminTypes'

// ---------------------------------------------------------------------------
// Submission card (admin view)
// ---------------------------------------------------------------------------

export function AdminSubmissionCard({
  submission,
  getToken,
  onApproved,
  onRejectClicked,
}: {
  submission: Submission
  getToken: () => string | null
  onApproved: (submissionId: string, appId: string, provision: ProvisionResult | null) => void
  onRejectClicked: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const proFeatures = submission.pro_features ?? []
  const desc = truncate(submission.description ?? '', 200)
  const submittedAt = useMemo(() => relativeTime(submission.created_at), [submission.created_at])
  const reviewedAt = submission.reviewed_at
    ? relativeTime(submission.reviewed_at)
    : null

  const approve = async () => {
    if (!window.confirm(`Approve ${submission.app_id}? This provisions the app.`)) return
    setError(null)
    setBusy(true)
    try {
      const data = await apiFetch<ApproveResponse>(
        `/submissions/${encodeURIComponent(submission.id)}/approve`,
        { method: 'POST', token: getToken(), body: JSON.stringify({}) },
      )
      onApproved(data.submission.id, data.submission.app_id, data.provisionResult ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3">
        {/* Icon preview */}
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
          style={{ background: submission.icon_bg ?? '#ede9fe' }}
          children={submission.icon || '\u{1F4CB}'}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={submission.status} />
            <span className="font-semibold text-[var(--ink)]">{submission.name}</span>
            <span className="text-xs text-[var(--muted)]">·</span>
            <span className="text-xs text-[var(--muted)] capitalize">{submission.category}</span>
          </div>

          <p className="mt-1 text-xs text-[var(--muted)] font-mono">
            {shortId(submission.id)} · {submission.app_id}
          </p>

          <p className="mt-2 text-sm text-[var(--ink)]">{desc}</p>

          {proFeatures.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {proFeatures.map((feat, i) => (
                <span
                  key={`${feat}-${i}`}
                  className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-deep)]"
                >
                  {feat}
                </span>
              ))}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
            <span className="font-mono">{submission.creator_id}</span>
            <span>·</span>
            <span>Submitted {submittedAt}</span>
            {submission.repo_url && (
              <>
                <span>·</span>
                <a
                  href={submission.repo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-[var(--ink)]"
                >
                  Repo &rarr;
                </a>
              </>
            )}
          </div>

          {/* Non-pending: read-only review trail */}
          {submission.status !== 'pending' && (
            <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 text-xs">
              <p className="text-[var(--muted)]">
                Reviewed by{' '}
                <span className="font-mono text-[var(--ink)]">
                  {submission.reviewer_id ?? '—'}
                </span>
                {reviewedAt && <> {reviewedAt}</>}
              </p>
              {submission.rejection_reason && (
                <p className="mt-1 text-[var(--error)]">
                  <span className="font-semibold">Reason:</span> {submission.rejection_reason}
                </p>
              )}
            </div>
          )}

          {/* Pending: approve/reject */}
          {submission.status === 'pending' && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={approve}
                disabled={busy}
                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? 'Approving...' : 'Approve'}
              </button>
              <button
                type="button"
                onClick={onRejectClicked}
                disabled={busy}
                className="rounded-lg border border-[var(--error)]/40 bg-[var(--error)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--error)] hover:bg-[var(--error)]/20 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          )}

          {error && (
            <p className="mt-2 text-xs text-[var(--error)]">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}
