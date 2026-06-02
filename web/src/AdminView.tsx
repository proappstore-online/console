import { useState, useEffect, useCallback, useMemo } from 'react'
import { StatusBadge } from './PublishView'
import type { Submission, SubmissionStatus } from './PublishView'
import {
  fetchPlatformAnalytics,
  formatViewCount,
  type PlatformAnalyticsResponse,
} from './analytics'
import { apiFetch } from './api'

// ---------------------------------------------------------------------------
// Admin view — submission review queue.
//
// Only mounted when GET /v1/me/is-admin returns { admin: true }. The same
// underlying check (ADMIN_GITHUB_IDS membership) gates approve/reject on the
// backend, so a non-admin who somehow reaches this view still can't do
// anything destructive — the API will 403.
// ---------------------------------------------------------------------------

type Filter = SubmissionStatus | 'all'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'published', label: 'Published' },
  { key: 'all', label: 'All' },
]

interface ProvisionStep {
  name?: string
  step?: string
  status?: string
  ok?: boolean
  detail?: string
  message?: string
  error?: string
}

interface ProvisionResult {
  success?: boolean
  steps?: ProvisionStep[]
  error?: string
  [k: string]: unknown
}

interface ApproveResponse {
  submission: Submission
  provisionResult: ProvisionResult | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string | number): string {
  const then = typeof iso === 'number' ? iso : new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const seconds = Math.round(diffMs / 1000)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const abs = Math.abs(seconds)
  if (abs < 60) return rtf.format(-seconds, 'second')
  const minutes = Math.round(seconds / 60)
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour')
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 30) return rtf.format(-days, 'day')
  const months = Math.round(days / 30)
  if (Math.abs(months) < 12) return rtf.format(-months, 'month')
  const years = Math.round(days / 365)
  return rtf.format(-years, 'year')
}

function shortId(id: string): string {
  // Submission IDs are UUIDv4 — show first 8 chars as a hash-like label.
  return id.length > 8 ? id.slice(0, 8) : id
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1).trimEnd() + '…'
}

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

// ---------------------------------------------------------------------------
// Approve result banner — green success + collapsible provision steps
// ---------------------------------------------------------------------------

