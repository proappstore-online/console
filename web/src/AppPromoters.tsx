// Owner view of an app's promoters (console#14). Totals and enable/suspend/review controls are backed by
// platform contracts that are not deployed yet, so by default this reports itself unavailable and offers
// no control that could change anything. Corrections will need a reason, preview and audit trail — never
// direct counter edits — so no counter-editing control exists here.

import { useEffect, useState } from 'react'
import { loadOwnerPromoters, UNAVAILABLE_MESSAGE, type OwnerPromoters, type OwnerPromotersLoader } from './promoterApi'

export function AppPromoters({ appId, load = loadOwnerPromoters }: { appId: string; load?: OwnerPromotersLoader }) {
  const [state, setState] = useState<OwnerPromoters | null>(null)
  const [tries, setTries] = useState(0)

  useEffect(() => {
    let live = true
    setState(null)
    load(appId).then(
      (s) => { if (live) setState(s) },
      (e: unknown) => { if (live) setState({ kind: 'error', message: e instanceof Error ? e.message : 'request failed' }) },
    )
    return () => { live = false }
  }, [appId, load, tries])

  return (
    <section aria-labelledby="promoters-h" className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <h3 id="promoters-h" className="display-font text-lg font-bold text-[var(--ink)]">Promoters</h3>
      {state === null && <p role="status" className="mt-2 text-sm text-[var(--muted)]">Loading…</p>}
      {state?.kind === 'unavailable' && <p role="status" className="mt-2 text-sm text-[var(--muted)]">Unavailable — {UNAVAILABLE_MESSAGE}</p>}
      {state?.kind === 'error' && (
        <div role="alert" className="mt-2 text-sm">
          <p style={{ color: 'var(--error,#dc2626)' }}>Couldn’t load promoters: {state.message}</p>
          <button type="button" onClick={() => setTries((n) => n + 1)} className="mt-2 rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-[var(--ink)]">Retry</button>
        </div>
      )}
      {state?.kind === 'ready' && (
        <div className="mt-2 text-sm text-[var(--muted)]">
          <p>Programme: {state.programme}. {state.totals.promoters} promoters · {state.totals.pending} pending · {state.totals.confirmed} confirmed (as of {new Date(state.totals.asOf).toUTCString()}).</p>
          <p className="mt-1">{state.reviewQueue} referrals awaiting review.</p>
        </div>
      )}
    </section>
  )
}
