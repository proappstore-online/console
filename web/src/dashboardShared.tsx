// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

import type { Subscription } from '@proappstore/sdk'

export function PlanBadge({ sub }: { sub: Subscription | null }) {
  const isPro = sub?.status === 'active'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
        isPro
          ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
          : 'bg-[var(--line)] text-[var(--muted)]'
      }`}
    >
      {isPro ? 'Pro' : 'Free'}
    </span>
  )
}

export function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">{label}</p>
      <p className="mt-1 display-font text-2xl font-bold text-[var(--ink)]">{value}</p>
    </div>
  )
}

export function AppStatusBadge({ submissionStatus, hasSubmission }: { submissionStatus?: string | null; hasSubmission?: boolean }) {
  // The apps table only has a row when provisioning succeeded, so by default
  // every entry is "Live." If the dev's latest submission for this app is
  // pending or rejected (e.g. a re-submission for changes), surface that.
  let label: string
  let cls: string
  if (hasSubmission && submissionStatus === 'pending') {
    label = 'In review'
    cls = 'bg-[var(--warning)]/15 text-[var(--warning)]'
  } else if (hasSubmission && submissionStatus === 'rejected') {
    label = 'Rejected'
    cls = 'bg-[var(--error)]/15 text-[var(--error)]'
  } else {
    label = 'Live'
    cls = 'bg-[var(--success)]/15 text-[var(--success)]'
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  )
}

// (The Toggle component lived here. Removed alongside the fake email-
// notifications + weekly-digest controls in Settings — those wired to
// per-user KV but no backend ever read them. Restore from git history
// if a real toggle is wanted.)

export function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}
