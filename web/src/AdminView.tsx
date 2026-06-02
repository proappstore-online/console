import { useState, useEffect, useCallback } from 'react'
import type { Submission } from './PublishView'
import { apiFetch } from './api'
import { type Filter, FILTERS, type ProvisionResult } from './adminTypes'
import { ApproveResultBanner } from './ApproveResultBanner'
import { AdminSubmissionCard } from './AdminSubmissionCard'
import { RejectModal } from './RejectModal'
import { PlatformAnalyticsPanel } from './PlatformAnalyticsPanel'

// ---------------------------------------------------------------------------
// Admin view — submission review queue.
//
// Only mounted when GET /v1/me/is-admin returns { admin: true }. The same
// underlying check (ADMIN_GITHUB_IDS membership) gates approve/reject on the
// backend, so a non-admin who somehow reaches this view still can't do
// anything destructive — the API will 403.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AdminView
// ---------------------------------------------------------------------------

interface AdminViewProps {
  getToken: () => string | null
}

export function AdminView({ getToken }: AdminViewProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [filter, setFilter] = useState<Filter>('pending')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [approveResult, setApproveResult] = useState<{
    submissionId: string
    appId: string
    provision: ProvisionResult | null
  } | null>(null)
  const [rejecting, setRejecting] = useState<Submission | null>(null)

  const refresh = useCallback(async () => {
    setLoadError(null)
    try {
      const qs = filter === 'all' ? '' : `?status=${encodeURIComponent(filter)}`
      const data = await apiFetch<{ submissions: Submission[] }>(`/submissions${qs}`, {
        method: 'GET',
        token: getToken(),
      })
      setSubmissions(data.submissions ?? [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load submissions.')
    } finally {
      setLoading(false)
    }
  }, [filter, getToken])

  useEffect(() => {
    setLoading(true)
    refresh()
  }, [refresh])

  const onApproved = useCallback(
    async (submissionId: string, appId: string, provision: ProvisionResult | null) => {
      setApproveResult({ submissionId, appId, provision })
      await refresh()
    },
    [refresh],
  )

  const onRejected = useCallback(async () => {
    setRejecting(null)
    await refresh()
  }, [refresh])

  return (
    <div className="space-y-6">
      {/* Platform analytics aggregate — admin-only view of cross-app totals.
          Sits above the submissions queue because it's the at-a-glance health
          metric you check first when opening the admin tab. */}
      <PlatformAnalyticsPanel getToken={getToken} />

      <div>
        <h2 className="display-font text-2xl font-bold text-[var(--ink)]">Submissions queue</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Approve or reject pending submissions. Approve provisions the app
          (repo, Pages, DNS, registry) via the FAS admin worker.
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              filter === f.key
                ? 'bg-[var(--accent)] text-white'
                : 'border border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Last approve result */}
      {approveResult && (
        <ApproveResultBanner
          result={approveResult}
          onDismiss={() => setApproveResult(null)}
        />
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          <div className="h-32 rounded-2xl border border-[var(--line)] bg-[var(--panel)] animate-pulse" />
          <div className="h-32 rounded-2xl border border-[var(--line)] bg-[var(--panel)] animate-pulse" />
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-[var(--error)]/30 bg-[var(--error)]/10 p-4 text-sm text-[var(--error)]">
          Couldn't load submissions. {loadError}
          <button
            onClick={() => { setLoading(true); refresh() }}
            className="ml-3 underline font-semibold"
          >
            Retry
          </button>
        </div>
      ) : submissions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--line-strong)] p-12 text-center">
          <p className="text-[var(--muted)]">No submissions with this status.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => (
            <AdminSubmissionCard
              key={s.id}
              submission={s}
              getToken={getToken}
              onApproved={onApproved}
              onRejectClicked={() => setRejecting(s)}
            />
          ))}
        </div>
      )}

      {rejecting && (
        <RejectModal
          submission={rejecting}
          getToken={getToken}
          onClose={() => setRejecting(null)}
          onRejected={onRejected}
        />
      )}
    </div>
  )
}
