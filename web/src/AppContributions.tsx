// Project Contributions tab (console#13): ranked per-person code activity for an authorized project.
// Until the platform contributions API (platform#547) is deployed, the default loader reports
// "unavailable" and the tab says so; every other state is rendered from the loader's honest result.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  POLICY_NOTE, loadContributions, rangeError, sharePct, utcDaysAgo,
  type ContributionBucket, type ContributionData, type ContributionLoader, type ContributionPerson, type ContributionResult,
} from './contributionsApi'

interface Props { appId: string; loader?: ContributionLoader }

const CARD = 'rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5'
const BTN = 'rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]'
const FIELD = 'rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1.5 text-sm text-[var(--ink)]'
const nf = new Intl.NumberFormat('en-US')

type Preset = 'all' | '30' | '90' | 'custom'

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  incomplete_backfill: { title: 'History is still being counted', body: 'Older commits have not all been processed yet, so these totals and shares can only rise. Check back later.' },
  stale: { title: 'These figures are out of date', body: 'The last refresh is older than expected. The numbers below are what we last counted, not live values.' },
}

function Rows({ people, startRank, denominator }: { people: ContributionPerson[]; startRank: number; denominator: number }) {
  return (
    <ol className="divide-y divide-[var(--line)]" aria-label="Contributor ranking">
      {people.map((p, i) => {
        const share = sharePct(p.added, denominator)
        return (
          <li key={p.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate text-[var(--ink)]"><span className="mr-2 text-[var(--muted)]">{startRank + i}.</span>{p.displayName}</span>
            <span className="text-right text-xs text-[var(--muted)] whitespace-nowrap">
              <strong className="text-[var(--ink)]">+{nf.format(p.added)}</strong> / −{nf.format(p.removed)} · {nf.format(p.commits)} {p.commits === 1 ? 'commit' : 'commits'} · {share === null ? 'share unknown' : `${share}%`}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function BucketLine({ label, b }: { label: string; b: ContributionBucket }) {
  return <li>{label}: +{nf.format(b.added)} / −{nf.format(b.removed)} · {nf.format(b.commits)} {b.commits === 1 ? 'commit' : 'commits'}</li>
}

export function AppContributions({ appId, loader = loadContributions }: Props) {
  const [preset, setPreset] = useState<Preset>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [result, setResult] = useState<ContributionResult | null>(null)
  const [people, setPeople] = useState<ContributionPerson[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [tries, setTries] = useState(0)
  const ticket = useRef(0)

  const bad = preset === 'custom' ? rangeError(from, to) : null
  const bounds = preset === 'all' ? {} : preset === 'custom' ? { from: from || undefined, to: to || undefined } : { from: utcDaysAgo(Number(preset)) }

  // Every request is ticketed: a slow answer for a previous app or period is dropped, and an app switch
  // clears what was shown, so one project's figures can never appear under another.
  useEffect(() => {
    const t = ++ticket.current
    setResult(null); setPeople([])
    if (bad) return
    loader({ appId, ...bounds }).then(
      (r) => { if (t === ticket.current) { setResult(r); setPeople(r.kind === 'ok' ? r.data.people : []) } },
      (e: unknown) => { if (t === ticket.current) setResult({ kind: 'error', message: e instanceof Error ? e.message : 'request failed' }) },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, loader, preset, from, to, tries])

  const more = useCallback(() => {
    if (result?.kind !== 'ok' || !result.data.next) return
    const t = ticket.current
    const cursor = result.data.next
    setLoadingMore(true)
    loader({ appId, ...bounds, cursor }).then((r) => {
      if (t !== ticket.current) return
      if (r.kind === 'ok') {
        setPeople((prev) => [...prev, ...r.data.people.filter((p) => !prev.some((q) => q.id === p.id))])
        setResult({ kind: 'ok', data: { ...r.data, people: [] } })
      } else setResult(r)
    }).catch((e: unknown) => {
      if (t === ticket.current) setResult({ kind: 'error', message: e instanceof Error ? e.message : 'request failed' })
    }).finally(() => setLoadingMore(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, appId, loader, preset, from, to])

  const data: ContributionData | null = result?.kind === 'ok' ? result.data : null
  const empty = data !== null && people.length === 0 && data.buckets.automation.commits === 0 && data.buckets.unmatched.commits === 0

  return (
    <section className="max-w-3xl space-y-4 overflow-y-auto min-h-0 flex-1" aria-labelledby="contrib-h">
      <div className={CARD}>
        <h2 id="contrib-h" className="display-font text-lg font-bold text-[var(--ink)]">Contributions</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{POLICY_NOTE}</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div role="group" aria-label="Period" className="flex items-center gap-0.5 rounded-lg border border-[var(--line-strong)] p-0.5">
            {([['all', 'All history'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['custom', 'Custom']] as const).map(([k, label]) => (
              <button key={k} type="button" aria-label={label} aria-pressed={preset === k} onClick={() => setPreset(k)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap ${preset === k ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}>
                {label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <>
              <label className="text-xs text-[var(--muted)]">From (UTC)<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${FIELD} block`} /></label>
              <label className="text-xs text-[var(--muted)]">To (UTC)<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${FIELD} block`} /></label>
            </>
          )}
        </div>
        {bad && <p role="alert" className="mt-2 text-xs text-[var(--error)]">{bad}</p>}
      </div>

      {!bad && result === null && <p role="status" className="py-8 text-center text-sm text-[var(--muted)]">Loading contributions…</p>}

      {result?.kind === 'unavailable' && (
        <div role="status" className={CARD}>
          <h3 className="text-sm font-semibold text-[var(--ink)]">Contributions are not available yet</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">The service that counts code activity is still being built. Nothing is shown here until it is live, so no figure on this page is estimated.</p>
        </div>
      )}
      {result?.kind === 'forbidden' && (
        <div role="alert" className={CARD}>
          <h3 className="text-sm font-semibold text-[var(--ink)]">You don’t have access to this project’s contributions</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">Nothing from this project is kept on this page.</p>
        </div>
      )}
      {result?.kind === 'error' && (
        <div role="alert" className={CARD}>
          <p className="text-sm text-[var(--error)]">Couldn’t load contributions: {result.message}</p>
          <button type="button" onClick={() => setTries((n) => n + 1)} className={`${BTN} mt-3`}>Retry</button>
        </div>
      )}

      {data && (
        <>
          {STATUS_COPY[data.status] && (
            <div role="status" className={`${CARD} border-[var(--warning,#d97706)]`}>
              <h3 className="text-sm font-semibold text-[var(--ink)]">{STATUS_COPY[data.status]!.title}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{STATUS_COPY[data.status]!.body}</p>
            </div>
          )}
          <div className={CARD}>
            <p className="text-xs text-[var(--muted)]">
              Ranked by eligible lines added. Share = a person’s additions ÷ {nf.format(data.additionsDenominator)} eligible lines added by everyone in this period.
              Refreshed {new Date(data.asOf).toUTCString()}. Counting policy {data.policy.version}: {data.policy.summary}
            </p>
            {empty ? (
              <p className="mt-4 text-sm text-[var(--muted)]">No counted commits in this period.</p>
            ) : (
              <div className="mt-3">
                <Rows people={people} startRank={1} denominator={data.additionsDenominator} />
                {data.next && <button type="button" aria-label={loadingMore ? 'Loading…' : 'Load more'} onClick={more} disabled={loadingMore} className={`${BTN} mt-3`}>{loadingMore ? 'Loading…' : 'Load more'}</button>}
              </div>
            )}
          </div>
          <div className={CARD}>
            <h3 className="text-sm font-semibold text-[var(--ink)]">Not ranked</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">Automation and commits we couldn’t match to a person are counted in the totals but never ranked.</p>
            <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
              <BucketLine label="Automation" b={data.buckets.automation} />
              <BucketLine label="Unmatched authors" b={data.buckets.unmatched} />
            </ul>
          </div>
        </>
      )}
    </section>
  )
}
