import { useCallback, useEffect, useState } from 'react'
import { API_BASE } from './api'

interface ConnectStatus {
  connected: boolean
  stripeAccountId?: string
  chargesEnabled?: boolean
  payoutsEnabled?: boolean
  detailsSubmitted?: boolean
  country?: string | null
  needsAction?: boolean
  updatedAt?: number
}

interface MonthPreview {
  month: string
  isCurrent: boolean
  daysCovered: number
  totalDays: number
  activeUsers: number
  estimatedCents: number
  perApp: { appId: string; estimatedCents: number }[]
}

interface PreviewResponse {
  subscriberPriceCents: number
  platformFeeBps: number
  perSubscriberPoolCents: number
  months: MonthPreview[]
}

async function fetchPreview(token: string | null, months = 2): Promise<PreviewResponse | null> {
  if (!token) return null
  try {
    const res = await fetch(`${API_BASE}/payouts/me/preview?months=${months}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return (await res.json()) as PreviewResponse
  } catch {
    return null
  }
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatMonthLabel(ym: string): string {
  // 'YYYY-MM' → 'May 2026'
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  const d = new Date(Date.UTC(y, m - 1, 1))
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

async function fetchStatus(token: string | null): Promise<ConnectStatus | null> {
  if (!token) return null
  try {
    const res = await fetch(`${API_BASE}/connect/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return (await res.json()) as ConnectStatus
  } catch {
    return null
  }
}

interface OnboardSuccess {
  url: string
  stripeAccountId: string
}

async function startOnboarding(token: string | null): Promise<OnboardSuccess | { error: string }> {
  if (!token) return { error: 'Not signed in.' }
  const here = window.location.href
  try {
    const res = await fetch(`${API_BASE}/connect/onboard`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnUrl: here, refreshUrl: here }),
    })
    if (res.status === 503) {
      return { error: 'Payouts are not yet enabled on this platform. The admin needs to set STRIPE_PRO_MONTHLY_PRICE_ID + the Stripe Connect platform credentials before creators can onboard.' }
    }
    if (!res.ok) {
      const text = await res.text()
      return { error: `Stripe onboarding failed (${res.status}): ${text}` }
    }
    return (await res.json()) as OnboardSuccess
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export function PayoutsView({ getToken }: { getToken: () => string | null }) {
  const [status, setStatus] = useState<ConnectStatus | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [s, p] = await Promise.all([
      fetchStatus(getToken()),
      fetchPreview(getToken(), 2),
    ])
    setStatus(s)
    setPreview(p)
    setLoading(false)
  }, [getToken])

  useEffect(() => {
    refresh()
  }, [refresh])

  const onConnect = async () => {
    setBusy(true)
    setError(null)
    const result = await startOnboarding(getToken())
    if ('error' in result) {
      setError(result.error)
      setBusy(false)
      return
    }
    // Bounce the user to Stripe-hosted onboarding. They come back via the
    // returnUrl, which is just this page — useEffect re-runs and the status
    // refresh picks up the new flags.
    window.location.assign(result.url)
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="display-font text-2xl font-bold text-[var(--ink)]">Payouts</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Link a Stripe account so your monthly creator share can land somewhere.
        </p>
      </div>

      {/* Status card */}
      {loading ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
          <p className="text-sm text-[var(--muted)]">Loading payout status…</p>
        </div>
      ) : (
        <StatusCard status={status} busy={busy} onConnect={onConnect} error={error} onRefresh={refresh} />
      )}

      {/* Earnings preview */}
      {!loading && preview && <EarningsPreview preview={preview} />}

      {/* How payouts work */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
        <h3 className="display-font text-lg font-bold text-[var(--ink)] mb-2">How payouts work</h3>
        <ol className="space-y-2 text-sm text-[var(--muted)] list-decimal list-inside">
          <li>Subscribers pay $9/mo for the whole catalogue. No per-app prices.</li>
          <li>Each month, after the 10% platform fee, the pool is split across creators in proportion to their app's share of subscriber usage (session-minutes + API calls).</li>
          <li>Your share lands in the Stripe account you connect here, around the 1st of the following month.</li>
          <li>You can view + edit your Stripe details at any time via the Stripe Express dashboard linked below once you're connected.</li>
        </ol>
        <p className="text-xs text-[var(--muted)] mt-3">
          Full mechanics:{' '}
          <a href="https://proappstore.online/pricing#for-developers" target="_blank" rel="noopener noreferrer" className="underline text-[var(--accent)]">
            proappstore.online/pricing
          </a>
        </p>
      </div>
    </div>
  )
}

