/**
 * One declared metric time series (#240), rendered generically: a controls row
 * (range presets within the declared max_days, a grain no finer than declared),
 * a summary tile per measure (its aggregation over the range), and one line
 * chart per measure — measures never share an axis. Reads go through the
 * owner-only metrics route, which validates and bounds every request. A refetch
 * keeps the previous render, dimmed; empty, error and re-sign-in states are
 * explained in place.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  fetchOperatorSeries, formatMeasure, operatorErrorMessage, needsReauth, SERIES_GRAINS,
  type OperatorResource, type OperatorSeriesData, type SeriesGrain,
} from './operator'
import { Kpi } from './sectionPrimitives'
import { OperatorLineChart } from './OperatorLineChart'

const DAY = 86_400_000
const PRESETS = [7, 30, 90, 365]
const AGGREGATION_LABEL = { sum: 'Total', avg: 'Average', min: 'Lowest', max: 'Highest' } as const

/** [from, to] for the last `days` days ending today, as UTC dates. */
export function rangeFor(days: number, now = Date.now()): { from: string; to: string } {
  const to = new Date(now).toISOString().slice(0, 10)
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1) * DAY).toISOString().slice(0, 10)
  return { from, to }
}

export function OperatorSeriesPanel({ appId, resource, getToken, onReauth }: {
  appId: string
  resource: OperatorResource
  getToken: () => string | null
  onReauth?: () => void
}) {
  const series = resource.series!
  const presets = [...new Set([...PRESETS.filter((d) => d <= series.range.max_days), series.range.default_days])].sort((a, b) => a - b)
  const grains = SERIES_GRAINS.slice(SERIES_GRAINS.indexOf(series.time.grain))
  const [days, setDays] = useState(series.range.default_days)
  const [grain, setGrain] = useState<SeriesGrain>(series.time.grain)
  const [data, setData] = useState<OperatorSeriesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reauth, setReauth] = useState(false)

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) { setError('Your session has expired. Sign in again.'); setLoading(false); return }
    setLoading(true)
    try {
      setData(await fetchOperatorSeries(token, appId, resource.id, { ...rangeFor(days), grain }))
      setError(null)
      setReauth(false)
    } catch (e) {
      setError(operatorErrorMessage(e))
      setReauth(needsReauth(e))
    } finally {
      setLoading(false)
    }
  }, [appId, resource.id, days, grain, getToken])

  useEffect(() => { load() }, [load])

  // Defend against a partial body: no measures reads as no data, never a crash.
  const measures = Array.isArray(data?.measures) ? data.measures : []
  const empty = measures.every((m) => (m.series ?? []).every((s) => s.values.every((v) => v === null)))

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6" aria-busy={loading}>
      <h4 className="display-font text-base font-bold text-[var(--ink)]">{resource.title}</h4>
      {resource.description && <p className="mt-1 text-sm text-[var(--muted)]">{resource.description}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label={`${resource.title} range`} className="flex flex-wrap gap-1">
          {presets.map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${days === d ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--ink)]'}`}>
              Last {d} days
            </button>
          ))}
        </div>
        {grains.length > 1 && (
          <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            Group by
            <select value={grain} onChange={(e) => setGrain(e.target.value as SeriesGrain)}
              className="rounded-lg border border-[var(--line-strong)] bg-transparent px-2 py-1 text-xs text-[var(--ink)]">
              {grains.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="mt-4">
        {error && (
          <div>
            <p role="alert" className="text-sm text-[var(--error)]">{error}</p>
            {reauth && onReauth && (
              <button type="button" onClick={onReauth}
                className="mt-2 rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-sm font-medium text-[var(--ink)]">
                Sign in again
              </button>
            )}
          </div>
        )}
        {!error && !data && <p className="text-sm text-[var(--muted)]">Loading...</p>}
        {!error && data && (
          <div className={loading ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {measures.map((m) => (
                <Kpi key={m.column} label={`${m.label} · ${AGGREGATION_LABEL[m.aggregation]}`} value={formatMeasure(m.summary, m.unit, m.currency)} />
              ))}
            </div>
            {empty && <p className="mt-4 text-sm text-[var(--muted)]">No data in this range.</p>}
            {!empty && measures.map((m) => (
              <figure key={m.column} className="mt-5">
                <figcaption className="mb-2 text-sm font-semibold text-[var(--ink)]">
                  {m.label}{data.dimension ? ` by ${data.dimension.label}` : ''}
                </figcaption>
                <OperatorLineChart label={m.label} buckets={data.buckets} grain={data.grain}
                  series={m.series.map((s) => ({ name: s.dimension, values: s.values }))}
                  format={(v) => formatMeasure(v, m.unit, m.currency)} />
              </figure>
            ))}
            {data.omitted > 0 && data.dimension && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                {data.omitted} more {data.dimension.label.toLowerCase()} {data.omitted === 1 ? 'value' : 'values'} not shown (smallest totals).
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
