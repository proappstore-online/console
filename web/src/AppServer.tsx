import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError } from './api'
import { AppConnectors } from './AppConnectors'
import { safeLogText } from './AppLogs'
import {
  getHookDeliveries, getHooks, getScheduledRuns, getVisibility, getWorker, getWorkerUsage,
  rotateWorkerKey, runScheduleNow, setWorkerEnabled,
  type QuotaName, type WorkerSchedule,
} from './serverApi'

/**
 * Server tab (platform#261): the app's worker, schedules, hooks, connectors and
 * visibility on one screen, because owners debug them together (a hook fires a
 * worker that calls an action). Every read is owner-only; secrets show only as
 * set or missing, never their value.
 */

interface Props {
  appId: string
  getToken: () => string | null
  /** Platform admin: may turn the worker on or off (the owner cannot). */
  isAdmin?: boolean
}

const DANGER = 'var(--danger,#dc2626)'
const QUOTA_WARN_RATIO = 0.8
const WORKER_RUN_PREFIX = 'worker:'
const IN_PROGRESS = new Set(['running', 'due', 'claimed', 'queued', 'received'])

function errorMessage(e: unknown, what: string): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'Your session has expired. Sign in again.'
    if (e.status === 403) return `${what} is available only to this app's owner.`
    if (e.status === 429) return 'Rate-limited. Wait a moment and try again.'
    return `Could not load ${what.toLowerCase()} (${e.status}). Try again.`
  }
  return `Could not reach the platform to load ${what.toLowerCase()}. Check your connection and try again.`
}

const isDenied = (e: unknown) => e instanceof ApiError && (e.status === 401 || e.status === 403)

function formatTime(ms: number | null | undefined): string {
  return ms ? new Date(ms).toLocaleString() : '—'
}

function statusLabel(status: string): string {
  return IN_PROGRESS.has(status) ? 'in progress' : status
}

interface Read<T> { data: T | null; error: unknown; loading: boolean }

/**
 * One owner read, versioned like AppLogs: a response for a previous app or
 * filter is dropped, and the old data is cleared the moment the read changes.
 */
function useRead<T>(read: (token: string) => Promise<T>, getToken: () => string | null, refresh: number): Read<T> {
  const [state, setState] = useState<Read<T>>({ data: null, error: null, loading: true })
  const version = useRef(0)
  // The parent passes a fresh getToken closure each render; only the app, filter or Refresh re-read.
  const tokenRef = useRef(getToken)
  tokenRef.current = getToken
  useEffect(() => {
    const v = ++version.current
    const token = tokenRef.current()
    if (!token) { setState({ data: null, error: new ApiError(401, null), loading: false }); return }
    setState({ data: null, error: null, loading: true })
    read(token)
      .then((data) => { if (v === version.current) setState({ data, error: null, loading: false }) })
      .catch((error: unknown) => { if (v === version.current) setState({ data: null, error, loading: false }) })
  }, [read, refresh])
  useEffect(() => () => { version.current += 1 }, [])
  return state
}

