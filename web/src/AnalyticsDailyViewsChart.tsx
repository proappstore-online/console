import { useMemo } from "react"
import type { AnalyticsStats } from "./analytics"

export function DailyViewsChart({
  series,
  bucket,
}: {
  series: AnalyticsStats['series']
  bucket: 'hour' | 'day'
}) {
  const { bars, maxViews } = useMemo(() => {
    const vs = series.map((d) => d.views)
    return { bars: vs, maxViews: Math.max(1, ...vs) }
  }, [series])

  if (series.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        No {bucket === 'hour' ? 'hourly' : 'daily'} data in this window.
      </p>
    )
  }

  // For hour buckets the `t` looks like "2026-05-21 14:00:00"; show just
  // "14:00". For day buckets it's "2026-05-21"; show "05-21".
  const labelFor = (t: string): string => {
    if (bucket === 'hour') return t.slice(11, 16) || t
    return t.slice(5, 10) || t
  }

  const W = 600
  const H = 120
  const gap = 2
  const slot = W / series.length
  const barW = Math.max(1, slot - gap)

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${bucket === 'hour' ? 'Hourly' : 'Daily'} page views (${series.length} ${bucket}s)`}
        className="w-full h-32 block"
      >
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="currentColor" strokeOpacity="0.15" />
        {bars.map((v, i) => {
          const h = (v / maxViews) * (H - 2)
          return (
            <rect
              key={series[i].t}
              x={i * slot}
              y={H - h}
              width={barW}
              height={h}
              fill="var(--accent)"
              opacity={v > 0 ? 0.85 : 0.2}
            >
              <title>{`${series[i].t}: ${v} view${v === 1 ? '' : 's'}`}</title>
            </rect>
          )
        })}
      </svg>
      <div className="flex justify-between mt-1 text-[10px] text-[var(--muted)]">
        <span>{labelFor(series[0]?.t ?? '')}</span>
        <span>peak {maxViews}</span>
        <span>{labelFor(series[series.length - 1]?.t ?? '')}</span>
      </div>
    </div>
  )
}
