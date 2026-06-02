import { formatViewCount, type AnalyticsStats } from "./analytics"
import { Kpi } from "./AppDetailSections"
import { DiagnosticsHint } from "./AnalyticsDiagnostics"
import { DailyViewsChart } from "./AnalyticsDailyViewsChart"
import { RankedList } from "./AnalyticsRankedList"

export function AnalyticsBody({
  stats,
  days,
  kind = 'pageview',
  bucket = 'day',
  appId,
  getToken,
  activePath = '',
  onPickPath,
}: {
  stats: AnalyticsStats
  days: number
  kind?: string
  bucket?: 'hour' | 'day'
  appId: string
  getToken: () => string | null
  activePath?: string
  onPickPath?: (path: string) => void
}) {
  const isCustom = kind !== 'pageview'
  const isPathFiltered = activePath !== ''
  const noun = isCustom ? `${kind} events` : 'page views'
  const windowLabel = days === 1 ? 'in the last 24h' : `in the last ${days} days`
  if (stats.total_views === 0) {
    return (
      <DiagnosticsHint
        appId={appId}
        getToken={getToken}
        noun={noun}
        windowLabel={windowLabel}
        isCustom={isCustom}
        kind={kind}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi
          label={`${isCustom ? noun : 'Page views'} (${days === 1 ? '24h' : `${days}d`})`}
          value={formatViewCount(stats.total_views)}
        />
        <Kpi label={isCustom ? 'Unique paths fired on' : 'Unique paths'} value={String(stats.unique_paths)} />
        <Kpi label="Top country" value={stats.top_countries[0]?.country || '—'} />
      </div>

      <DailyViewsChart series={stats.series} bucket={bucket} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Top pages: hidden when we're already filtered to one path (the
            list would just be the active path with itself). Each row is a
            button that drills into that path when there's an onPickPath
            handler — turns the dashboard from "look at numbers" into
            "click into the hot page to see its referrers + chart." */}
        {!isPathFiltered && (
          <RankedList
            title={isCustom ? 'Top pages firing event' : 'Top pages'}
            rows={stats.top_paths.map((r) => ({ label: r.path || '/', value: r.views }))}
            onPick={!isCustom && onPickPath ? (label) => onPickPath(label) : undefined}
          />
        )}
        <RankedList title="Top referrers" rows={stats.top_referrers.map((r) => ({ label: r.referrer || '(direct)', value: r.views }))} />
        <RankedList title="Top countries" rows={stats.top_countries.map((r) => ({ label: r.country || '—', value: r.views }))} />
        <RankedList title="Device" rows={stats.device_split.map((r) => ({ label: r.device, value: r.views }))} />
      </div>
    </div>
  )
}
