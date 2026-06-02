import { useState, useEffect } from "react"
import { fetchAnalyticsDiagnostics, type DiagnosticsResponse } from "./analytics"

/**
 * Live view: polls /v1/apps/:id/analytics/live every 30s and shows a
 * pulsing "X right now" counter + the hottest paths in the last 5 minutes.
 * Renders nothing while loading the first response so we don't flash 0 →
 * real-count on every navigation.
 */
/**
 * Smart empty-state. When `total_views == 0`, we fetch /analytics/diagnostics
 * and render a hint based on the *worst still-actionable* cause. The default
 * "no data yet :)" is a UX dead-end; this turns the empty state into a
 * checklist that tells the creator exactly what to do next.
 *
 * Three rendered shapes, by verdict:
 *   - no_dataset_binding | no_stats_query: platform-side config missing.
 *     Render the deploy checklist; the creator can't fix this, but at least
 *     they know it isn't their app's fault.
 *   - never_seen_event: dataset is bound + queryable, but no event has ever
 *     been written for this app. Most likely the loader script isn't in the
 *     app's HTML. Render the loader URL + a "paste this into <head>" snippet.
 *   - silent_24h: events have been written before but nothing in 24h. App
 *     might be deployed but offline / domain misconfigured / 100% bot
 *     traffic getting dropped server-side.
 *
 * If the diagnostics endpoint itself errors (eg 503 because dataset binding
 * isn't there yet), fall back to the simple "no data yet" message.
 */
export function DiagnosticsHint({
  appId,
  getToken,
  noun,
  windowLabel,
  isCustom,
  kind,
}: {
  appId: string
  getToken: () => string | null
  noun: string
  windowLabel: string
  isCustom: boolean
  kind: string
}) {
  const [diag, setDiag] = useState<DiagnosticsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const token = getToken()
    if (!token) return
    fetchAnalyticsDiagnostics(token, appId)
      .then((r) => { if (!cancelled) setDiag(r) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [appId, getToken])

  // Diagnostics still loading or unavailable — render the simple message.
  if (!diag) {
    return (
      <div className="py-6 text-center space-y-2">
        <p className="text-sm text-[var(--muted)]">
          No {noun} {windowLabel}.{' '}
          {isCustom
            ? `Once your app calls window.pasAnalytics.event("${kind}", ...) and a visitor triggers it, the counts will appear here.`
            : 'Once visitors land on your app, the chart will fill in.'}
        </p>
        {error && (
          <p className="text-xs text-[var(--muted)]">
            (Diagnostics unavailable — usually means the analytics dataset isn't wired in the backend yet.)
          </p>
        )}
      </div>
    )
  }

  if (diag.verdict === 'ok') {
    // Verdict says ok but total_views is 0 — happens when we're viewing a
    // custom-event kind that nobody's fired. Just say so.
    return (
      <p className="text-sm text-[var(--muted)] py-6 text-center">
        No {noun} {windowLabel}.{' '}
        {isCustom
          ? `Once your app calls window.pasAnalytics.event("${kind}", ...) and a visitor triggers it, the counts will appear here.`
          : 'Once visitors land on your app, the chart will fill in.'}
      </p>
    )
  }

  return (
    <div className="py-4 space-y-3">
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <h4 className="text-sm font-semibold text-[var(--ink)] mb-2">
          No {noun} {windowLabel}. Here's why:
        </h4>
        <DiagnosticsBody diag={diag} />
      </div>
    </div>
  )
}

function DiagnosticsBody({ diag }: { diag: DiagnosticsResponse }) {
  const Step = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <li className="flex items-start gap-2 text-sm">
      <span
        aria-label={ok ? 'pass' : 'fail'}
        className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          ok ? 'bg-[var(--success)]/15 text-[var(--success)]' : 'bg-[var(--error)]/15 text-[var(--error)]'
        }`}
      >
        {ok ? '✓' : '✕'}
      </span>
      <span className="text-[var(--ink)]">{children}</span>
    </li>
  )

  if (diag.verdict === 'no_dataset_binding') {
    return (
      <div className="space-y-2">
        <ul className="space-y-1.5">
          <Step ok={diag.checks.dataset_bound}>
            Workers Analytics Engine dataset bound on the backend Worker.
          </Step>
          <Step ok={diag.checks.stats_queryable}>
            CF Analytics SQL API credentials present.
          </Step>
        </ul>
        <p className="text-xs text-[var(--muted)] pt-1">
          Platform-side config — the dashboard can't show numbers until the
          dataset binding is added to <code className="font-mono">wrangler.toml</code>.
          See <code className="font-mono">ANALYTICS-GO-LIVE.md</code> step 3.
        </p>
      </div>
    )
  }

  if (diag.verdict === 'no_stats_query') {
    return (
      <div className="space-y-2">
        <ul className="space-y-1.5">
          <Step ok={true}>Workers Analytics Engine dataset bound.</Step>
          <Step ok={false}>
            CF Analytics SQL API credentials missing — set <code className="font-mono">CF_ACCOUNT_ID</code> + <code className="font-mono">CF_ANALYTICS_API_TOKEN</code> as worker secrets.
          </Step>
        </ul>
      </div>
    )
  }

  if (diag.verdict === 'never_seen_event') {
    return (
      <div className="space-y-3">
        <ul className="space-y-1.5">
          <Step ok={true}>Backend wired (dataset bound + queryable).</Step>
          <Step ok={false}>
            No event has ever been recorded for this app — the loader script is probably missing from your HTML.
          </Step>
        </ul>
        <p className="text-xs text-[var(--muted)]">Paste this into <code className="font-mono">web/index.html</code> &lt;head&gt;:</p>
        <pre className="text-xs font-mono bg-[var(--panel)] p-2 rounded overflow-x-auto">
{`<script src="${diag.loader_url}" defer></script>`}
        </pre>
      </div>
    )
  }

  if (diag.verdict === 'silent_24h') {
    return (
      <div className="space-y-2">
        <ul className="space-y-1.5">
          <Step ok={true}>Loader has fired before (events recorded historically).</Step>
          <Step ok={false}>No events in the last 24 hours.</Step>
        </ul>
        <p className="text-xs text-[var(--muted)]">
          Either the app has no traffic right now, or the loader broke. Open
          your app and check the browser console; or hit the loader URL directly:{' '}
          <a className="font-mono underline" href={diag.loader_url} target="_blank" rel="noreferrer">
            {diag.loader_url}
          </a>
        </p>
      </div>
    )
  }

  return null
}
