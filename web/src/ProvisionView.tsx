// ---------------------------------------------------------------------------
// Provision an app (platform#368): preview a standard create / reuse /
// untouched-scaffold adoption plan, then explicitly confirm exactly that plan.
// The platform (#367) decides everything; this view only shows what it returns.
// Separate from the storefront review flow (PublishView / SubmissionForm).
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef, type ReactNode } from 'react'
import { ApiError } from './api'
import { validateAppId } from './publishHelpers'
import { APPROVED_TEMPLATES } from './provisioningTemplates'
import {
  createPlan, confirmPlan, fetchOperation, repoUrlFor,
  type ProvisionIntent, type ProvisionPlan, type ProvisionOperation, type ConfirmResponse, type PlanAction, type RevisionSource,
} from './provisioningApi'

interface Draft {
  appId: string
  name: string
  description: string
  template: string
  templateRev: string
}

const EMPTY_DRAFT: Draft = { appId: '', name: '', description: '', template: '', templateRev: '' }
const TEMPLATE_REV_RE = /^[0-9a-f]{7,40}$/
const TERMINAL = new Set(['completed', 'failed', 'exhausted', 'legacy_unreconciled'])

type Errors = Partial<Record<keyof Draft, string>>

function validate(d: Draft): Errors {
  const errors: Errors = {}
  const appId = d.appId.trim()
  const appIdError = validateAppId(appId) ?? (/^[a-z]/.test(appId) ? null : 'Must start with a letter.')
  if (appIdError) errors.appId = appIdError
  if (!d.name.trim()) errors.name = 'Name is required.'
  else if (d.name.trim().length > 80) errors.name = 'Max 80 characters.'
  if (!d.description.trim()) errors.description = 'Description is required.'
  else if (d.description.trim().length > 300) errors.description = 'Max 300 characters.'
  if (!APPROVED_TEMPLATES.some((t) => t.id === d.template)) errors.template = 'Choose an approved template.'
  if (d.templateRev.trim() && !TEMPLATE_REV_RE.test(d.templateRev.trim())) {
    errors.templateRev = '7–40 lowercase hex characters (a git commit id).'
  }
  return errors
}

function toIntent(d: Draft): ProvisionIntent {
  const appId = d.appId.trim()
  const rev = d.templateRev.trim()
  return {
    appId,
    name: d.name.trim(),
    description: d.description.trim(),
    template: d.template,
    repoUrl: repoUrlFor(appId),
    ...(rev ? { templateRev: rev } : {}),
  }
}

/** A plan on screen. `planId` is null when the plan is display-only (a fresh plan
 *  returned by a refused confirmation): it was never stored, so it cannot be confirmed. */
interface Shown {
  planId: string | null
  expiresAt: number | null
  plan: ProvisionPlan
}

type Tracked = ProvisionOperation & Partial<Pick<ConfirmResponse, 'joined' | 'error' | 'log'>>

const ACTION_LABELS: Record<PlanAction, string> = {
  create: 'Create a new app and repository',
  reuse_owned: 'Reuse your existing app',
  reuse_admin: 'Reuse the app as a platform admin',
  adopt_untouched: 'Adopt an untouched template scaffold',
  refused: 'Refused',
}

const SOURCE_LABELS: Record<RevisionSource, string> = {
  template_head: 'template head, read again just before the copy',
  scaffold_tree_match: 'proven: the scaffold matches this template commit',
  unknown: 'unknown — not proven',
}

const APP_RECORD_LABELS: Record<ProvisionPlan['appRecord'], string> = {
  none: 'No app record yet',
  owner: 'Yours',
  other: 'Belongs to another account',
  unknown: 'Could not be checked',
}

function previewErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 400) return `The platform refused this preview: ${err.message}`
    if (err.status === 401) return 'Your session has expired. Sign in again, then preview.'
    return `Preview unavailable (${err.message}). Nothing was changed. Try again.`
  }
  return `Preview unavailable (${err instanceof Error ? err.message : 'network error'}). Nothing was changed. Try again.`
}

const inputClass =
  'w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 disabled:opacity-60'
const labelClass = 'block text-sm font-medium text-[var(--ink)] mb-1'
const primaryButton =
  'w-full sm:w-auto rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40'
