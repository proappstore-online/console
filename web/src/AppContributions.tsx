import { useEffect, useRef, useState } from 'react'
import { pro } from './sdk'
import { POLICY_NOTE, contributionFailure, loadContributions, loadMorePeople, rangeError, utcDaysAgo, type ContributionsResult, type PeopleResponse } from './contributionsApi'

interface Props { appId: string; loader?: typeof loadContributions; moreLoader?: typeof loadMorePeople }
const CARD = 'rounded-2xl border border-line bg-panel p-5'
const BTN = 'min-h-11 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50'
const titles = { unavailable: 'Contributions are unavailable', error: 'Could not read contributions', partial: 'History is still being counted', stale: 'These figures are out of date', empty: 'No counted commits in this period.', ok: 'Complete and fresh' }
export function AppContributions({ appId, loader = loadContributions, moreLoader = loadMorePeople }: Props) {
 const [preset, setPreset] = useState('all'), [from, setFrom] = useState(''), [to, setTo] = useState('')
 const [result, setResult] = useState<ContributionsResult | null>(null)
 const [busy, setBusy] = useState(false), [retry, setRetry] = useState(0), [revision, setRevision] = useState(0)
 const ticket = useRef(0), active = useRef('')
 const token = pro.auth.token
 const key = JSON.stringify([appId, token, revision, preset, from, to, retry])
 // Gate rendering synchronously, before effects run, on app/account/filter changes.
 const visible = active.current === key ? result : null
 const bad = preset === 'custom' ? rangeError(from, to) : null
 const opts = preset === 'all' ? {} : preset === 'custom' ? { from: from || undefined, to: to || undefined } : { from: utcDaysAgo(Number(preset)) }
 useEffect(() => pro.auth.onChange(() => { ticket.current++; active.current = ''; setResult(null); setRevision(n => n + 1) }), [])
 useEffect(() => {
  const t = ++ticket.current
  active.current = key; setResult(null); setBusy(false)
  if (!bad) loader(appId, token, opts).then(r => { if (t === ticket.current) setResult(r) }, e => { if (t === ticket.current) setResult(contributionFailure(e)) })
  return () => { ticket.current++ }
  // Bounds and session are represented in key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [key, loader])
 async function more() {
  if (visible?.accessState !== 'ok' || !visible.people.next || busy) return
  const t = ticket.current; setBusy(true)
  try {
   const page = await moreLoader(appId, token, visible.people.next.cursor, opts)
   if (t !== ticket.current) return
   if (!compatible(visible.people, page)) { active.current = ''; setResult(null); setRetry(n => n + 1); return }
   setResult({ ...visible, people: { ...page, people: [...visible.people.people, ...page.people.filter(p => !visible.people.people.some(old => old.github_account_id === p.github_account_id))] } })
  } catch (e) { if (t === ticket.current) setResult(contributionFailure(e)) }
  finally { if (t === ticket.current) setBusy(false) }
 }
 const s = visible?.accessState === 'ok' ? visible.summary : null
 const p = visible?.accessState === 'ok' ? visible.people : null
 const readable = s && p && !['unavailable', 'error'].includes(s.state) && !['unavailable', 'error'].includes(p.state)
 const stale = s?.state === 'stale' || p?.state === 'stale' || [s?.freshness, p?.freshness].some(f => f?.age_ms != null && f.age_ms > 45 * 60 * 1000)
 return <section aria-label="Project contributions" className="max-w-3xl min-w-0 space-y-4 overflow-y-auto flex-1 text-ink">
  <div className={CARD}><h2 className="text-lg font-bold">Contributions</h2><p>{POLICY_NOTE}</p>
   <div role="group" aria-label="Period" className="flex flex-wrap gap-2 mt-3">
    {[['all', 'All history'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['custom', 'Custom']].map(([k, label]) => <button key={k} className={BTN} aria-label={label} aria-pressed={preset === k} onClick={() => setPreset(k!)}>{label}</button>)}
   </div>
   {preset === 'custom' && <div className="flex flex-wrap gap-3 mt-3"><label>From (UTC)<input className="block max-w-full" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>To (UTC, exclusive)<input className="block max-w-full" type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div>}
   {bad && <p role="alert">{bad}</p>}
  </div>
  {!bad && !visible && <p role="status">Loading contributions...</p>}
  {visible && visible.accessState !== 'ok' && <div role="alert" className={CARD}><h3>{visible.accessState === 'denied' ? 'Access denied to this project’s contributions' : visible.accessState === 'not-found' ? 'Project not found' : visible.accessState === 'unavailable' ? titles.unavailable : titles.error}</h3><p>{visible.message}</p></div>}
  {s && p && <>
   {[s, p].filter((v, i, all) => i === 0 || v.state !== all[0]!.state || v.state_reason !== all[0]!.state_reason).map((v, i) => <div key={i} role={v.state === 'error' ? 'alert' : 'status'} className={CARD}><h3>{titles[v.state]}</h3><p>{v.state_reason}</p></div>)}
   <div className={CARD}><p>History {s.complete && p.complete ? 'complete' : 'incomplete'}.</p><p>Last successful refresh: {s.freshness?.last_success_iso ?? 'No successful read yet'}.</p><p>{s.freshness?.note}</p>{stale && <p role="status">Staleness warning: figures are from the last successful read.</p>}</div>
   <div className={CARD}><p>Counting policy {s.policy_version}: {s.policy.counts}</p><p>Tests: {s.policy.tests}. Documentation: {s.policy.documentation}.</p><p>Excluded: {s.policy.excluded.join('; ')}.</p><p>{s.policy.authorship}. {s.policy.merge_commits}. {s.policy.period}.</p></div>
   {readable && <>
    <div className={CARD}><p>{s.share_basis}</p><p>Total eligible additions: {s.totals.additions}; deletions: {s.totals.deletions}; commits: {s.totals.commits}.</p>
     <p>Truncated commits: {s.totals.truncated_commits}; co-authored commits (no extra credit): {s.totals.co_authored_commits}.</p>
     <p>Excluded unreachable commits: {s.excluded.unreachable_commits}; merge commits: {s.excluded.merge_commits_not_counted}.</p>
     <ol aria-label="Contributor ranking">{p.people.map(person => <li key={person.github_account_id} className="flex flex-wrap justify-between gap-2 py-3 border-b border-line"><span>{person.rank}. {person.github_login ?? 'GitHub account ' + person.github_account_id} <span className="text-xs">{person.matched ? 'Linked to PAS account' : 'Unmatched PAS account'}</span></span><span>+{person.additions} / −{person.deletions} · {person.commits} commits · {person.share.percent}%</span></li>)}</ol>
     {p.next && <button className={BTN} aria-label={busy ? 'Loading...' : 'Load more'} disabled={busy} onClick={more}>{busy ? 'Loading...' : 'Load more'}</button>}
    </div>
    <div className={CARD}><h3>Not ranked</h3>{(['bots', 'unlinked'] as const).map(k => <p key={k}>{k === 'bots' ? 'Bots' : 'Unlinked authors'}: +{s.buckets[k].additions} / −{s.buckets[k].deletions} · {s.buckets[k].commits} commits</p>)}</div>
   </>}
  </>}
  <button className={BTN} onClick={() => setRetry(n => n + 1)}>Refresh contributions</button>
 </section>
}
function compatible(a: PeopleResponse, b: PeopleResponse) {
 return a.app_id === b.app_id && a.policy_version === b.policy_version && a.eligible_additions === b.eligible_additions && a.complete === b.complete && a.state === b.state && a.period.from === b.period.from && a.period.to === b.period.to && a.freshness?.head_sha === b.freshness?.head_sha && a.freshness?.last_success_at === b.freshness?.last_success_at
}
