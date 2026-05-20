import { useState, useEffect, useCallback, useRef } from 'react'
import type { KeyboardEvent } from 'react'

// ---------------------------------------------------------------------------
// Types — mirror the PAS submissions API contract
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.proappstore.online/v1'

export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'published'

export interface Submission {
  id: string
  app_id: string
  creator_id: string
  status: SubmissionStatus
  name: string
  category: string
  description: string
  icon: string | null
  icon_bg: string | null
  pro_features: string[] | null
  suggested_monthly_price_cents: number | null
  repo_url: string | null
  reviewer_id: string | null
  rejection_reason: string | null
  created_at: string
  reviewed_at: string | null
}

interface SubmissionCreate {
  appId: string
  name: string
  category: string
  description: string
  icon?: string
  iconBg?: string
  proFeatures?: string[]
  suggestedMonthlyPriceCents?: number
  repoUrl?: string
}

const CATEGORIES = [
  'productivity',
  'social',
  'transport',
  'marketplace',
  'utilities',
  'finance',
  'education',
  'entertainment',
  'other',
] as const

const DEFAULT_ICON = '&#128203;'
const DEFAULT_ICON_BG = '#ede9fe'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
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

function validateAppId(value: string): string | null {
  if (!value) return 'App id is required.'
  if (value.length > 58) return 'Max 58 characters.'
  if (!/^[a-z0-9-]+$/.test(value)) return 'Lowercase letters, digits, and hyphens only.'
  if (value.startsWith('-') || value.endsWith('-')) return 'Cannot start or end with a hyphen.'
  return null
}

async function apiFetch<T>(
  path: string,
  init: RequestInit & { token: string | null },
): Promise<T> {
  const { token, headers, ...rest } = init
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
  })
  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  if (!res.ok) {
    const err = new ApiError(res.status, body)
    throw err
  }
  return body as T
}

class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    let message = `Request failed (${status})`
    if (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string') {
      message = (body as { error: string }).error
    } else if (typeof body === 'string' && body) {
      message = body
    }
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

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
            <div className="h-24 rounded-xl border border-[var(--line)] bg-[var(--glass)] animate-pulse" />
            <div className="h-24 rounded-xl border border-[var(--line)] bg-[var(--glass)] animate-pulse" />
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

// ---------------------------------------------------------------------------
// Submission card
// ---------------------------------------------------------------------------

