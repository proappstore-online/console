import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from './api'
import type { Submission } from './publishTypes'
import { SubmissionCard } from './SubmissionCard'
import { SubmissionForm } from './SubmissionForm'

// Re-exported for existing consumers (e.g. AdminView).
export type { Submission, SubmissionStatus } from './publishTypes'
export { StatusBadge } from './SubmissionCard'

// ---------------------------------------------------------------------------
// PublishView
// ---------------------------------------------------------------------------

interface PublishViewProps {
  getToken: () => string | null
}

export function PublishView({ getToken }: PublishViewProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [prefill, setPrefill] = useState<Submission | null>(null)
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const formRef = useRef<HTMLDivElement | null>(null)

  const refresh = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await apiFetch<{ submissions: Submission[] }>('/submissions', {
        method: 'GET',
        token: getToken(),
      })
      setSubmissions(data.submissions ?? [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load submissions.')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    refresh()
  }, [refresh])

  const cancel = async (id: string) => {
    try {
      await apiFetch<unknown>(`/submissions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        token: getToken(),
      })
      setBanner({ kind: 'success', text: 'Submission cancelled.' })
      await refresh()
    } catch (err) {
      setBanner({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to cancel.' })
    }
  }

  const editAndResubmit = (sub: Submission) => {
    setPrefill(sub)
    setBanner(null)
    // Scroll to form
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  const onSubmitted = async () => {
    setPrefill(null)
    setBanner({ kind: 'success', text: 'Submission received. We will email you when review is complete.' })
    await refresh()
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="display-font text-2xl font-bold text-[var(--ink)]">Publish to Pro</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Submit your app for review. Approved apps get a marketplace listing on{' '}
          <span className="font-mono">proappstore.online</span>.
        </p>
      </div>

      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            banner.kind === 'success'
              ? 'border-[var(--success)]/30 bg-[var(--mint-soft)]/40 text-[var(--success)]'
              : 'border-[var(--error)]/30 bg-[var(--error)]/10 text-[var(--error)]'
          }`}
        >
          {banner.text}
        </div>
      )}

      {/* My submissions */}
      <section>
        <h3 className="display-font text-xl font-bold text-[var(--ink)] mb-4">My submissions</h3>

        {loading ? (
          <div className="space-y-3">
            <div className="h-24 rounded-xl border border-[var(--line)] bg-[var(--panel)] animate-pulse" />
            <div className="h-24 rounded-xl border border-[var(--line)] bg-[var(--panel)] animate-pulse" />
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-[var(--error)]/30 bg-[var(--error)]/10 p-4 text-sm text-[var(--error)]">
            {loadError}
            <button
              onClick={() => { setLoading(true); refresh() }}
              className="ml-3 underline font-semibold"
            >
              Retry
            </button>
          </div>
        ) : submissions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line-strong)] p-8 text-center">
            <p className="text-[var(--muted)]">
              No submissions yet. Use the form below to publish your first pro app.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map((s) => (
              <SubmissionCard
                key={s.id}
                submission={s}
                onCancel={() => cancel(s.id)}
                onEditResubmit={() => editAndResubmit(s)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Submit form */}
      <section ref={formRef}>
        <h3 className="display-font text-xl font-bold text-[var(--ink)] mb-4">
          {prefill ? 'Edit & resubmit' : 'Submit a new app'}
        </h3>
        <SubmissionForm
          getToken={getToken}
          initial={prefill}
          onCancelEdit={() => setPrefill(null)}
          onSubmitted={onSubmitted}
          onError={(text) => setBanner({ kind: 'error', text })}
        />
      </section>
    </div>
  )
}
