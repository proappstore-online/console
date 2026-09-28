/**
 * Operator view (#240) — the owner's oversight surface for one app they own.
 * The baseline context the platform already has, plus whatever the app
 * declares in its operator-view contract, rendered generically by kind — no
 * per-app code here. Ownership is enforced by the API; this only renders what
 * it returns.
 */

import { useState, useEffect } from 'react'
import { ApiError } from './api'
import { fetchOperatorContext, OPERATOR_KINDS, type OperatorContext } from './operator'
import { formatNumber, formatDuration } from './usage'
import { Kpi } from './sectionPrimitives'
import { OperatorResourcePanel } from './OperatorResourcePanel'

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'Your session has expired. Sign in again to open the operator view.'
    if (e.status === 403) return "Only the app's owner can open the operator view."
    if (e.status === 404) return 'This app is not published yet, so there is nothing to operate.'
  }
  return `Couldn't load the operator view. ${(e as Error).message}`
}

export function OperatorView({ appId, appName, getToken }: {
  appId: string
  appName: string | null
  getToken: () => string | null
}) {
  const [data, setData] = useState<OperatorContext | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const token = getToken()
    setData(null)
    setError(null)
    if (!token) { setError(errorMessage(new ApiError(401, null))); return }
    fetchOperatorContext(token, appId)
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => { if (!cancelled) setError(errorMessage(e)) })
    return () => { cancelled = true }
  }, [appId, getToken])

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2 flex-wrap">
        <h2 className="display-font text-lg font-bold text-[var(--ink)]">{appName ?? appId} — Operator view</h2>
        <span className="rounded-full border border-[var(--line-strong)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">Owner only</span>
      </header>

      {error && <p role="alert" className="text-sm text-[var(--error)]">{error}</p>}
      {!error && !data && <p className="text-sm text-[var(--muted)]">Loading...</p>}

      {data && (
        <>
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="display-font text-base font-bold text-[var(--ink)]">Overview</h3>
              <span className="text-xs text-[var(--muted)]">Last {data.baseline.activity.days} days · signed in as {data.operator.login}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Kpi label="Users with roles" value={formatNumber(data.baseline.usersWithRoles)} />
              <Kpi label="Active users" value={formatNumber(data.baseline.activity.activeUsers)} />
              <Kpi label="Session time" value={formatDuration(data.baseline.activity.sessionSeconds)} />
              <Kpi label="API calls" value={formatNumber(data.baseline.activity.apiCalls)} />
            </div>
          </section>

          <DeclaredPanels appId={appId} data={data} getToken={getToken} />
        </>
      )}
    </div>
  )
}

/** The app's declared resources grouped by kind, each with its row actions. */
function DeclaredPanels({ appId, data, getToken }: {
  appId: string
  data: OperatorContext
  getToken: () => string | null
}) {
  const resources = data.contract?.resources ?? []
  const actions = data.contract?.actions ?? []
  const undeclared = OPERATOR_KINDS.filter((k) => !resources.some((r) => r.kind === k.kind)).map((k) => k.label)

  return (
    <>
      {OPERATOR_KINDS.map(({ kind, label }) => {
        const ofKind = resources.filter((r) => r.kind === kind)
        if (ofKind.length === 0) return null
        return (
          <div key={kind} className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide">{label}</h3>
            {ofKind.map((r) => (
              <OperatorResourcePanel key={r.id} appId={appId} resource={r} getToken={getToken}
                actions={actions.filter((a) => a.resource === r.id)} />
            ))}
          </div>
        )
      })}
      <p className="text-sm text-[var(--muted)]">
        {data.contract
          ? undeclared.length > 0 && <>Not declared by this app: {undeclared.join(', ')}.</>
          : <>This app declares no operator view yet, so only the overview is shown. Declare <code>operator_view</code> in the app's <code>mcp.json</code> to add users, reports, suspensions, ID verification, metrics and account actions here.</>}
      </p>
    </>
  )
}