function StatusCard({
  status, busy, onConnect, error, onRefresh,
}: {
  status: ConnectStatus | null
  busy: boolean
  onConnect: () => void
  error: string | null
  onRefresh: () => void
}) {
  if (!status || !status.connected) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3 mb-3">
          <StatusDot color="muted" />
          <h3 className="display-font text-lg font-bold text-[var(--ink)]">Not connected</h3>
        </div>
        <p className="text-sm text-[var(--muted)] mb-4">
          Connect a Stripe account to receive your share of the subscription pool. Stripe handles
          KYC, banking details, and tax forms — the platform never sees them.
        </p>
        <button
          onClick={onConnect}
          disabled={busy}
          className="rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Opening Stripe…' : 'Connect Stripe'}
        </button>
        {error && <p className="mt-3 text-sm text-[var(--error)]">{error}</p>}
      </div>
    )
  }

  if (!status.detailsSubmitted) {
    return (
      <div className="rounded-2xl border border-[var(--warning)]/30 bg-[var(--panel)] p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3 mb-3">
          <StatusDot color="warning" />
          <h3 className="display-font text-lg font-bold text-[var(--ink)]">Setup incomplete</h3>
        </div>
        <p className="text-sm text-[var(--muted)] mb-2">
          You started Stripe onboarding but haven't finished the KYC / bank account steps. You
          won't receive payouts until this is complete.
        </p>
        <p className="text-xs font-mono text-[var(--muted)] mb-4">
          Stripe account: {status.stripeAccountId}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onConnect}
            disabled={busy}
            className="rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Opening Stripe…' : 'Finish setup'}
          </button>
          <button
            onClick={onRefresh}
            className="rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] px-4 py-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--panel-hover)]"
          >
            Refresh status
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-[var(--error)]">{error}</p>}
      </div>
    )
  }

  if (!status.payoutsEnabled) {
    return (
      <div className="rounded-2xl border border-[var(--warning)]/30 bg-[var(--panel)] p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3 mb-3">
          <StatusDot color="warning" />
          <h3 className="display-font text-lg font-bold text-[var(--ink)]">Verification pending</h3>
        </div>
        <p className="text-sm text-[var(--muted)] mb-2">
          Stripe is verifying the details you submitted. This usually takes a few minutes; rarely
          more than a day. You'll be eligible for payouts as soon as it clears.
        </p>
        <p className="text-xs font-mono text-[var(--muted)] mb-4">
          Stripe account: {status.stripeAccountId}
        </p>
        <button
          onClick={onRefresh}
          className="rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] px-4 py-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--panel-hover)]"
        >
          Refresh status
        </button>
      </div>
    )
  }

  // All green.
  return (
    <div className="rounded-2xl border border-[var(--success)]/30 bg-[var(--panel)] p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3 mb-3">
        <StatusDot color="success" />
        <h3 className="display-font text-lg font-bold text-[var(--ink)]">Active</h3>
      </div>
      <p className="text-sm text-[var(--muted)] mb-2">
        Stripe Connect is set up and payouts are enabled. Your share of the subscriber pool will
        land each month, automatically.
      </p>
      <p className="text-xs font-mono text-[var(--muted)] mb-4">
        Stripe account: {status.stripeAccountId}
        {status.country && <> · {status.country}</>}
      </p>
      <div className="flex gap-3">
        <a
          href="https://dashboard.stripe.com/express"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] px-4 py-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--panel-hover)]"
        >
          Open Stripe Express
        </a>
        <button
          onClick={onRefresh}
          className="rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] px-4 py-3 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]"
        >
          Refresh
        </button>
      </div>
    </div>
  )
}

function StatusDot({ color }: { color: 'muted' | 'warning' | 'success' }) {
  const cls =
    color === 'success'
      ? 'bg-[var(--success)]'
      : color === 'warning'
      ? 'bg-[var(--warning)]'
      : 'bg-[var(--muted)]'
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} aria-hidden />
}

function EarningsPreview({ preview }: { preview: PreviewResponse }) {
  const current = preview.months.find((m) => m.isCurrent) ?? preview.months[0]
  const previous = preview.months.find((m) => !m.isCurrent)
  if (!current) return null

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="display-font text-lg font-bold text-[var(--ink)]">Estimated earnings</h3>
        <span className="text-xs text-[var(--muted)]">Preview · not final</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <PreviewMonth
          label={`${formatMonthLabel(current.month)} (so far)`}
          month={current}
          highlight
        />
        {previous && (
          <PreviewMonth label={formatMonthLabel(previous.month)} month={previous} />
        )}
      </div>

      {/* Per-app breakdown (current month, top 5) */}
      {current.perApp.length > 0 && (
        <div className="mt-6">
          <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">
            {formatMonthLabel(current.month)} so far — by app
          </h4>
          <ul className="space-y-1.5">
            {current.perApp.slice(0, 5).map((row) => (
              <li
                key={row.appId}
                className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm"
              >
                <span className="font-mono text-[var(--ink)]">{row.appId}</span>
                <span className="font-semibold text-[var(--ink)]">{formatDollars(row.estimatedCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-5 text-xs text-[var(--muted)] leading-relaxed">
        Estimates assume every active user is a paid subscriber at{' '}
        {formatDollars(preview.subscriberPriceCents)}/mo and the
        {' '}{(preview.platformFeeBps / 100).toFixed(0)}% platform fee. Each subscriber's $
        {(preview.perSubscriberPoolCents / 100).toFixed(2)} contribution to the pool is split
        across the apps they used, weighted by session time. Actual end-of-month payouts will
        only count subscribers who are paid up at the time the cron runs.
      </p>
    </section>
  )
}

function PreviewMonth({
  label,
  month,
  highlight = false,
}: {
  label: string
  month: MonthPreview
  highlight?: boolean
}) {
  const empty = month.estimatedCents === 0
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight
          ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)]/30'
          : 'border-[var(--line)] bg-[var(--panel)]'
      }`}
    >
      <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">{label}</p>
      <p className="mt-1 display-font text-3xl font-bold text-[var(--ink)]">
        {formatDollars(month.estimatedCents)}
      </p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {empty
          ? 'No usage yet'
          : `${month.activeUsers} active user${month.activeUsers === 1 ? '' : 's'} · ${month.daysCovered}/${month.totalDays} days`}
      </p>
    </div>
  )
}
