/**
 * A small accessible line chart for one operator metric measure (#240): one
 * line per breakdown value (or a single line with a light area wash), gaps
 * where a bucket had no data (never drawn as zero), a crosshair tooltip on
 * hover and on the arrow keys, a legend for two or more series with direct end
 * labels for up to four, and a data table for everyone. One chart per measure,
 * one y-axis. Series colours come from the `--series-N` slots in index.css
 * (validated for light and dark); text always wears ink tokens. Every label
 * the app supplies is rendered as text.
 */

import { useState, useRef, useEffect, type KeyboardEvent, type PointerEvent } from 'react'
import type { SeriesGrain } from './operator'

const DEFAULT_WIDTH = 640
const MIN_WIDTH = 280
const H = 220
const TOP = 12
const BOTTOM = 28
const TICKS = 4
/** Approximate width of one 11px tick character, for sizing the y-axis gutter to its longest label. */
const CHAR = 6.6

export interface ChartSeries { name: string | null; values: (number | null)[] }

export function formatBucket(key: string, grain: SeriesGrain): string {
  const d = new Date(`${key}T00:00:00Z`)
  if (grain === 'month') return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })
  const day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return grain === 'week' ? `Week of ${day}` : day
}

/** Clean tick values spanning [lo, hi]. */
function ticks(lo: number, hi: number): number[] {
  const raw = (hi - lo) / TICKS || 1
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? raw
  const start = Math.floor(lo / step) * step
  const out: number[] = []
  for (let v = start; v <= hi + step / 2 && out.length <= TICKS + 2; v += step) out.push(Number(v.toPrecision(12)))
  return out
}

/** Runs of consecutive non-null points: a line never bridges a bucket with no data. */
function runs(values: (number | null)[]): { i: number; v: number }[][] {
  const out: { i: number; v: number }[][] = []
  let run: { i: number; v: number }[] = []
  values.forEach((v, i) => {
    if (v === null) { if (run.length) out.push(run); run = [] } else run.push({ i, v })
  })
  if (run.length) out.push(run)
  return out
}

