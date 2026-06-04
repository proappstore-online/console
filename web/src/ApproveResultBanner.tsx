import { useState } from 'react'
import { shortId } from './adminHelpers'
import type { ProvisionResult, ProvisionStep } from './adminTypes'

// ---------------------------------------------------------------------------
// Approve result banner — green success + collapsible provision steps
// ---------------------------------------------------------------------------

export function ApproveResultBanner({
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
              {steps.map((step) => (
                <ProvisionStepRow key={step.name} step={step} />
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
