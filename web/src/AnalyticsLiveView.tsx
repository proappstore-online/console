import { useState, useEffect } from "react"
import { fetchAnalyticsLive, formatViewCount, type LiveResponse } from "./analytics"

/**
 * Live view: polls /v1/apps/:id/analytics/live every 30s and shows a
 * pulsing "X right now" counter + the hottest paths in the last 5 minutes.
 * Renders nothing while loading the first response so we don't flash 0 →
 * real-count on every navigation.
 */
export function LiveView({ appId, getToken }: { appId: string; getToken: () => string | null }) {
  const [data, setData] = useState<LiveResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const tick = () => {
      const token = getToken()
      if (!token) return
      fetchAnalyticsLive(token, appId)
        .then((r) => {
          if (!cancelled) {
            setData(r)
            setError(null)
          }
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message)
        })
    }
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [appId, getToken])

  if (error && !data) return null // silent if live endpoint isn't deployed yet
  if (!data) return null

  return (
    <div className="mt-5 flex items-center gap-3 rounded-xl bg-[var(--panel)] border border-[var(--line)] px-4 py-2">
      <span className="relative inline-flex h-2.5 w-2.5">
        <span
          className={`absolute inline-flex h-full w-full rounded-full bg-[var(--success)] ${data.views > 0 ? 'animate-ping opacity-60' : 'opacity-30'}`}
        />
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${data.views > 0 ? 'bg-[var(--success)]' : 'bg-[var(--muted)]'}`}
        />
      </span>
      <div className="text-sm">
        <span className="font-bold text-[var(--ink)] tabular-nums">{formatViewCount(data.views ?? 0)}</span>{' '}
        <span className="text-[var(--muted)]">page view{data.views === 1 ? '' : 's'} in the last 5 min</span>
        {(data.top_paths?.length ?? 0) > 0 && (
          <>
            {' · hot now: '}
            {(data.top_paths ?? []).slice(0, 3).map((p, i) => (
              <span key={p.path}>
                {i > 0 && ', '}
                <span className="font-mono text-xs">{p.path || '/'}</span>
                <span className="text-[var(--muted)] text-xs">{` (${p.views})`}</span>
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
