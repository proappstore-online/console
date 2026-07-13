import { useState, useEffect } from 'react'
import type { KeyboardEvent } from 'react'
import { apiFetch, ApiError } from './api'
import type { Submission, SubmissionCreate } from './publishTypes'
import { CATEGORIES, DEFAULT_ICON, DEFAULT_ICON_BG } from './publishTypes'
import { validateAppId } from './publishHelpers'

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

export function SubmissionForm({
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
    if (form.icon) body.icon = form.icon
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
      className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[var(--shadow-card)] space-y-5"
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
            aria-label="Add a Pro feature"
            className="flex-1 min-w-[8rem] bg-transparent px-1 py-1 text-sm text-[var(--ink)] focus:outline-none"
          />
        </div>
      </div>

      {/* Pricing note — replaces the old per-app price field. ProAppStore uses
          one platform subscription, so apps do not set their own price. */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--paper-soft,var(--paper))] p-3 text-xs text-[var(--muted)]">
        <p>
          <strong className="text-[var(--ink)]">Pricing:</strong>{' '}
          ProAppStore uses one $5/mo subscription for every Pro app. Do not add per-app
          checkout, in-app upgrade prompts, or hidden paywalls.{' '}
          <a href="https://proappstore.online/pricing" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--ink)]">
            Pricing details
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
            children={form.icon || DEFAULT_ICON}
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
