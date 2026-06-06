/**
 * Deploy status banner — shows at the top of the Build board when any ticket
 * is in 'deploying' status. Live elapsed timer, progress steps, and a
 * collapsible deploy history from the activity log.
 */
import { useState, useEffect } from 'react'
import type { Ticket, ActivityEntry } from './types'

/** Extract deploy-related activity entries and group by ticket. */
function deployHistory(activity: ActivityEntry[]): { ticketId: string | null; entries: ActivityEntry[]; ok: boolean; startedAt: number; finishedAt: number }[] {
  const deploys: { ticketId: string | null; entries: ActivityEntry[]; ok: boolean; startedAt: number; finishedAt: number }[] = []
  let current: typeof deploys[0] | null = null

  for (const a of activity) {
    if (a.type !== 'deploy' && a.type !== 'transition') continue
    const isDeploy = a.type === 'deploy'
    const isDeployTransition = a.type === 'transition' && a.detail.includes('deploying')

    if (isDeploy && a.detail.includes('Pushed')) {
      // New deploy started
      if (current) deploys.push(current)
      current = { ticketId: null, entries: [a], ok: false, startedAt: a.timestamp, finishedAt: a.timestamp }
    } else if (current && isDeploy) {
      current.entries.push(a)
      current.finishedAt = a.timestamp
      if (a.detail.includes('Deployed live')) current.ok = true
      if (a.detail.includes('FAILED') || a.detail.includes('BLOCKED')) current.ok = false
    }
  }
  if (current) deploys.push(current)
  return deploys.reverse() // newest first
}

function DeployTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000))
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return <span className="font-mono tabular-nums">{m}:{s.toString().padStart(2, '0')}</span>
}

export function DeployBanner({ tickets, activity }: { tickets: Ticket[]; activity: ActivityEntry[] }) {
  const [showHistory, setShowHistory] = useState(false)
  const deploying = tickets.filter(t => t.status === 'deploying')
  const history = deployHistory(activity)

  if (deploying.length === 0 && history.length === 0) return null

  // Find the latest deploy activity for the current deploying ticket
  const latestDeployActivity = activity.filter(a => a.type === 'deploy').slice(-1)[0]
  const deployStartedAt = deploying.length > 0
    ? (activity.find(a => a.type === 'deploy' && a.detail.includes('Pushed'))?.timestamp ?? Date.now())
    : 0

  return (
    <div className="space-y-1">
      {/* Active deploy banner */}
      {deploying.length > 0 && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <svg className="animate-spin text-cyan-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">Deploying</span>
          </div>
          <span className="text-xs text-[var(--muted)]">
            {deploying.map(t => `#${t.seq} ${t.title}`).join(', ').slice(0, 60)}
          </span>
          {deployStartedAt > 0 && (
            <span className="text-xs text-cyan-600 dark:text-cyan-400 ml-auto">
              <DeployTimer startedAt={deployStartedAt} />
            </span>
          )}
          {latestDeployActivity && (
            <span className="text-[10px] text-[var(--muted)] truncate max-w-[200px]">
              {latestDeployActivity.detail.replace(/^(Pushed|Deploy|Waiting|Build)/, '').trim().slice(0, 50)}
            </span>
          )}
        </div>
      )}

      {/* Deploy history toggle */}
      {history.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowHistory(h => !h)}
            className="text-[10px] text-[var(--muted)] hover:text-[var(--ink)] font-semibold">
            {showHistory ? 'Hide' : 'Show'} deploy history ({history.length})
          </button>
          {showHistory && (
            <div className="mt-1 space-y-1 max-h-48 overflow-y-auto">
              {history.slice(0, 20).map((d, i) => {
                const duration = Math.round((d.finishedAt - d.startedAt) / 1000)
                const durationStr = duration >= 60 ? `${Math.floor(duration / 60)}m${duration % 60}s` : `${duration}s`
                return (
                  <div key={i} className={`rounded border px-2 py-1 text-[10px] ${d.ok ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${d.ok ? 'text-green-600' : 'text-red-600'}`}>{d.ok ? 'PASS' : 'FAIL'}</span>
                      <span className="text-[var(--muted)] font-mono">{durationStr}</span>
                      <span className="text-[var(--muted)]">{new Date(d.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="text-[var(--muted)] truncate flex-1">{d.entries[0]?.detail.slice(0, 60)}</span>
                    </div>
                    {!d.ok && d.entries.length > 1 && (
                      <div className="mt-0.5 text-red-600 truncate">{d.entries[d.entries.length - 1]?.detail.slice(0, 100)}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
