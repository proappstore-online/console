import { useEffect, useRef, useState } from 'react'
import { PROMOTER_BUTTON as BUTTON, PROMOTER_CARD as CARD } from './promoterShared'
import {
  loadOwnerPromoters, setEnrollment, setPromoterStatus, correctReferral, promoterRequest, appPath, periodQuery, errorMessage, PROMOTER_RANGES,
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
      (e: unknown) => { if (v === version.current) setError(errorMessage(e)) },
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
    } catch (e) { if (v === version.current) setError(errorMessage(e)) }
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
    } catch (e) { if (v === version.current) setError(errorMessage(e)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <section aria-labelledby="promoters-h" className={CARD}>
    <h3 id="promoters-h" className="text-xl font-bold text-[var(--ink)]">Promoters</h3>
    {!state && !error && <p role="status">Loading…</p>}
    {error && <div role="alert"><p>{error}</p><button className={BUTTON} onClick={() => setReload((n) => n + 1)}>Retry</button></div>}
    {state && <fieldset disabled={busy} className="mt-3 space-y-4">
      <label>Contribution period <select className="min-h-11 rounded border border-[var(--line)] bg-[var(--panel)] px-3" value={range} onChange={(e) => { setNow(Date.now()); setRange(e.target.value as PromoterRange) }}>{PROMOTER_RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></label>
      <p>{state.report.totals.promoters} promoters · {state.report.totals.pending} pending · {state.report.totals.confirmed} confirmed · {state.report.totals.reversed} reversed · {state.report.totals.expired} expired.</p>
      <p>Enrollment is {state.settings.enrollment_open ? 'open' : 'closed'}. Closing enrollment leaves existing active links working.</p>
      <button className={BUTTON} onClick={() => openPreview({ type: 'enrollment', open: !state.settings.enrollment_open })}>{state.settings.enrollment_open ? 'Close enrollment' : 'Open enrollment'}</button>
      <p>Owner acquisition: {state.report.acquisition.activations_recorded} recorded activations · {state.report.acquisition.referred_confirmed} referred confirmed · {state.report.acquisition.referred_reversed} referred reversed · {state.report.acquisition.organic} organic/unattributed.</p>
      <p className="text-sm text-[var(--muted)]">{state.report.acquisition.note} Updated {new Date(state.report.freshness.as_of).toUTCString()}. {state.report.freshness.note}</p>
      <h4 className="font-bold">Promotion standings</h4>
      <p>Share is confirmed referrals divided by all promoters' confirmed referrals in the same app and period. Code metrics remain separate.</p>
      <ul>{state.report.standings.map((p) => <li key={p.promoter_id}>{p.rank === null ? 'Unranked' : `#${p.rank}`} {p.display_name || 'Unnamed promoter'} · {p.counts.confirmed} confirmed · {p.share_of_referred_users.percent}%</li>)}</ul>
      {state.report.next && <button className={BUTTON} onClick={() => void more('report')}>More standings</button>}
      <a className="underline" href={`#/apps/${appId}/contributions`}>Separate code contributions</a>
      <h4 className="font-bold">Promoter status (all time)</h4>
      <p>{state.people.counts.active} active · {state.people.counts.suspended} suspended · {state.people.counts.withdrawn} withdrawn</p>
      <ul className="space-y-3">{state.people.promoters.map((p) => <li key={p.promoter_id}>
        <p>{p.display_name || 'Unnamed promoter'} · {p.code} · {p.status} {p.status_reason}</p>
        {p.status !== 'withdrawn' && <button className={BUTTON} onClick={() => openPreview({ type: 'status', id: p.promoter_id, name: p.display_name || p.code, status: p.status === 'active' ? 'suspended' : 'active' })}>{p.status === 'active' ? 'Suspend' : 'Restore'} {p.display_name || p.code}</button>}
      </li>)}</ul>
      {state.people.next && <button className={BUTTON} onClick={() => void more('people')}>More promoters</button>}
      <h4 className="font-bold">Referral review (all time)</h4>
      <p>No automatic review queue is supplied. Review records below; corrections change the ledger and are audited.</p>
      {state.referrals.referrals.length === 0 && <p>No referrals to review.</p>}
      <ul className="space-y-3">{state.referrals.referrals.map((r) => <li key={r.referral_id}>
        <p>{r.referral_id} · {r.status} · {new Date(r.confirmed_at ?? r.captured_at).toUTCString()} {r.reversal_kind} {r.reversal_reason}</p>
        {(r.status === 'confirmed' || r.status === 'reversed') && <button className={BUTTON} onClick={() => openPreview({ type: 'referral', id: r.referral_id, action: r.status === 'confirmed' ? 'reverse' : 'restore' })}>{r.status === 'confirmed' ? 'Reverse' : 'Restore'} referral {r.referral_id}</button>}
      </li>)}</ul>
      {state.referrals.next && <button className={BUTTON} onClick={() => void more('referrals')}>More referrals</button>}
      {preview && <section className={CARD} aria-label="Change preview">
        <h4 className="font-bold">Review this change</h4>
        <p>{preview.type === 'enrollment' ? `${preview.open ? 'Open' : 'Close'} enrollment for ${appId}. Existing active links keep working.` : preview.type === 'status' ? `Set ${preview.name} to ${preview.status} in ${appId}. Suspension disables their link; confirmed credit stays.` : `${preview.action} referral ${preview.id} in ${appId}. Confirmed totals, denominator and ranks will be recalculated by the server. This preview does not estimate the resulting numbers.`}</p>
        {preview.type !== 'enrollment' && <label className="block">Reason <textarea className="block min-h-20 w-full rounded border border-[var(--line)] bg-[var(--panel)] p-2" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
        {preview.type === 'referral' && preview.action === 'reverse' && <label>Reversal kind <select className="min-h-11 rounded border border-[var(--line)] bg-[var(--panel)] px-3" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="correction">Correction</option><option value="fraud_invalid">Fraud / invalid</option></select></label>}
        <div className="flex flex-wrap gap-2"><button className={BUTTON} disabled={preview.type !== 'enrollment' && !reason.trim()} onClick={() => void confirm()}>Confirm change</button><button className={BUTTON} onClick={() => setPreview(null)}>Cancel</button></div>
      </section>}
      {(['events', 'referralEvents'] as const).map((key) => <section key={key}><h4 className="font-bold">{key === 'events' ? 'Promoter audit' : 'Referral audit'}</h4>
        {!state[key].events.length && <p>No audit events.</p>}
        <ul>{state[key].events.map((e) => <li key={e.id}>{e.id} · {new Date(e.created_at).toUTCString()} · {e.actor_kind} · {e.action} · {e.from_status || 'none'} → {e.to_status || 'none'} · {e.reason || 'No reason recorded'}</li>)}</ul>
        {state[key].next && <button className={BUTTON} onClick={() => void more(key)}>More {key === 'events' ? 'promoter' : 'referral'} audit</button>}
      </section>)}
    </fieldset>}
    {busy && <p role="status">Saving or loading…</p>}
  </section>
}
function unique<T>(rows: T[], key: (row: T) => string): T[] { return [...new Map(rows.map((row) => [key(row), row])).values()] }
