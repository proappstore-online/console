import { useCallback, useEffect, useState } from 'react'

const API_BASE = 'https://api.proappstore.online/v1'

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
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const next = await fetchStatus(getToken())
    setStatus(next)
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
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--glass-strong)] p-6">
          <p className="text-sm text-[var(--muted)]">Loading payout status…</p>
        </div>
      ) : (
        <StatusCard status={status} busy={busy} onConnect={onConnect} error={error} onRefresh={refresh} />
      )}

      {/* How payouts work */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--glass-strong)] p-6">
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
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--glass-strong)] p-6 shadow-[var(--shadow-card)]">
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
      <div className="rounded-2xl border border-[var(--warning)]/30 bg-[var(--glass-strong)] p-6 shadow-[var(--shadow-card)]">
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
            className="rounded-xl border border-[var(--line-strong)] bg-[var(--glass)] px-4 py-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--glass-hover)]"
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
      <div className="rounded-2xl border border-[var(--warning)]/30 bg-[var(--glass-strong)] p-6 shadow-[var(--shadow-card)]">
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
          className="rounded-xl border border-[var(--line-strong)] bg-[var(--glass)] px-4 py-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--glass-hover)]"
        >
          Refresh status
        </button>
      </div>
    )
  }

  // All green.
  return (
    <div className="rounded-2xl border border-[var(--success)]/30 bg-[var(--glass-strong)] p-6 shadow-[var(--shadow-card)]">
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
          className="rounded-xl border border-[var(--line-strong)] bg-[var(--glass)] px-4 py-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--glass-hover)]"
        >
          Open Stripe Express
        </a>
        <button
          onClick={onRefresh}
          className="rounded-xl border border-[var(--line-strong)] bg-[var(--glass)] px-4 py-3 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]"
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