const secondaryButton =
  'w-full sm:w-auto rounded-xl border border-[var(--line-strong)] px-4 py-2.5 text-sm font-medium text-[var(--ink)] hover:border-[var(--accent)] disabled:opacity-50'

export function ProvisionView({
  getToken,
  onOpenApp,
  pollIntervalMs = 3000,
}: {
  getToken: () => string | null
  onOpenApp?: (appId: string) => void
  pollIntervalMs?: number
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [showErrors, setShowErrors] = useState(false)
  const [shown, setShown] = useState<Shown | null>(null)
  const [expiredPlanId, setExpiredPlanId] = useState<string | null>(null)
  const [busy, setBusy] = useState<'preview' | 'confirm' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [operation, setOperation] = useState<Tracked | null>(null)
  const [pollError, setPollError] = useState<string | null>(null)
  const [pollTick, setPollTick] = useState(0)

  // Every draft edit, reset and unmount bumps the generation: a response that
  // comes back for an older generation is dropped, never shown or acted on.
  const generation = useRef(0)
  // Synchronous guard so a double click sends one request, not two.
  const inFlight = useRef(false)
  const planHeading = useRef<HTMLHeadingElement | null>(null)

  useEffect(() => () => { generation.current += 1 }, [])

  const errors = validate(draft)
  const locked = busy === 'confirm' || operation !== null
  const expired = shown?.planId != null && expiredPlanId === shown.planId

  const edit = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    generation.current += 1
    inFlight.current = false
    setBusy(null)
    setError(null)
    if (shown) setNotice('You changed the draft, so the previous preview no longer applies. Preview again before confirming.')
    setShown(null)
  }

  const preview = async () => {
    if (inFlight.current || locked) return
    setShowErrors(true)
    if (Object.keys(validate(draft)).length > 0) return
    const gen = ++generation.current
    inFlight.current = true
    setBusy('preview')
    setError(null)
    setNotice(null)
    try {
      const res = await createPlan(getToken(), toIntent(draft))
      if (gen !== generation.current) return
      setShown({ planId: res.planId, expiresAt: res.expiresAt, plan: res.plan })
      setTimeout(() => planHeading.current?.focus(), 0)
    } catch (err) {
      if (gen !== generation.current) return
      setShown(null)
      setError(previewErrorText(err))
    } finally {
      if (gen === generation.current) {
        inFlight.current = false
        setBusy(null)
      }
    }
  }

  const confirm = async () => {
    if (inFlight.current || !shown?.planId || expired || shown.plan.blockers.length > 0 || shown.plan.action === 'refused') return
    if (shown.expiresAt !== null && Date.now() >= shown.expiresAt) {
      setExpiredPlanId(shown.planId)
      return
    }
    const gen = generation.current
    const planId = shown.planId
    inFlight.current = true
    setBusy('confirm')
    setError(null)
    setNotice(null)
    try {
      const res = await confirmPlan(getToken(), planId)
      if (gen !== generation.current) return
      setOperation(res)
    } catch (err) {
      if (gen !== generation.current) return
      const body = err instanceof ApiError ? (err.body as { plan?: ProvisionPlan } | null) : null
      const status = err instanceof ApiError ? err.status : 0
      if (status === 409 || status === 422) {
        // The fresh plan was not stored: it is shown for review only. Confirming
        // needs a new stored preview, so the old plan id is dropped here.
        setShown(body?.plan ? { planId: null, expiresAt: null, plan: body.plan } : null)
        setNotice(status === 409
          ? 'The plan changed since your preview, so nothing ran. Review the current plan below, then preview again to get a plan you can confirm.'
          : 'The platform blocked this plan, so nothing ran. Review the blockers below.')
      } else if (status === 410) {
        setShown(null)
        setNotice('This preview expired before it was confirmed, so nothing ran. Preview again.')
      } else if (status === 404) {
        setShown(null)
        setNotice('That preview is no longer available, so nothing ran. Preview again.')
      } else {
        // A 503 or a dropped connection does not prove nothing ran: the platform
        // answers 503 when its call to the workflow fails in transit, which can
        // be after the workflow received it. Report the outcome as unknown.
        const message = err instanceof Error ? err.message : 'network error'
        setError(`Provisioning was unavailable (${message}); the outcome is unknown — it may have started. Retry confirms the same plan; if it already started, the retry joins that operation instead of starting another.`)
      }
    } finally {
      if (gen === generation.current) {
        inFlight.current = false
        setBusy(null)
      }
    }
  }

  // The preview stops being confirmable when it expires.
  useEffect(() => {
    if (!shown?.planId || shown.expiresAt === null) return
    const planId = shown.planId
    const timer = setTimeout(() => setExpiredPlanId(planId), Math.max(0, shown.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [shown])

  // Poll the durable receipt until it is terminal.
  useEffect(() => {
    if (!operation || TERMINAL.has(operation.status)) return
    const gen = generation.current
    const appId = operation.appId
    const timer = setTimeout(async () => {
      try {
        const op = await fetchOperation(getToken(), appId)
        if (gen !== generation.current) return
        setPollError(null)
        setOperation((prev) => ({ ...prev, ...op }))
      } catch (err) {
        if (gen !== generation.current) return
        setPollError(`Could not refresh progress (${err instanceof Error ? err.message : 'network error'}). Still checking.`)
        setPollTick((t) => t + 1)
      }
    }, pollIntervalMs)
    return () => clearTimeout(timer)
    // getToken is read when the timer fires; App passes a fresh closure each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operation, pollTick, pollIntervalMs])

  const reviewAgain = () => {
    generation.current += 1
    setOperation(null)
    setPollError(null)
    setShown(null)
    setNotice('Preview again to retry. A new confirmation for this app joins its existing provisioning receipt.')
  }

  const startOver = () => {
    generation.current += 1
    inFlight.current = false
    setDraft(EMPTY_DRAFT)
    setShowErrors(false)
    setShown(null)
    setBusy(null)
    setError(null)
    setNotice(null)
    setOperation(null)
    setPollError(null)
  }

  const fieldError = (key: keyof Draft) => (showErrors ? errors[key] : undefined)
  const appIdValue = draft.appId.trim()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="display-font text-2xl font-bold text-[var(--ink)]">Provision an app</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Create a Pro app from an approved template, reuse one you own, or adopt an untouched scaffold. Preview the plan
          first — nothing changes until you confirm it. Publishing to the storefront is a separate step under Publish.
        </p>
      </div>

      <form
        aria-label="Provisioning draft"
        noValidate
        onSubmit={(e) => { e.preventDefault(); void preview() }}
        className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6 shadow-[var(--shadow-card)] space-y-5"
      >
        <fieldset disabled={locked} className="space-y-5 min-w-0">
          <div className="min-w-0">
            <label htmlFor="prov-app-id" className={labelClass}>App id</label>
            <input
              id="prov-app-id"
              type="text"
              value={draft.appId}
              onChange={(e) => edit('appId', e.target.value.toLowerCase())}
              maxLength={58}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!!fieldError('appId')}
              aria-describedby="prov-app-id-hint prov-app-id-error"
              className={inputClass + ' font-mono'}
            />
            <p id="prov-app-id-hint" className="mt-1 text-xs text-[var(--muted)] break-all">
              Repository: <span className="font-mono">{appIdValue ? repoUrlFor(appIdValue) : `https://github.com/proappstore-online/<app id>`}</span>
            </p>
            <FieldError id="prov-app-id-error" error={fieldError('appId')} />
          </div>

          <div className="min-w-0">
            <label htmlFor="prov-name" className={labelClass}>Name</label>
            <input
              id="prov-name"
              type="text"
              value={draft.name}
              onChange={(e) => edit('name', e.target.value)}
              maxLength={80}
              aria-invalid={!!fieldError('name')}
              aria-describedby="prov-name-error"
              className={inputClass}
            />
            <FieldError id="prov-name-error" error={fieldError('name')} />
          </div>

          <div className="min-w-0">
            <label htmlFor="prov-description" className={labelClass}>Description</label>
            <textarea
              id="prov-description"
              value={draft.description}
              onChange={(e) => edit('description', e.target.value)}
              maxLength={300}
              rows={3}
              aria-invalid={!!fieldError('description')}
              aria-describedby="prov-description-error"
              className={inputClass}
            />
            <FieldError id="prov-description-error" error={fieldError('description')} />
          </div>

          <fieldset aria-describedby="prov-template-error" className="min-w-0">
            <legend className={labelClass}>Template</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {APPROVED_TEMPLATES.map((t) => (
                <label
                  key={t.id}
                  className={'flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5 ' +
                    (draft.template === t.id ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)]')}
                >
                  <input
                    type="radio"
                    name="prov-template"
                    value={t.id}
                    checked={draft.template === t.id}
                    onChange={() => edit('template', t.id)}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[var(--ink)]">{t.title}</span>
                    <span className="block text-xs font-mono text-[var(--muted)] break-all">{t.id}</span>
                    <span className="block text-xs text-[var(--muted)]">{t.summary}</span>
                  </span>
                </label>
              ))}
            </div>
            <FieldError id="prov-template-error" error={fieldError('template')} />
          </fieldset>

          <div className="min-w-0">
            <label htmlFor="prov-template-rev" className={labelClass}>Template revision (optional)</label>
            <input
              id="prov-template-rev"
              type="text"
              value={draft.templateRev}
              onChange={(e) => edit('templateRev', e.target.value)}
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!!fieldError('templateRev')}
              aria-describedby="prov-template-rev-hint prov-template-rev-error"
              className={inputClass + ' font-mono'}
            />
            <p id="prov-template-rev-hint" className="mt-1 text-xs text-[var(--muted)]">
              A specific template commit. The platform either proves it or blocks the plan.
            </p>
            <FieldError id="prov-template-rev-error" error={fieldError('templateRev')} />
          </div>
        </fieldset>

        <button type="submit" aria-label={busy === 'preview' ? 'Previewing…' : 'Preview plan'} disabled={locked || busy === 'preview'} className={primaryButton}>
          {busy === 'preview' ? 'Previewing…' : 'Preview plan'}
        </button>
      </form>

      {notice && (
        <p role="status" className="rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)]">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-[var(--error)]/30 bg-[var(--error)]/10 px-4 py-3 text-sm text-[var(--error)]">
          {error}
        </p>
      )}

      {shown && (
        <section aria-labelledby="prov-plan-heading" className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6 space-y-4">
          <h3 id="prov-plan-heading" ref={planHeading} tabIndex={-1} className="display-font text-xl font-bold text-[var(--ink)] focus:outline-none">
            {shown.planId ? 'Plan to confirm' : 'Current plan (preview again to confirm)'}
          </h3>
          <PlanDetails plan={shown.plan} expiresAt={shown.expiresAt} expired={expired} />

          {!operation && (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              {shown.planId && !expired ? (
                <button
                  type="button"
                  aria-label={busy === 'confirm' ? 'Confirming…' : 'Confirm and provision'}
                  onClick={() => void confirm()}
                  disabled={busy !== null || shown.plan.blockers.length > 0 || shown.plan.action === 'refused'}
                  aria-describedby="prov-confirm-hint"
                  className={primaryButton}
                >
                  {busy === 'confirm' ? 'Confirming…' : 'Confirm and provision'}
                </button>
              ) : (
                <button type="button" onClick={() => void preview()} disabled={busy !== null} className={secondaryButton}>
                  Preview again
                </button>
              )}
              <p id="prov-confirm-hint" className="text-xs text-[var(--muted)]">
                {expired
                  ? 'This preview expired. Preview again to get a plan you can confirm.'
                  : !shown.planId
                    ? 'This plan cannot be confirmed as shown.'
                    : shown.plan.blockers.length > 0 || shown.plan.action === 'refused'
                      ? 'This plan has blockers and cannot be confirmed.'
                      : 'Confirming runs exactly this plan, once.'}
              </p>
            </div>
          )}
        </section>
      )}

      {operation && (
        <OperationPanel
          operation={operation}
          repoUrl={shown?.plan.repository.url ?? repoUrlFor(operation.appId)}
          pollError={pollError}
          onReviewAgain={reviewAgain}
          onStartOver={startOver}
          onOpenApp={onOpenApp}
        />
      )}
    </div>
  )
}

function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? <p id={id} className="mt-1 text-xs text-[var(--error)]">{error}</p> : null
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 border-b border-[var(--line)] last:border-0 sm:grid-cols-[10rem_1fr] sm:gap-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</dt>
      <dd className="min-w-0 text-sm text-[var(--ink)] break-words">{children}</dd>
    </div>
  )
}