export function OperatorLineChart({ label, buckets, grain, series, format }: {
  label: string
  buckets: string[]
  grain: SeriesGrain
  series: ChartSeries[]
  format: (v: number | null) => string
}) {
  const [active, setActive] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  // Drawn at the container's real width, so text stays 11px on a phone instead of shrinking with a scaled SVG.
  const [W, setW] = useState(DEFAULT_WIDTH)
  useEffect(() => {
    const el = boxRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => { if (entry) setW(Math.max(MIN_WIDTH, Math.round(entry.contentRect.width))) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const named = series.length > 1
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null)
  const lo = Math.min(0, ...all)
  const hiRaw = Math.max(0, ...all)
  const yTicks = ticks(lo, hiRaw === lo ? lo + 1 : hiRaw)
  const yMin = yTicks[0]!
  const yMax = yTicks[yTicks.length - 1]!
  const LEFT = Math.max(32, Math.ceil(Math.max(...yTicks.map((t) => format(t).length)) * CHAR) + 12)
  // Direct end labels need a gutter; on a narrow chart the legend and tooltip carry identity instead.
  const labelled = named && series.length <= 4 && W >= 480
  const right = labelled ? 96 : 16
  const plotW = W - LEFT - right
  const plotH = H - TOP - BOTTOM
  const x = (i: number) => LEFT + (buckets.length <= 1 ? plotW / 2 : (i * plotW) / (buckets.length - 1))
  const y = (v: number) => TOP + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH
  const color = (k: number) => `var(--series-${(k % 8) + 1})`
  const nameOf = (s: ChartSeries) => s.name ?? label

  // Direct end labels: at each series' last point, skipped when they would collide (the legend still names every line).
  const ends: { k: number; y: number }[] = []
  if (labelled) {
    series.map((s, k) => ({ k, last: [...runs(s.values)].pop()?.pop() }))
      .filter((e) => e.last)
      .sort((a, b) => y(a.last!.v) - y(b.last!.v))
      .forEach((e) => { const ey = y(e.last!.v); if (ends.every((p) => Math.abs(p.y - ey) >= 12)) ends.push({ k: e.k, y: ey }) })
  }

  const move = (e: PointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect()
    if (!box || box.width === 0 || buckets.length === 0) return
    const px = ((e.clientX - box.left) / box.width) * W
    const i = buckets.length <= 1 ? 0 : Math.round(((px - LEFT) / plotW) * (buckets.length - 1))
    setActive(Math.max(0, Math.min(buckets.length - 1, i)))
  }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = buckets.length - 1
    const next = { ArrowLeft: (active ?? last) - 1, ArrowRight: (active ?? -1) + 1, Home: 0, End: last }[e.key]
    if (e.key === 'Escape') { setActive(null); return }
    if (next === undefined) return
    e.preventDefault()
    setActive(Math.max(0, Math.min(last, next)))
  }
  const readout = active === null ? '' : `${formatBucket(buckets[active]!, grain)}: ${series.map((s) => `${nameOf(s)} ${format(s.values[active] ?? null)}`).join(', ')}`

  return (
    <div className="viz-root">
      {named && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]" aria-label={`${label} series`}>
          {series.map((s, k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block w-4 border-t-2" style={{ borderColor: color(k) }} />
              {nameOf(s)}
            </li>
          ))}
        </ul>
      )}
      <div
        ref={boxRef}
        tabIndex={0}
        role="group"
        aria-label={`${label} over time. Use the left and right arrow keys to read each ${grain}.`}
        onKeyDown={key}
        onFocus={() => setActive((a) => a ?? buckets.length - 1)}
        onBlur={() => setActive(null)}
        className="relative rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto touch-none" aria-hidden="true"
          onPointerMove={move} onPointerLeave={() => setActive(null)}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={LEFT} x2={W - right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={LEFT - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>{format(t)}</text>
            </g>
          ))}
          {/* First and last dates always; the middle one only where it cannot collide. */}
          {[0, ...(W >= 480 ? [Math.floor((buckets.length - 1) / 2)] : []), buckets.length - 1].filter((i, n, a) => i >= 0 && a.indexOf(i) === n).map((i) => (
            <text key={i} x={x(i)} y={H - 8} fontSize={11} fill="var(--muted)"
              textAnchor={i === 0 ? 'start' : i === buckets.length - 1 ? 'end' : 'middle'}>{formatBucket(buckets[i]!, grain)}</text>
          ))}
          {series.map((s, k) => runs(s.values).map((run, r) => (
            <g key={`${k}-${r}`}>
              {!named && run.length > 1 && (
                <path d={`M${x(run[0]!.i)},${y(Math.max(yMin, 0))} ${run.map((p) => `L${x(p.i)},${y(p.v)}`).join(' ')} L${x(run[run.length - 1]!.i)},${y(Math.max(yMin, 0))}Z`}
                  fill={color(k)} opacity={0.1} />
              )}
              {run.length > 1
                ? <path d={run.map((p, n) => `${n ? 'L' : 'M'}${x(p.i)},${y(p.v)}`).join(' ')} fill="none" stroke={color(k)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                : <circle cx={x(run[0]!.i)} cy={y(run[0]!.v)} r={4} fill={color(k)} stroke="var(--paper)" strokeWidth={2} />}
            </g>
          )))}
          {ends.map((e) => (
            <text key={e.k} x={W - right + 8} y={e.y} dy="0.32em" fontSize={11} fill="var(--muted)">{nameOf(series[e.k]!).slice(0, 14)}</text>
          ))}
          {active !== null && (
            <g>
              <line x1={x(active)} x2={x(active)} y1={TOP} y2={TOP + plotH} stroke="var(--muted)" strokeWidth={1} />
              {series.map((s, k) => {
                const v = s.values[active]
                return v === null || v === undefined ? null
                  : <circle key={k} cx={x(active)} cy={y(v)} r={4} fill={color(k)} stroke="var(--paper)" strokeWidth={2} />
              })}
            </g>
          )}
        </svg>
        {active !== null && (
          <div className="pointer-events-none absolute top-0 z-10 min-w-[9rem] max-w-[14rem] rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-xs shadow"
            style={x(active) > W / 2 ? { right: `${((W - x(active)) / W) * 100 + 2}%` } : { left: `${(x(active) / W) * 100 + 2}%` }}>
            <p className="text-[var(--muted)]">{formatBucket(buckets[active]!, grain)}</p>
            {series.map((s, k) => (
              <p key={k} className="mt-1 flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-block w-3 border-t-2" style={{ borderColor: color(k) }} />
                <strong className="text-[var(--ink)]">{format(s.values[active] ?? null)}</strong>
                <span className="truncate text-[var(--muted)]">{nameOf(s)}</span>
              </p>
            ))}
          </div>
        )}
        <p className="sr-only" aria-live="polite">{readout}</p>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-[var(--muted)] hover:text-[var(--ink)]">Show data table</summary>
        <div className="mt-2 max-h-72 overflow-auto">
          <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <caption className="sr-only">{label} by {grain}</caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                <th scope="col" className="py-1 pr-4 font-semibold">{grain === 'month' ? 'Month' : grain === 'week' ? 'Week' : 'Day'}</th>
                {series.map((s, k) => <th key={k} scope="col" className="py-1 pr-4 font-semibold text-right">{nameOf(s)}</th>)}
              </tr>
            </thead>
            <tbody>
              {buckets.map((b, i) => (
                <tr key={b} className="border-t border-[var(--line)]">
                  <th scope="row" className="py-1 pr-4 font-normal text-left text-[var(--ink)]">{formatBucket(b, grain)}</th>
                  {series.map((s, k) => <td key={k} className="py-1 pr-4 text-right text-[var(--ink)]">{format(s.values[i] ?? null)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
