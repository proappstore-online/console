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
  const dollars = monthly?.dollars ?? 9

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

      {/* Where your $9 goes — pool model explainer (replaces the old feature
          comparison table, which described feature-gating that doesn't exist
          on PAS). */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
        <h3 className="display-font text-lg font-bold text-[var(--ink)] mb-2">Where your ${dollars} goes</h3>
        <p className="text-sm text-[var(--muted)] mb-4">
          ProAppStore is one subscription for every Pro app — no per-app prices, no in-app upgrades.
          Creators are paid monthly from the subscription pool in proportion to how much each
          subscriber actually used their app.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="text-2xl font-bold text-[var(--ink)]">90%</p>
            <p className="text-xs text-[var(--muted)] mt-1">
              Goes to creators of the apps you used this month, weighted by your usage of each.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="text-2xl font-bold text-[var(--ink)]">10%</p>
            <p className="text-xs text-[var(--muted)] mt-1">
              Platform fee — covers hosting, databases, file storage, real-time, payments.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="text-2xl font-bold text-[var(--ink)]">0</p>
            <p className="text-xs text-[var(--muted)] mt-1">
              Ads. Trackers. Data sold. Per-app paywalls. None of the above.
            </p>
          </div>
        </div>
        <p className="text-xs text-[var(--muted)] mt-4">
          Full mechanics, edge cases, and the math:{' '}
          <a href="https://proappstore.online/pricing" target="_blank" rel="noopener noreferrer" className="underline text-[var(--accent)]">
            proappstore.online/pricing
          </a>
        </p>
      </div>
    </div>
  )
}