function PlanDetails({ plan, expiresAt, expired }: { plan: ProvisionPlan; expiresAt: number | null; expired: boolean }) {
  const repo = plan.repository
  const exists = repo.exists === true ? 'Exists' : repo.exists === false ? 'Does not exist yet' : 'Could not be read'
  const visibility = repo.private === true ? 'private' : repo.private === false ? 'public' : 'not shown'
  const t = plan.template
  return (
    <div className="space-y-4">
      <dl className="rounded-xl border border-[var(--line)] px-3">
        <Row label="Action">
          <span className={plan.action === 'refused' ? 'font-semibold text-[var(--error)]' : 'font-semibold'}>{ACTION_LABELS[plan.action] ?? plan.action}</span>
        </Row>
        <Row label="Repository">
          <span className="font-mono break-all">{repo.url}</span>
          <span className="block text-xs text-[var(--muted)]">{exists} · visibility {visibility}</span>
        </Row>
        <Row label="App record">{APP_RECORD_LABELS[plan.appRecord] ?? plan.appRecord}</Row>
        <Row label="Template">
          <span className="font-mono">{t.id}</span>
          <span className="block text-xs text-[var(--muted)] break-all">{t.repo}@{t.ref} · {t.status}</span>
          {t.status !== 'approved' && <span className="block text-xs text-[var(--error)]">This template is {t.status}, not approved.</span>}
        </Row>
        <Row label="Source revision">
          <span className="font-mono break-all">{t.revision ?? 'unknown'}</span>
          <span className="block text-xs text-[var(--muted)]">{SOURCE_LABELS[t.revisionSource] ?? t.revisionSource}</span>
        </Row>
        {t.requestedRevision && (
          <Row label="Requested revision"><span className="font-mono break-all">{t.requestedRevision}</span></Row>
        )}
        <Row label="Reviewed commit"><span className="font-mono break-all">{t.reviewedCommit ?? 'none recorded'}</span></Row>
        <Row label="Compliance">
          {plan.compliance.required ? 'Required: the normal compliance checks run before the app goes live.' : 'Not required by this plan.'}
        </Row>
        {expiresAt !== null && (
          <Row label="Preview expires">
            <span className={expired ? 'text-[var(--error)]' : ''}>
              {expired ? 'Expired' : new Date(expiresAt).toLocaleTimeString()}
            </span>
          </Row>
        )}
      </dl>

      {plan.changes.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-[var(--ink)] mb-1">Proposed changes</h4>
          <ul className="list-disc pl-5 space-y-0.5 text-sm text-[var(--ink)]">
            {plan.changes.map((c, i) => <li key={i} className="break-words">{c}</li>)}
          </ul>
        </div>
      )}
      {plan.blockers.length > 0 && (
        <div className="rounded-xl border border-[var(--error)]/30 bg-[var(--error)]/10 p-3">
          <h4 className="text-sm font-semibold text-[var(--error)] mb-1">Blockers</h4>
          <ul className="space-y-1 text-sm text-[var(--error)]">
            {plan.blockers.map((b) => (
              <li key={b.code + b.message} className="break-words"><span className="font-mono">{b.code}</span>: {b.message}</li>
            ))}
          </ul>
        </div>
      )}
      {plan.warnings.length > 0 && (
        <div className="rounded-xl border border-[var(--line-strong)] p-3">
          <h4 className="text-sm font-semibold text-[var(--ink)] mb-1">Warnings</h4>
          <ul className="list-disc pl-5 space-y-0.5 text-sm text-[var(--muted)]">
            {plan.warnings.map((w, i) => <li key={i} className="break-words">{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

const STEP_LABELS: Record<string, string> = { ok: 'done', skip: 'skipped', fail: 'failed', pending: 'pending' }

function operationSummary(op: Tracked): { text: string; tone: 'ok' | 'error' | 'muted' } {
  const host = op.steps.find((s) => s.name === 'host')
  switch (op.status) {
    case 'completed':
      return host?.status === 'ok'
        ? { text: 'Live: provisioning completed and the app responds.', tone: 'ok' }
        : { text: 'Provisioned, not live yet: the first deploy has not served.', tone: 'muted' }
    case 'failed':
      return { text: `Failed${op.error || op.result?.error ? `: ${op.error ?? op.result?.error}` : ''}. The steps below show how far it got.`, tone: 'error' }
    case 'exhausted':
      return { text: 'Stopped: the maximum number of attempts was reached.', tone: 'error' }
    case 'legacy_unreconciled':
      return { text: 'Recorded by an older flow and not reconciled yet. The platform has to reconcile it.', tone: 'error' }
    default:
      return { text: 'In progress. This page checks again every few seconds.', tone: 'muted' }
  }
}

function OperationPanel({
  operation, repoUrl, pollError, onReviewAgain, onStartOver, onOpenApp,
}: {
  operation: Tracked
  repoUrl: string
  pollError: string | null
  onReviewAgain: () => void
  onStartOver: () => void
  onOpenApp?: (appId: string) => void
}) {
  const summary = operationSummary(operation)
  const terminal = TERMINAL.has(operation.status)
  const appUrl = typeof operation.result?.appUrl === 'string' && operation.result.appUrl.startsWith('https://') ? operation.result.appUrl : null
  const toneClass = summary.tone === 'ok' ? 'text-[var(--success)]' : summary.tone === 'error' ? 'text-[var(--error)]' : 'text-[var(--ink)]'
  return (
    <section aria-labelledby="prov-op-heading" className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6 space-y-4">
      <h3 id="prov-op-heading" className="display-font text-xl font-bold text-[var(--ink)]">Provisioning {operation.appId}</h3>
      <p role="status" aria-live="polite" className={`text-sm font-semibold ${toneClass}`}>{summary.text}</p>
      <p className="text-xs text-[var(--muted)] break-all">
        Receipt: <span className="font-mono">{operation.receipt ?? 'being acquired'}</span>
        {operation.joined ? ' · joined an operation that had already started' : ''}
      </p>
      {pollError && <p className="text-xs text-[var(--error)]">{pollError}</p>}

      {operation.steps.length > 0 && (
        <ol aria-label="Provisioning steps" className="space-y-1">
          {operation.steps.map((s) => (
            <li key={s.name} className="flex flex-wrap items-baseline gap-x-2 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs">
              <span className="font-semibold text-[var(--ink)]">{s.name}</span>
              <span className={s.status === 'fail' ? 'text-[var(--error)]' : s.status === 'ok' ? 'text-[var(--success)]' : 'text-[var(--muted)]'}>
                {STEP_LABELS[s.status] ?? s.status}
              </span>
              {s.detail && <span className="min-w-0 text-[var(--muted)] break-words">{s.detail}</span>}
            </li>
          ))}
        </ol>
      )}

      {operation.log && operation.log.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-[var(--muted)]">Workflow log</summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--paper)] p-2">{operation.log.join('\n')}</pre>
        </details>
      )}

      <dl className="rounded-xl border border-[var(--line)] px-3">
        <Row label="Repository"><a href={repoUrl} target="_blank" rel="noopener noreferrer" className="font-mono break-all underline">{repoUrl}</a></Row>
        {appUrl && <Row label="Live site"><a href={appUrl} target="_blank" rel="noopener noreferrer" className="font-mono break-all underline">{appUrl}</a></Row>}
        {typeof operation.result?.dataWorkerUrl === 'string' && (
          <Row label="Data API"><span className="font-mono break-all">{operation.result.dataWorkerUrl}</span></Row>
        )}
      </dl>

      {terminal && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {operation.status === 'completed' && onOpenApp && (
            <button type="button" onClick={() => onOpenApp(operation.appId)} className={primaryButton}>Open in console</button>
          )}
          {operation.status === 'failed' && (
            <button type="button" onClick={onReviewAgain} className={primaryButton}>Preview again to retry</button>
          )}
          <button type="button" onClick={onStartOver} className={secondaryButton}>Provision another app</button>
        </div>
      )}
    </section>
  )
}