function SubmissionCard({
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
    <div className="rounded-xl border border-[var(--line)] bg-[var(--glass-strong)] p-4 shadow-sm">
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
            className="rounded-lg border border-[var(--line-strong)] bg-[var(--glass)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--glass-hover)] disabled:opacity-50"
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
            className="rounded-lg border border-[var(--line-strong)] bg-[var(--glass)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--glass-hover)]"
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

// ---------------------------------------------------------------------------
// Submission form
// ---------------------------------------------------------------------------

interface FormState {
  appId: string
  name: string
  category: string
  description: string
  icon: string
  iconBg: string
  proFeatures: string[]
  repoUrl: string
}

function emptyForm(): FormState {
  return {
    appId: '',
    name: '',
    category: 'productivity',
    description: '',
    icon: DEFAULT_ICON,
    iconBg: DEFAULT_ICON_BG,
    proFeatures: [],
    repoUrl: '',
  }
}

function fromSubmission(s: Submission): FormState {
  return {
    appId: s.app_id,
    name: s.name,
    category: s.category,
    description: s.description,
    icon: s.icon ?? DEFAULT_ICON,
    iconBg: s.icon_bg ?? DEFAULT_ICON_BG,
    proFeatures: s.pro_features ?? [],
    repoUrl: s.repo_url ?? '',
  }
}

function SubmissionForm({
  getToken,
  initial,
  onCancelEdit,
  onSubmitted,
  onError,
}: {
  getToken: () => string | null
  initial: Submission | null
  onCancelEdit: () => void
  onSubmitted: () => void
  onError: (text: string) => void
}) {
  const [form, setForm] = useState<FormState>(() => (initial ? fromSubmission(initial) : emptyForm()))
  const [appIdTouched, setAppIdTouched] = useState(false)
  const [featureInput, setFeatureInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [appIdError, setAppIdError] = useState<string | null>(null)

  // When the prefill changes (user clicks Edit & resubmit), reset the form.
  useEffect(() => {
    if (initial) {
      setForm(fromSubmission(initial))
      setAppIdTouched(true)
    }
  }, [initial])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const onAppIdChange = (value: string) => {
    const normalized = value.toLowerCase()
    update('appId', normalized)
    setAppIdError(validateAppId(normalized))
  }

  const addFeature = () => {
    const v = featureInput.trim()
    if (!v) return
    if (form.proFeatures.includes(v)) {
      setFeatureInput('')
      return
    }
    update('proFeatures', [...form.proFeatures, v])
    setFeatureInput('')
  }

  const onFeatureKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addFeature()
    } else if (e.key === 'Backspace' && featureInput === '' && form.proFeatures.length > 0) {
      update('proFeatures', form.proFeatures.slice(0, -1))
    }
  }

  const removeFeature = (idx: number) => {
    update('proFeatures', form.proFeatures.filter((_, i) => i !== idx))
  }

  const reset = () => {
    setForm(emptyForm())
    setAppIdTouched(false)
    setAppIdError(null)
    setFeatureInput('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const idError = validateAppId(form.appId)
    setAppIdError(idError)
    setAppIdTouched(true)
    if (idError) return
    if (!form.name.trim()) {
      onError('Name is required.')
      return
    }
    if (!form.description.trim()) {
      onError('Description is required.')
      return
    }
    if (form.description.length > 500) {
      onError('Description must be 500 characters or fewer.')
      return
    }

    const body: SubmissionCreate = {
      appId: form.appId.trim(),
      name: form.name.trim(),
      category: form.category,
      description: form.description.trim(),
    }
    if (form.icon && form.icon !== DEFAULT_ICON) body.icon = form.icon
    else if (form.icon) body.icon = form.icon
    if (form.iconBg) body.iconBg = form.iconBg
    if (form.proFeatures.length > 0) body.proFeatures = form.proFeatures
    if (form.repoUrl.trim()) body.repoUrl = form.repoUrl.trim()

    setSubmitting(true)
    try {
      await apiFetch<Submission>('/submissions', {
        method: 'POST',
        token: getToken(),
        body: JSON.stringify(body),
      })
      reset()
      onSubmitted()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        onError('An app with that id is already pending or published.')
      } else if (err instanceof Error) {
        onError(err.message)
      } else {
        onError('Submission failed.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const descCount = form.description.length
  const descOver = descCount > 500

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-[var(--line)] bg-[var(--glass-strong)] p-6 shadow-[var(--shadow-card)] space-y-5"
    >
      {initial && (
        <div className="flex items-center justify-between rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-xs text-[var(--accent-deep)]">
          <span>Resubmitting after rejection — make changes and submit again.</span>
          <button
            type="button"
            onClick={() => { onCancelEdit(); reset() }}
            className="font-semibold underline"
          >
            Start fresh
          </button>
        </div>
      )}

      {/* App ID */}
      <div>
        <label className="block text-sm font-medium text-[var(--ink)] mb-1">
          App ID <span className="text-[var(--muted)] font-normal">(used as subdomain)</span>
        </label>
        <input
          type="text"
          value={form.appId}
          onChange={(e) => onAppIdChange(e.target.value)}
          onBlur={() => setAppIdTouched(true)}
          maxLength={58}
          placeholder="my-cool-app"
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 font-mono text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          {form.appId
            ? `${form.appId}.proappstore.online`
            : 'Lowercase letters, digits, and hyphens. Max 58 characters.'}
        </p>
        {appIdTouched && appIdError && (
          <p className="mt-1 text-xs text-[var(--error)]">{appIdError}</p>
        )}
      </div>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-[var(--ink)] mb-1">Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          required
          placeholder="My Cool App"
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
        />
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-[var(--ink)] mb-1">Category</label>
        <select
          value={form.category}
          onChange={(e) => update('category', e.target.value)}
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c} className="capitalize">{c}</option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-[var(--ink)] mb-1">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
          rows={3}
          maxLength={600}
          required
          placeholder="What does your app do? Who is it for?"
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
        />
        <p className={`mt-1 text-xs ${descOver ? 'text-[var(--error)]' : 'text-[var(--muted)]'}`}>
          {descCount}/500 characters
        </p>
      </div>

      {/* Pro features chips */}
      <div>
        <label className="block text-sm font-medium text-[var(--ink)] mb-1">
          Pro features <span className="text-[var(--muted)] font-normal">(optional)</span>
        </label>
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1.5 focus-within:ring-2 focus-within:ring-[var(--accent)]/40">
          {form.proFeatures.map((feat, i) => (
            <span
              key={`${feat}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs text-[var(--accent-deep)]"
            >
              {feat}
              <button
                type="button"
                onClick={() => removeFeature(i)}
                aria-label={`Remove ${feat}`}
                className="text-[var(--accent-deep)] hover:opacity-70"
              >
                &times;
              </button>
            </span>
          ))}
          <input
            type="text"
            value={featureInput}
            onChange={(e) => setFeatureInput(e.target.value)}
            onKeyDown={onFeatureKey}
            onBlur={addFeature}
            placeholder={form.proFeatures.length === 0 ? 'Type and press Enter…' : ''}
            className="flex-1 min-w-[8rem] bg-transparent px-1 py-1 text-sm text-[var(--ink)] focus:outline-none"
          />
        </div>
      </div>

      {/* Payouts note — replaces the old per-app price field. ProAppStore is
          all-you-can-use for $9/mo; creators get paid from a monthly pool
          proportional to their app's share of usage. There's no per-app price. */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--paper-soft,var(--paper))] p-3 text-xs text-[var(--muted)]">
        <p>
          <strong className="text-[var(--ink)]">How you get paid:</strong>{' '}
          ProAppStore is a single $9/mo subscription for every Pro app. Each month, after the
          10% platform fee, the rest is split among creators in proportion to how much their
          app was used. You don't set a price — make a great app, and your share follows.{' '}
          <a href="https://proappstore.online/pricing" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--ink)]">
            Full details
          </a>.
        </p>
      </div>

      {/* Repo URL */}
      <div>
        <label className="block text-sm font-medium text-[var(--ink)] mb-1">
          Repo URL <span className="text-[var(--muted)] font-normal">(optional)</span>
        </label>
        <input
          type="url"
          value={form.repoUrl}
          onChange={(e) => update('repoUrl', e.target.value)}
          placeholder="https://github.com/<org>/<repo>"
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 font-mono text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
        />
      </div>

      {/* Icon */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_auto]">
        <div>
          <label className="block text-sm font-medium text-[var(--ink)] mb-1">
            Icon <span className="text-[var(--muted)] font-normal">(HTML entity)</span>
          </label>
          <input
            type="text"
            value={form.icon}
            onChange={(e) => update('icon', e.target.value)}
            placeholder="&#128203;"
            className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 font-mono text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--ink)] mb-1">Icon bg</label>
          <input
            type="color"
            value={form.iconBg}
            onChange={(e) => update('iconBg', e.target.value)}
            className="h-[42px] w-16 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] cursor-pointer"
          />
        </div>
        <div>
          <p className="block text-sm font-medium text-[var(--ink)] mb-1">Preview</p>
          <div
            className="flex h-[42px] w-12 items-center justify-center rounded-lg text-xl"
            style={{ background: form.iconBg }}
            dangerouslySetInnerHTML={{ __html: form.icon || DEFAULT_ICON }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting || !!appIdError || descOver}
          className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : initial ? 'Resubmit for review' : 'Submit for review'}
        </button>
        {(initial || form.appId || form.name || form.description) && (
          <button
            type="button"
            onClick={() => { onCancelEdit(); reset() }}
            className="text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)] underline"
          >
            Reset form
          </button>
        )}
      </div>
    </form>
  )
}
