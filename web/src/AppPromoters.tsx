import { useEffect, useRef, useState } from 'react'
import { PROMOTER_BUTTON as BUTTON, PROMOTER_CARD as CARD } from './promoterShared'
import {
  loadOwnerPromoters, setEnrollment, trackingReady, setPromoterStatus, correctReferral, promoterRequest, appPath, periodQuery, errorMessage, isDenied, readinessMessage, PROMOTER_RANGES,
  type OwnerPromoters, type OwnerPromotersLoader, type PromoterRange, type AuditPage,
} from './promoterApi'

type Preview =
  | { type: 'enrollment'; open: boolean }
  | { type: 'status'; id: string; name: string; status: 'active' | 'suspended' }
  | { type: 'referral'; id: string; action: 'reverse' | 'restore' }

export function AppPromoters({ appId, load = loadOwnerPromoters }: { appId: string; load?: OwnerPromotersLoader }) {
  const [state, setState] = useState<OwnerPromoters | null>(null)
  const [error, setError] = useState('')
  const [range, setRange] = useState<PromoterRange>('30d')
  const [now, setNow] = useState(Date.now)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [reason, setReason] = useState('')
  const [kind, setKind] = useState<'fraud_invalid' | 'correction'>('correction')
  const version = useRef(0)
  const lock = useRef(false)
  useEffect(() => {
    const v = ++version.current
    setState(null); setError(''); setPreview(null); setReason('')
    load(appId, range, now).then(
      (data) => { if (v === version.current) setState(data) },
      (e: unknown) => { if (v === version.current) { if (isDenied(e)) setState(null); setError(errorMessage(e)) } },
    )
    return () => { version.current++ }
  }, [appId, range, now, reload, load])
  function openPreview(next: Preview) { setPreview(next); setReason(''); setKind('correction'); setError('') }
  async function confirm() {
    if (!preview || lock.current) return
    const v = version.current; lock.current = true; setBusy(true); setError('')
    try {
      if (preview.type === 'enrollment') await setEnrollment(appId, preview.open)
      else if (preview.type === 'status') await setPromoterStatus(appId, preview.id, preview.status, reason.trim())
      else await correctReferral(appId, preview.id, preview.action, kind, reason.trim())
      if (v === version.current) setReload((n) => n + 1)
    } catch (e) { if (v === version.current) { if (isDenied(e)) setState(null); setError(errorMessage(e)) } }
    finally { lock.current = false; setBusy(false) }
  }
  async function more(section: 'people' | 'referrals' | 'report' | 'events' | 'referralEvents') {
    if (!state || lock.current) return
    const v = version.current; lock.current = true; setBusy(true); setError('')
    const base = appPath(appId)
    try {
      if (section === 'people' && state.people.next) {
        const data = await promoterRequest<OwnerPromoters['people']>(`${base}/promoters?limit=50&before_id=${encodeURIComponent(state.people.next.before_id)}`)
        if (v === version.current) setState({ ...state, people: { ...data, promoters: unique([...state.people.promoters, ...data.promoters], (r) => r.promoter_id) } })
      } else if (section === 'referrals' && state.referrals.next) {
        const data = await promoterRequest<OwnerPromoters['referrals']>(`${base}/referrals?limit=50&before_id=${encodeURIComponent(state.referrals.next.before_id)}`)
        if (v === version.current) setState({ ...state, referrals: { ...data, referrals: unique([...state.referrals.referrals, ...data.referrals], (r) => r.referral_id) } })
      } else if (section === 'report' && state.report.next) {
        const period = periodQuery(range, now)
        const data = await promoterRequest<OwnerPromoters['report']>(`${base}/promoters/contributions${period || '?'}${period ? '&' : ''}limit=50&after_id=${encodeURIComponent(state.report.next.after_id)}`)
        if (v === version.current) setState({ ...state, report: { ...data, standings: unique([...state.report.standings, ...data.standings], (r) => r.promoter_id) } })
      } else if ((section === 'events' || section === 'referralEvents') && state[section].next) {
        const path = section === 'events' ? 'promoters/events' : 'referrals/events'
        const data = await promoterRequest<AuditPage>(`${base}/${path}?limit=50&before_id=${encodeURIComponent(state[section].next!.before_id)}`)
        if (v === version.current) setState({ ...state, [section]: { ...data, events: unique([...state[section].events, ...data.events], (r) => r.id) } })
      }
    } catch (e) { if (v === version.current) { if (isDenied(e)) setState(null); setError(errorMessage(e)) } }
    finally { lock.current = false; setBusy(false) }
  }
  const totals = state?.report.totals
  const acq = state?.report.acquisition
  const ready = state ? trackingReady(state.settings) : false
  const tile = (label: string, value: number) => <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3">
    <div className="text-2xl font-bold text-[var(--ink)] tabular-nums">{value}</div>
    <div className="text-xs text-[var(--muted)]">{label}</div>
  </div>
  const history = state ? state.events.events.length + state.referralEvents.events.length : 0
  return <section aria-labelledby="promoters-h" className={CARD}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 id="promoters-h" className="text-xl font-bold text-[var(--ink)]">Promoters</h3>
        <p className="text-sm text-[var(--muted)]">People who share your app with their link, and the sign-ups they bring.</p>
      </div>
      {state && <select aria-label="Contribution period" className="min-h-11 rounded border border-[var(--line)] bg-[var(--panel)] px-3 text-[var(--ink)]" value={range} disabled={busy} onChange={(e) => { setNow(Date.now()); setRange(e.target.value as PromoterRange) }}>{PROMOTER_RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>}
    </div>
    {!state && !error && <p role="status">Loading…</p>}
    {error && <div role="alert"><p>{error}</p><button className={BUTTON} onClick={() => setReload((n) => n + 1)}>Retry</button></div>}
    {state && totals && acq && <fieldset disabled={busy} className="mt-4 min-w-0 space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] px-4 py-3">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${state.settings.enrollment_open ? 'bg-[var(--success)]/15 text-[var(--success)]' : 'bg-[var(--line)] text-[var(--muted)]'}`}>Enrollment {state.settings.enrollment_open ? 'open' : 'closed'}</span>
        <span className="flex-1 min-w-[12rem] text-sm text-[var(--muted)]">{state.settings.enrollment_open ? 'Anyone can sign up to promote this app.' : 'No new promoters can sign up. Existing links keep working.'}</span>
        <button className={BUTTON} onClick={() => openPreview({ type: 'enrollment', open: !state.settings.enrollment_open })}>{state.settings.enrollment_open ? 'Close enrollment' : 'Open enrollment'}</button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tile('Promoters', totals.promoters)}
        {tile('Pending', totals.pending)}
        {tile('Confirmed', totals.confirmed)}
        {tile('Reversed', totals.reversed)}
      </div>
      <p className="text-sm text-[var(--muted)]">{acq.activations_recorded} sign-ups in this period: {acq.referred_confirmed} referred, {acq.organic} organic/unattributed{acq.referred_reversed ? `, ${acq.referred_reversed} referred then reversed` : ''}{totals.expired ? `. ${totals.expired} referrals expired` : ''}.</p>

      <details className="rounded-xl border border-[var(--line)] px-4 py-3">
        <summary className="cursor-pointer text-sm">
          <span className={`font-semibold ${ready ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>{ready ? 'Referral tracking verified' : 'Referral tracking not verified'}</span>
          <span className="ml-2 text-[var(--muted)]">What does this need?</span>
        </summary>
        <div className="mt-2 space-y-2 text-sm text-[var(--muted)]">
          <p>{readinessMessage(state.settings)}</p>
          <p>Readiness requires SDK 1.16.104 or newer, platform-cookie authentication on the PAS host with auth/API mediation, and a successful synthetic verification of the uploaded build reported by its authorized deployment workflow. Opening enrollment does not verify tracking. Existing credits remain.</p>
          <a className="underline" href="https://github.com/proappstore-online/platform/blob/main/docs/promoter-readiness.md" target="_blank" rel="noreferrer">Deployment verification requirements</a>
          <p>{acq.note} Updated {new Date(state.report.freshness.as_of).toUTCString()}. {state.report.freshness.note}</p>
        </div>
      </details>

      <div>
        <h4 className="font-bold text-[var(--ink)]">Standings</h4>
        {state.report.standings.length === 0
          ? <p className="text-sm text-[var(--muted)]">No promoters have referred anyone in this period.</p>
          : <>
            <p className="text-xs text-[var(--muted)]">Share is each promoter's confirmed referrals out of all promoters' confirmed referrals in this period.</p>
            <ol className="mt-2 divide-y divide-[var(--line)]">{state.report.standings.map((p) => <li key={p.promoter_id} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-10 text-[var(--muted)]">{p.rank === null ? '—' : `#${p.rank}`}</span>
              <span className="flex-1 truncate text-[var(--ink)]">{p.display_name || 'Unnamed promoter'}</span>
              <span className="tabular-nums text-[var(--muted)]">{p.counts.confirmed} confirmed · {p.share_of_referred_users.percent}%</span>
            </li>)}</ol>
          </>}
        {state.report.next && <button className={BUTTON} onClick={() => void more('report')}>More standings</button>}
      </div>

      {state.people.promoters.length > 0 && <div>
        <h4 className="font-bold text-[var(--ink)]">Promoters</h4>
        <p className="text-xs text-[var(--muted)]">{state.people.counts.active} active · {state.people.counts.suspended} suspended · {state.people.counts.withdrawn} withdrawn (all time)</p>
        <ul className="mt-2 divide-y divide-[var(--line)] wrap-anywhere">{state.people.promoters.map((p) => <li key={p.promoter_id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
          <span className="flex-1 min-w-0 truncate text-[var(--ink)]">{p.display_name || 'Unnamed promoter'} <span className="font-mono text-xs text-[var(--muted)]">{p.code}</span></span>
          <span className="text-xs text-[var(--muted)]">{p.status}{p.status_reason ? ` — ${p.status_reason}` : ''}</span>
          {p.status !== 'withdrawn' && <button className={BUTTON} onClick={() => openPreview({ type: 'status', id: p.promoter_id, name: p.display_name || p.code, status: p.status === 'active' ? 'suspended' : 'active' })}>{p.status === 'active' ? 'Suspend' : 'Restore'} {p.display_name || p.code}</button>}
        </li>)}</ul>
        {state.people.next && <button className={BUTTON} onClick={() => void more('people')}>More promoters</button>}
      </div>}

      {state.referrals.referrals.length > 0 && <div>
        <h4 className="font-bold text-[var(--ink)]">Referral review</h4>
        <p className="text-xs text-[var(--muted)]">Reversing or restoring a referral changes the totals and is recorded in History.</p>
        <ul className="mt-2 divide-y divide-[var(--line)] wrap-anywhere">{state.referrals.referrals.map((r) => <li key={r.referral_id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
          <span className="flex-1 min-w-0 text-[var(--ink)]"><span className="font-mono text-xs">{r.referral_id}</span> · {r.status} · {new Date(r.confirmed_at ?? r.captured_at).toUTCString()} {r.reversal_kind} {r.reversal_reason}</span>
          {(r.status === 'confirmed' || r.status === 'reversed') && <button className={BUTTON} onClick={() => openPreview({ type: 'referral', id: r.referral_id, action: r.status === 'confirmed' ? 'reverse' : 'restore' })}>{r.status === 'confirmed' ? 'Reverse' : 'Restore'} referral {r.referral_id}</button>}
        </li>)}</ul>
        {state.referrals.next && <button className={BUTTON} onClick={() => void more('referrals')}>More referrals</button>}
      </div>}

      {preview && <section className={CARD} aria-label="Change preview">
        <h4 className="font-bold">Review this change</h4>
        <p>{preview.type === 'enrollment' ? `${preview.open ? 'Open' : 'Close'} enrollment for ${appId}. Existing active links keep working.` : preview.type === 'status' ? `Set ${preview.name} to ${preview.status} in ${appId}. Suspension disables their link; confirmed credit stays.` : `${preview.action} referral ${preview.id} in ${appId}. Confirmed totals, denominator and ranks will be recalculated by the server. This preview does not estimate the resulting numbers.`}</p>
        {preview.type !== 'enrollment' && <label className="block">Reason <textarea className="block min-h-20 w-full rounded border border-[var(--line)] bg-[var(--panel)] p-2" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
        {preview.type === 'referral' && preview.action === 'reverse' && <label>Reversal kind <select className="min-h-11 rounded border border-[var(--line)] bg-[var(--panel)] px-3" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="correction">Correction</option><option value="fraud_invalid">Fraud / invalid</option></select></label>}
        <div className="flex flex-wrap gap-2"><button className={BUTTON} disabled={preview.type !== 'enrollment' && !reason.trim()} onClick={() => void confirm()}>Confirm change</button><button className={BUTTON} onClick={() => setPreview(null)}>Cancel</button></div>
      </section>}

      <details className="rounded-xl border border-[var(--line)] px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--ink)]">History <span className="font-normal text-[var(--muted)]">{history === 0 ? 'no changes yet' : `${history}${state.events.next || state.referralEvents.next ? '+' : ''} changes`}</span></summary>
        {(['events', 'referralEvents'] as const).map((key) => state[key].events.length > 0 && <section key={key} className="mt-3"><h4 className="text-sm font-bold">{key === 'events' ? 'Promoter changes' : 'Referral changes'}</h4>
          <ul className="text-xs text-[var(--muted)] space-y-1 wrap-anywhere">{state[key].events.map((e) => <li key={e.id}>{new Date(e.created_at).toUTCString()} · {e.actor_kind} · {e.action} · {e.from_status || 'none'} → {e.to_status || 'none'} · {e.reason || 'No reason recorded'}</li>)}</ul>
          {state[key].next && <button className={BUTTON} onClick={() => void more(key)}>More {key === 'events' ? 'promoter' : 'referral'} audit</button>}
        </section>)}
      </details>
    </fieldset>}
    {busy && <p role="status">Saving or loading…</p>}
  </section>
}
function unique<T>(rows: T[], key: (row: T) => string): T[] { return [...new Map(rows.map((row) => [key(row), row])).values()] }
