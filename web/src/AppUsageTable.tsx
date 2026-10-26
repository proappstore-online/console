import { useEffect, useMemo, useState } from 'react'
import { fetchAppUsage, formatViewCount, type AppUsageResponse, type AppUsageRow } from './analytics'

// Admin per-app usage (platform#417): every registered app with its page views,
// a trend sparkline, and a flag on zero views. Unique visitors are not shown:
// ingest records no visitor identifier.

type SortKey = 'app' | 'views'

export function sortUsage(rows: AppUsageRow[], key: SortKey, desc: boolean): AppUsageRow[] {
  const dir = desc ? -1 : 1
  return [...rows].sort((a, b) =>
    key === 'views'
      ? dir * (a.views - b.views) || a.app_id.localeCompare(b.app_id)
      : dir * a.app_id.localeCompare(b.app_id),
  )
}

export function AppUsageTable({ getToken }: { getToken: () => string | null }) {
  const [data, setData] = useState<AppUsageResponse | null>(null)
  const [days, setDays] = useState<7 | 30>(7)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'views', desc: true })

  useEffect(() => {
    let cancelled = false
    const token = getToken()
    if (!token) return
    setError(null)
    fetchAppUsage(token, days)
      .then((r) => { if (!cancelled) setData(r) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [getToken, days])

  const rows = useMemo(() => (data ? sortUsage(data.apps, sort.key, sort.desc) : []), [data, sort])
  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key === 'views' }))

  if (error && !data) return null

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h2 className="display-font text-xl font-bold text-[var(--ink)]">Usage by app</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Page views per app. Unique visitors are not recorded.</p>
        </div>
        <div className="flex gap-1 text-xs">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2 py-1 rounded ${days === d ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      {data && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[var(--muted)]">
              <th className="py-1"><button onClick={() => toggle('app')}>App</button></th>
              <th className="py-1 text-right"><button onClick={() => toggle('views')}>Views</button></th>
              <th className="py-1 pl-3">Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.app_id} className="border-t border-[var(--line)]">
                <td className="py-1 font-mono text-[var(--ink)]">
                  {r.app_id}
                  {!r.registered && <span className="ml-2 text-[var(--muted)]">(unregistered)</span>}
                  {r.views === 0 && <span className="ml-2 rounded bg-[var(--line)] px-1 text-[var(--muted)]">no views</span>}
                </td>
                <td className="py-1 text-right tabular-nums">{formatViewCount(r.views)}</td>
                <td className="py-1 pl-3"><Sparkline series={r.series} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--line-strong)] font-semibold">
              <td className="py-1">Total ({data.totals.apps} apps, {data.totals.apps_without_views} with no views)</td>
              <td className="py-1 text-right tabular-nums">{formatViewCount(data.totals.views)}</td>
              <td className="py-1 pl-3"><Sparkline series={data.series} /></td>
            </tr>
          </tfoot>
        </table>
      )}
    </section>
  )
}

function Sparkline({ series }: { series: Array<{ t: string; views: number }> }) {
  if (series.length === 0) return <span className="text-[var(--muted)]">—</span>
  const max = Math.max(1, ...series.map((d) => d.views))
  const points = series
    .map((d, i) => `${series.length === 1 ? 0 : (i / (series.length - 1)) * 80},${16 - (d.views / max) * 16}`)
    .join(' ')
  return (
    <svg viewBox="0 0 80 16" className="h-4 w-20" role="img" aria-label="views trend">
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  )
}