function ApproveResultBanner({
  result,
  onDismiss,
}: {
  result: { submissionId: string; appId: string; provision: ProvisionResult | null }
  onDismiss: () => void
}) {
  const [open, setOpen] = useState(true)
  const steps = result.provision?.steps ?? []
  const provisionError = result.provision?.error

  return (
    <div className="rounded-2xl border border-[var(--success)]/30 bg-[var(--mint-soft)]/40 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-[var(--success)]">
            Approved — {result.appId}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)] font-mono">
            {shortId(result.submissionId)}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] underline"
        >
          Dismiss
        </button>
      </div>

      {provisionError && (
        <p className="mt-3 rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/10 p-3 text-xs text-[var(--error)]">
          {provisionError}
        </p>
      )}

      {steps.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-xs font-semibold text-[var(--ink)] underline"
          >
            {open ? 'Hide' : 'Show'} provision steps ({steps.length})
          </button>
          {open && (
            <ul className="mt-2 space-y-1">
              {steps.map((step, i) => (
                <ProvisionStepRow key={i} step={step} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function ProvisionStepRow({ step }: { step: ProvisionStep }) {
  const name = step.name ?? step.step ?? '(unnamed step)'
  const detail = step.detail ?? step.message ?? step.error ?? ''
  const ok =
    step.ok === true ||
    step.status === 'ok' ||
    step.status === 'success' ||
    step.status === 'done'
  const err =
    step.ok === false ||
    step.status === 'error' ||
    step.status === 'failed' ||
    !!step.error
  const warn = !ok && !err && step.status === 'warning'
  const icon = err ? '❌' : warn ? '⚠️' : ok ? '✅' : '•'

  return (
    <li className="flex items-start gap-2 rounded-lg bg-[var(--panel)] px-3 py-1.5 text-xs">
      <span className="leading-5">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="font-semibold text-[var(--ink)]">{name}</span>
        {detail && (
          <span className="ml-2 text-[var(--muted)] break-words">{detail}</span>
        )}
      </span>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Submission card (admin view)
// ---------------------------------------------------------------------------

function AdminSubmissionCard({
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

// ---------------------------------------------------------------------------
// Reject modal
// ---------------------------------------------------------------------------

function RejectModal({
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

// ---------------------------------------------------------------------------
// PlatformAnalyticsPanel — cross-app aggregate. Admin-only by virtue of the
// backend gating (the endpoint 403s for non-admins). We still gracefully
// hide the panel if the fetch fails so a 503-during-deploy doesn't break
// the rest of the admin view.
// ---------------------------------------------------------------------------

function PlatformAnalyticsPanel({ getToken }: { getToken: () => string | null }) {
  const [data, setData] = useState<PlatformAnalyticsResponse | null>(null)
  const [days, setDays] = useState<1 | 7 | 30 | 90>(7)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const token = getToken()
    if (!token) return
    setLoading(true)
    setError(null)
    fetchPlatformAnalytics(token, days)
      .then((r) => { if (!cancelled) setData(r) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [getToken, days])

  // Hide the entire panel if the endpoint isn't responding — the rest of
  // the admin view (submissions queue) is more critical and shouldn't be
  // overshadowed by a noisy error here.
  if (error && !data) return null

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h2 className="display-font text-xl font-bold text-[var(--ink)]">Platform totals</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Aggregated across every app on this backend. Cookieless, no PII.
          </p>
        </div>
        <div className="flex gap-1 text-xs">
          {[1, 7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d as 1 | 7 | 30 | 90)}
              className={`px-2 py-1 rounded ${days === d ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading && !data && (
        <div className="grid grid-cols-3 gap-3">
          <div className="h-20 rounded-xl border border-[var(--line)] bg-[var(--panel)] animate-pulse" />
          <div className="h-20 rounded-xl border border-[var(--line)] bg-[var(--panel)] animate-pulse" />
          <div className="h-20 rounded-xl border border-[var(--line)] bg-[var(--panel)] animate-pulse" />
        </div>
      )}

      {data && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <PlatformKpi label={`Page views (${days === 1 ? '24h' : `${days}d`})`} value={formatViewCount(data.total_views)} />
            <PlatformKpi label="Active apps" value={String(data.active_apps)} />
            <PlatformKpi label="Custom events" value={formatViewCount(data.custom_events)} />
          </div>

          <PlatformSeriesChart series={data.series} bucket={data.bucket} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PlatformRankedList
              title="Top apps"
              rows={data.top_apps.map((r) => ({ label: r.app, value: r.views }))}
              monospace
            />
            <PlatformRankedList
              title="Top countries"
              rows={data.top_countries.map((r) => ({ label: r.country || '—', value: r.views }))}
            />
          </div>
        </div>
      )}
    </section>
  )
}

function PlatformKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">{label}</p>
      <p className="mt-1 display-font text-2xl font-bold text-[var(--ink)]">{value}</p>
    </div>
  )
}

function PlatformSeriesChart({
  series,
  bucket,
}: {
  series: PlatformAnalyticsResponse['series']
  bucket: 'hour' | 'day'
}) {
  if (series.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        No {bucket === 'hour' ? 'hourly' : 'daily'} platform data in this window.
      </p>
    )
  }
  const W = 600
  const H = 100
  const gap = 2
  const slot = W / series.length
  const barW = Math.max(1, slot - gap)
  const maxV = Math.max(1, ...series.map((d) => d.views))
  const labelFor = (t: string) =>
    bucket === 'hour' ? t.slice(11, 16) || t : t.slice(5, 10) || t
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Platform-wide ${bucket}ly page views`}
        className="w-full h-24 block"
      >
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="currentColor" strokeOpacity="0.15" />
        {series.map((d, i) => {
          const h = (d.views / maxV) * (H - 2)
          return (
            <rect
              key={i}
              x={i * slot}
              y={H - h}
              width={barW}
              height={h}
              fill="var(--accent)"
              opacity={d.views > 0 ? 0.85 : 0.2}
            >
              <title>{`${d.t}: ${d.views} view${d.views === 1 ? '' : 's'}`}</title>
            </rect>
          )
        })}
      </svg>
      <div className="flex justify-between mt-1 text-[10px] text-[var(--muted)]">
        <span>{labelFor(series[0]?.t ?? '')}</span>
        <span>peak {maxV}</span>
        <span>{labelFor(series[series.length - 1]?.t ?? '')}</span>
      </div>
    </div>
  )
}

function PlatformRankedList({
  title,
  rows,
  monospace,
}: {
  title: string
  rows: Array<{ label: string; value: number }>
  monospace?: boolean
}) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
        {title}
      </h4>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">No data.</p>
      ) : (
        <ul className="space-y-1">
          {rows.slice(0, 10).map((r, i) => (
            <li key={i} className="text-xs">
              <div className="flex justify-between mb-0.5">
                <span className={`text-[var(--ink)] truncate ${monospace ? 'font-mono' : ''}`}>{r.label}</span>
                <span className="text-[var(--muted)] tabular-nums">{formatViewCount(r.value)}</span>
              </div>
              <div className="h-1 bg-[var(--line)] rounded overflow-hidden">
                <div className="h-1 bg-[var(--accent)]" style={{ width: `${(r.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
