// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

import { useState, useEffect } from 'react'
import type { Subscription } from '@proappstore/sdk'
import { pro } from './sdk'
import { fetchPricing, type Pricing } from './appsApi'
import { PlanBadge } from './dashboardShared'

export function SubscriptionView() {
  const [sub, setSub] = useState<Subscription | null>(null)
  const [pricing, setPricing] = useState<Pricing | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      pro.subscription.status().catch(() => null),
      fetchPricing(),
    ])
      .then(([s, p]) => {
        if (cancelled) return
        setSub(s)
        setPricing(p)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <p className="text-[var(--muted)] py-12 text-center">Loading subscription...</p>
  }

  const isPro = sub?.status === 'active'
  const monthly = pricing?.proMonthly
  const dollars = monthly?.dollars ?? 5

  return (
    <div className="space-y-8">
      <h2 className="display-font text-2xl font-bold text-[var(--ink)]">Subscription</h2>

      {/* Current plan */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3 mb-4">
          <PlanBadge sub={sub} />
          <span className="text-sm text-[var(--muted)]">Current plan</span>
        </div>

        {isPro && sub ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--ink)]">
              Your Pro subscription is active.
              {sub.cancelAtPeriodEnd && ' It will not renew after the current period.'}
            </p>
            <p className="text-sm text-[var(--muted)]">
              Renewal: {new Date(sub.currentPeriodEnd).toLocaleDateString()}
            </p>
            <button
              onClick={() => pro.subscription.openPortal(window.location.href)}
              className="rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--panel-hover)]"
            >
              Manage Billing
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              {monthly
                ? `One subscription unlocks every Pro app on the platform — $${dollars}/mo, cancel anytime.`
                : "Pro subscriptions aren't configured on this platform yet. Check back soon."}
            </p>
            <button
              disabled={!monthly}
              onClick={() => {
                if (!monthly) return
                pro.subscription.openCheckout({
                  priceId: monthly.priceId,
                  successUrl: window.location.href,
                  cancelUrl: window.location.href,
                })
              }}
              className="rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {monthly ? `Upgrade to Pro — $${dollars}/mo` : 'Upgrade unavailable'}
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