export function AppServer({ appId, getToken, isAdmin = false }: Props) {
  const [refresh, setRefresh] = useState(0)
  const [runStatus, setRunStatus] = useState('')
  const [deliveryStatus, setDeliveryStatus] = useState('')
  const [runNotes, setRunNotes] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // A different app starts clean: no notices or filters carried over.
  useEffect(() => { setRunNotes({}); setNotice(null); setActionError(null); setRunStatus(''); setDeliveryStatus('') }, [appId])

  const worker = useRead(useCallback((t: string) => getWorker(appId, t), [appId]), getToken, refresh)
  const usage = useRead(useCallback((t: string) => getWorkerUsage(appId, t, 30), [appId]), getToken, refresh)
  const runs = useRead(useCallback((t: string) => getScheduledRuns(appId, t, { status: runStatus || undefined }), [appId, runStatus]), getToken, refresh)
  const hooks = useRead(useCallback((t: string) => getHooks(appId, t), [appId]), getToken, refresh)
  const deliveries = useRead(useCallback((t: string) => getHookDeliveries(appId, t, { status: deliveryStatus || undefined }), [appId, deliveryStatus]), getToken, refresh)
  const visibility = useRead(useCallback((t: string) => getVisibility(appId, t), [appId]), getToken, refresh)

  const reload = () => setRefresh((n) => n + 1)

  const runNow = async (s: WorkerSchedule) => {
    setRunNotes((n) => ({ ...n, [s.name]: 'Queuing…' }))
    let note: string
    try {
      await runScheduleNow(appId, s.name, getToken())
      note = 'Queued — it shows below as in progress.'
      reload()
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) note = 'One manual run per schedule per minute — try again in a minute.'
      else if (e instanceof ApiError && e.status === 409) note = e.message
      else note = e instanceof ApiError ? e.message : 'Could not reach the platform. Try again.'
    }
    setRunNotes((n) => ({ ...n, [s.name]: note }))
  }

  const act = async (fn: () => Promise<string>) => {
    setBusy(true); setNotice(null); setActionError(null)
    try { setNotice(await fn()) } catch (e) { setActionError(e instanceof ApiError ? e.message : 'Could not reach the platform. Try again.') }
    setBusy(false)
  }

  const rotate = () => {
    if (!window.confirm('Rotate the worker token and event key? The worker picks up the new keys on its next invocation.')) return
    void act(async () => {
      const { config_version } = await rotateWorkerKey(appId, getToken())
      reload()
      return `Keys rotated — config version ${config_version}.`
    })
  }

  const toggleWorker = (enabled: boolean) => {
    if (!enabled && !window.confirm('Disable this app worker? Its deployment is removed.')) return
    void act(async () => {
      await setWorkerEnabled(appId, enabled, getToken())
      reload()
      return enabled ? 'App worker enabled.' : 'App worker disabled.'
    })
  }

  if (isDenied(worker.error)) {
    return (
      <section className="max-w-5xl overflow-y-auto min-h-0 flex-1" aria-labelledby="app-server-heading">
        <h2 id="app-server-heading" className="display-font text-lg font-bold text-[var(--ink)]">Server</h2>
        <p role="alert" className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 text-sm text-[var(--muted)]">
          {errorMessage(worker.error, 'The Server tab')}
        </p>
      </section>
    )
  }

  const w = worker.data
  const enabled = w?.worker.enabled === 1
  const broken = w?.schedules.filter((s) => s.schedule_disabled_at) ?? []
  const anyQuotaExceeded = deliveries.data?.deliveries.some((d) => d.status === 'quota_exceeded') ?? false

  return (
    <section className="max-w-5xl space-y-4 overflow-y-auto min-h-0 flex-1" aria-labelledby="app-server-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="app-server-heading" className="display-font text-lg font-bold text-[var(--ink)]">Server</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">The app worker, its schedules and hooks, connectors and visibility. Owner-only.</p>
        </div>
        <button type="button" onClick={reload}
          className="text-xs text-[var(--muted)] hover:text-[var(--ink)] px-2 py-1 rounded border border-[var(--line)] hover:border-[var(--accent)] flex-shrink-0">
          Refresh
        </button>
      </div>

      {notice && <p role="status" className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 text-sm text-[var(--success)]">{notice}</p>}
      {actionError && <p role="alert" className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 text-sm" style={{ color: DANGER }}>{actionError}</p>}

      {broken.map((s) => (
        <p key={s.name} role="alert" data-testid="breaker-banner" className="rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-3 text-sm text-[var(--ink)]">
          Schedule <code className="font-semibold">{s.name}</code> was disabled on {formatTime(s.schedule_disabled_at)} after {s.consecutive_failures ?? 'repeated'} consecutive
          failures. Fix the cause, then redeploy the manifest (push to <code>main</code>) to re-enable it.
        </p>
      ))}

      {/* Worker */}
      <Panel title="Worker">
        {worker.loading && <Loading />}
        {!!worker.error && <ErrorText>{errorMessage(worker.error, 'Worker status')}</ErrorText>}
        {w && (
          <>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <Field label="Enabled">{enabled ? 'Yes' : 'No — a platform admin turns app workers on'}</Field>
              <Field label="Backend">{w.worker.backend ?? '—'}</Field>
              <Field label="Deployed">{w.worker.deployed_sha ? <code>{w.worker.deployed_sha.slice(0, 7)}</code> : '—'} {w.worker.deployed_ref ?? ''} · {formatTime(w.worker.deployed_at)}</Field>
              {w.worker.rotation_overlap_until ? <Field label="Old keys valid until">{formatTime(w.worker.rotation_overlap_until)}</Field> : null}
              <Field label="Last deploy">
                {w.last_deploy
                  ? <><code>{w.last_deploy.sha.slice(0, 7)}</code> {w.last_deploy.ref} · {w.last_deploy.status} · {formatTime(w.last_deploy.created_at)}{w.last_deploy.detail ? ` · ${safeLogText(w.last_deploy.detail)}` : ''}</>
                  : 'No deploy yet'}
              </Field>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              {enabled && (
                <button type="button" onClick={rotate} disabled={busy}
                  className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-sm text-[var(--ink)] hover:border-[var(--accent)] disabled:opacity-50">
                  Rotate keys
                </button>
              )}
              {isAdmin && (
                <button type="button" onClick={() => toggleWorker(!enabled)} disabled={busy}
                  className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-sm text-[var(--ink)] hover:border-[var(--accent)] disabled:opacity-50">
                  {enabled ? 'Disable worker (admin)' : 'Enable worker (admin)'}
                </button>
              )}
            </div>

            <h4 className="mt-4 mb-1.5 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Last 20 invocations</h4>
            {w.invocations.length === 0 ? <Empty>No invocations yet.</Empty> : (
              <Table head={['Started', 'Type', 'Name', 'Attempt', 'Status', 'HTTP', 'PAS calls', 'Finished', 'Error']}>
                {w.invocations.map((i) => (
                  <tr key={i.id} className="border-b border-[var(--line)] align-top">
                    <Td>{formatTime(i.started_at)}</Td><Td>{i.type}</Td><Td>{i.name ?? '—'}</Td><Td>{i.attempt}</Td>
                    <Td><Status status={i.status} /></Td><Td>{i.http_status ?? '—'}</Td><Td>{i.pas_calls ?? '—'}</Td>
                    <Td>{formatTime(i.finished_at)}</Td><Td>{i.error ? safeLogText(i.error) : '—'}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </>
        )}
      </Panel>

      {/* Usage */}
      <Panel title="Usage today">
        {usage.loading && <Loading />}
        {!!usage.error && <ErrorText>{errorMessage(usage.error, 'Worker usage')}</ErrorText>}
        {usage.data && (() => {
          const u = usage.data
          const label: Record<QuotaName, string> = {
            invocations: 'Invocations',
            cpu_ms: u.cpu_ms_source === 'wall' ? 'Wall-clock ms' : 'CPU ms',
            hook_deliveries: 'Hook deliveries',
          }
          return (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                {(Object.keys(label) as QuotaName[]).map((q) => {
                  const used = u.today[q] ?? 0
                  const limit = u.quotas[q]
                  const ratio = limit > 0 ? used / limit : 0
                  const warn = ratio >= QUOTA_WARN_RATIO
                  return (
                    <div key={q} data-testid={`quota-${q}`} className={`rounded-lg border p-3 ${warn ? 'border-[var(--warning)]/50 bg-[var(--warning)]/10' : 'border-[var(--line)]'}`}>
                      <p className="text-xs text-[var(--muted)]">{label[q]}</p>
                      <p className="text-sm font-semibold text-[var(--ink)]">{used.toLocaleString()} / {limit.toLocaleString()}</p>
                      <div className="mt-1.5 h-1.5 rounded bg-[var(--line)]">
                        <div className={`h-1.5 rounded ${warn ? 'bg-[var(--warning)]' : 'bg-[var(--accent)]'}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                      </div>
                      {warn && <p className="mt-1 text-xs text-[var(--warning)]">{Math.round(ratio * 100)}% of today's quota — resets at 00:00 UTC.</p>}
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">PAS calls today: {u.today.pas_calls.toLocaleString()}</p>
              {u.days.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-[var(--muted)]">Last 30 days</summary>
                  <Table head={['Day', 'Invocations', label.cpu_ms, 'Hook deliveries', 'PAS calls']}>
                    {u.days.map((d) => (
                      <tr key={d.day} className="border-b border-[var(--line)]">
                        <Td>{d.day}</Td><Td>{d.invocations}</Td><Td>{d.cpu_ms}</Td><Td>{d.hook_deliveries}</Td><Td>{d.pas_calls}</Td>
                      </tr>
                    ))}
                  </Table>
                </details>
              )}
            </>
          )
        })()}
      </Panel>

      {/* Schedules */}
      <Panel title="Schedules">
        {w && w.schedules.length === 0 && <Empty>No worker schedules declared.</Empty>}
        {w?.schedules.map((s) => (
          <div key={s.name} className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
            <div className="min-w-0">
              <code className="font-semibold text-[var(--ink)]">{s.name}</code>
              <span className="ml-2 text-[11px] text-[var(--muted)]">
                {s.cron}{s.consecutive_failures ? ` · ${s.consecutive_failures} consecutive failures` : ''}{s.schedule_disabled_at ? ' · disabled' : ''}
              </span>
              {runNotes[s.name] && <p className="text-xs text-[var(--muted)] mt-0.5" role="status">{runNotes[s.name]}</p>}
            </div>
            <button type="button" onClick={() => void runNow(s)} disabled={!enabled || !!s.schedule_disabled_at}
              className="rounded-lg border border-[var(--line-strong)] px-3 py-1 text-xs text-[var(--ink)] hover:border-[var(--accent)] disabled:opacity-50 flex-shrink-0">
              Run now
            </button>
          </div>
        ))}

        <div className="mt-3 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Recent runs</h4>
          <select aria-label="Run status" value={runStatus} onChange={(e) => setRunStatus(e.target.value)}
            className="rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 text-xs text-[var(--ink)]">
            <option value="">All statuses</option><option value="queued">Queued</option><option value="claimed">Claimed</option>
            <option value="due">Due</option><option value="succeeded">Succeeded</option><option value="failed">Failed</option>
          </select>
        </div>
        {runs.loading && <Loading />}
        {!!runs.error && <ErrorText>{errorMessage(runs.error, 'Scheduled runs')}</ErrorText>}
        {runs.data && (runs.data.runs.length === 0 ? <Empty>No runs.</Empty> : (
          <Table head={['Due', 'Schedule', 'Status', 'Changes', 'Finished', 'Error']}>
            {runs.data.runs.map((r) => {
              const isWorker = r.action_name.startsWith(WORKER_RUN_PREFIX)
              return (
                <tr key={r.run_id} className="border-b border-[var(--line)] align-top">
                  <Td>{formatTime(r.due_at)}</Td>
                  <Td>{isWorker ? <>{r.action_name.slice(WORKER_RUN_PREFIX.length)} <span className="text-[10px] text-[var(--muted)]">worker run</span></> : r.action_name}</Td>
                  <Td><Status status={r.status} /></Td><Td>{r.changes ?? '—'}</Td><Td>{formatTime(r.finished_at)}</Td>
                  <Td>{r.error ? safeLogText(r.error) : '—'}</Td>
                </tr>
              )
            })}
          </Table>
        ))}
      </Panel>

      {/* Hooks */}
      <Panel title="Hooks">
        {hooks.loading && <Loading />}
        {!!hooks.error && <ErrorText>{errorMessage(hooks.error, 'Hooks')}</ErrorText>}
        {hooks.data && hooks.data.hooks.length === 0 && <Empty>This app declares no hooks.</Empty>}
        {hooks.data?.hooks.map((h) => (
          <div key={h.name} className="mb-2 rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="font-semibold text-[var(--ink)]">{h.name}</code>
              <span className="text-[11px] text-[var(--muted)]">verifier: {h.verify_kind}</span>
              <span className="text-[11px]" style={h.secret_set === false ? { color: DANGER } : undefined}>
                {h.secret_name
                  ? <>secret <code>{h.secret_name}</code>: {h.secret_set ? 'set' : 'MISSING — add it in Settings → Integrations'}</>
                  : <span className="text-[var(--muted)]">no secret needed</span>}
              </span>
            </div>
            {h.url ? (
              <div className="mt-1 flex items-center gap-2 min-w-0">
                <code className="truncate text-xs text-[var(--muted)]">{h.url}</code>
                <button type="button" onClick={() => navigator.clipboard?.writeText(h.url!)} aria-label={`Copy ${h.name} URL`}
                  className="text-[11px] text-[var(--muted)] hover:text-[var(--ink)] flex-shrink-0">Copy</button>
              </div>
            ) : <p className="mt-1 text-xs text-[var(--muted)]">Fed by the platform's GitHub App — connect it under Connectors.</p>}
          </div>
        ))}

        <div className="mt-3 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Recent deliveries</h4>
          <select aria-label="Delivery status" value={deliveryStatus} onChange={(e) => setDeliveryStatus(e.target.value)}
            className="rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 text-xs text-[var(--ink)]">
            <option value="">All statuses</option><option value="received">Received</option><option value="delivered">Delivered</option>
            <option value="failed">Failed</option><option value="quota_exceeded">Quota exceeded</option>
          </select>
        </div>
        {anyQuotaExceeded && (
          <p className="mb-2 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-2 text-xs text-[var(--ink)]">
            <strong>quota_exceeded</strong> deliveries were recorded but not processed — the app was over its daily hook quota.
            Redeliver them from the sender after 00:00 UTC.
          </p>
        )}
        {deliveries.loading && <Loading />}
        {!!deliveries.error && <ErrorText>{errorMessage(deliveries.error, 'Hook deliveries')}</ErrorText>}
        {deliveries.data && (deliveries.data.deliveries.length === 0 ? <Empty>No deliveries.</Empty> : (
          <Table head={['Received', 'Hook', 'Event', 'Delivery', 'Status', 'Attempts', 'Error']}>
            {deliveries.data.deliveries.map((d) => (
              <tr key={d.id} className="border-b border-[var(--line)] align-top">
                <Td>{formatTime(d.received_at)}</Td><Td>{d.hook}</Td><Td>{d.event ?? '—'}</Td>
                <Td><code className="text-[11px]">{safeLogText(d.delivery_id)}</code></Td>
                <Td><Status status={d.status} /></Td><Td>{d.attempts}</Td><Td>{d.error ? safeLogText(d.error) : '—'}</Td>
              </tr>
            ))}
          </Table>
        ))}
      </Panel>

      <AppConnectors appId={appId} getToken={getToken} />

      {/* Visibility */}
      <Panel title="Visibility">
        {visibility.loading && <Loading />}
        {!!visibility.error && <ErrorText>{errorMessage(visibility.error, 'Visibility')}</ErrorText>}
        {visibility.data && (
          <p className="text-sm text-[var(--ink)]">
            Mode: <code className="font-semibold">{visibility.data.mode}</code>
            <span className="block mt-1 text-xs text-[var(--muted)]">
              Declared in the app manifest (read-only here). Who holds the allowed roles is managed in Settings → Access.
            </span>
          </p>
        )}
      </Panel>
    </section>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <h3 className="mb-2 text-sm font-semibold text-[var(--muted)] uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex gap-2"><dt className="text-[var(--muted)]">{label}:</dt><dd className="text-[var(--ink)] min-w-0">{children}</dd></div>
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="border-b border-[var(--line)] text-[var(--muted)]"><tr>{head.map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

const Td = ({ children }: { children: ReactNode }) => <td className="p-2 text-[var(--ink)]">{children}</td>

function Status({ status }: { status: string }) {
  const failed = status === 'failed' || status === 'timeout' || status === 'quota_exceeded'
  return <span className="font-semibold" style={failed ? { color: DANGER } : undefined}>{statusLabel(status)}</span>
}

const Loading = () => <p className="py-3 text-sm text-[var(--muted)]">Loading…</p>
const Empty = ({ children }: { children: ReactNode }) => <p className="py-2 text-sm text-[var(--muted)]">{children}</p>
const ErrorText = ({ children }: { children: ReactNode }) => <p role="alert" className="py-2 text-sm" style={{ color: DANGER }}>{children}</p>
