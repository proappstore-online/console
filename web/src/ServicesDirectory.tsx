import { useState, useEffect, useCallback, useRef } from 'react'
import { API_BASE, authHeaders } from './api'
import type { DevProfile } from './servicesTypes'

interface DevWithBadges extends DevProfile {
  badges?: string[]
}

export function DirectoryTab({ token }: { token: string | null }) {
  const [devs, setDevs] = useState<DevWithBadges[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hiring, setHiring] = useState<string | null>(null)
  const [hireDesc, setHireDesc] = useState('')
  const [hireStatus, setHireStatus] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null)

  // Filters
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('quality')
  const [maxRate, setMaxRate] = useState('')

  const [hiringBusy, setHiringBusy] = useState(false)

  const doSearch = useCallback(async (q: string, s: string, mr: string) => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (s !== 'quality') params.set('sort', s)
    if (mr) params.set('maxRate', String(Math.round(parseFloat(mr) * 100)))
    const qs = params.toString()
    try {
      const res = await fetch(`${API_BASE}/services/developers${qs ? `?${qs}` : ''}`)
      if (res.ok) setDevs(((await res.json()) as { developers: DevWithBadges[] }).developers)
      else setError('Failed to load')
    } catch { setError('Network error') }
    setLoading(false)
  }, [])

  // Debounce search: 400ms after last change
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(query, sort, maxRate), 400)
    return () => clearTimeout(timerRef.current)
  }, [query, sort, maxRate, doSearch])

  const hire = async (devId: string) => {
    if (!token || hiringBusy) return
    setHiringBusy(true)
    setHireStatus(null)
    try {
      const res = await fetch(`${API_BASE}/services/engagements`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ developerId: devId, description: hireDesc || undefined }),
      })
      if (res.ok) {
        setHiring(null)
        setHireDesc('')
        setHireStatus({ type: 'ok', msg: 'Engagement created! Check the Engagements tab.' })
        setTimeout(() => setHireStatus(null), 4000)
      } else {
        const err = await res.json().catch(() => ({ error: 'failed' })) as { error: string }
        setHireStatus({ type: 'error', msg: err.error })
      }
    } catch (e) { setHireStatus({ type: 'error', msg: (e as Error).message }) }
    setHiringBusy(false)
  }

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search developers..."
          aria-label="Search developers"
          className="flex-1 min-w-[200px] rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm"
        />
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by"
          className="rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)]">
          <option value="quality">Best quality</option>
          <option value="rate">Lowest rate</option>
          <option value="rating">Highest rating</option>
          <option value="engagements">Most experienced</option>
        </select>
        <div className="flex items-center gap-1">
          <span className="text-xs text-[var(--muted)]">Max $/prompt:</span>
          <input type="number" min="0.10" step="0.50" value={maxRate}
            onChange={(e) => setMaxRate(e.target.value)}
            placeholder="any" aria-label="Max rate per prompt"
            className="w-20 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-2 text-sm" />
        </div>
      </div>

      {hireStatus && (
        <div className={`rounded-lg px-4 py-2 text-sm font-medium ${hireStatus.type === 'ok' ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--error)]/10 text-[var(--error)]'}`}>
          {hireStatus.msg}
        </div>
      )}

      {loading && <p className="py-8 text-center text-sm text-[var(--muted)]">Loading developers...</p>}
      {error && <p className="py-8 text-center text-sm text-[var(--error)]">{error}</p>}

      {!loading && !error && devs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--line-strong)] p-12 text-center">
          <p className="text-[var(--muted)]">
            {query ? 'No developers match your search.' : 'No developers available yet. Be the first — switch to "My Profile" and set your rate.'}
          </p>
        </div>
      )}

      {!loading && !error && devs.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {devs.map((d) => (
            <div key={d.creatorId} className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 hover:border-[var(--accent)] transition-colors">
              <div className="flex items-center gap-3 mb-3">
                {d.avatarUrl ? (
                  <img src={d.avatarUrl} alt="" className="w-10 h-10 rounded-full ring-1 ring-[var(--line-strong)]" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-sm font-bold">
                    {(d.login ?? d.creatorId).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--ink)] truncate">{d.login ?? d.creatorId}</p>
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span className="font-bold text-[var(--accent)]">${(d.promptRateCents / 100).toFixed(2)}/prompt</span>
                    {d.available && <span className="text-[var(--success)]">Available</span>}
                  </div>
                </div>
              </div>

              {/* Badges */}
              {d.badges && d.badges.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {d.badges.map((b) => (
                    <span key={b} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      b === 'top-rated' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : b === 'expert' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    }`}>
                      {b.replace('-', ' ')}
                    </span>
                  ))}
                </div>
              )}

              {d.bioServices && (
                <p className="text-xs text-[var(--muted)] line-clamp-2 mb-3">{d.bioServices}</p>
              )}

              <div className="grid grid-cols-4 gap-2 text-center mb-3">
                <div><p className="text-xs text-[var(--muted)]">Apps</p><p className="text-sm font-bold text-[var(--ink)]">{d.appCount ?? 0}</p></div>
                <div><p className="text-xs text-[var(--muted)]">Quality</p><p className="text-sm font-bold text-[var(--ink)]">{d.qualityScore?.toFixed(1) ?? '—'}</p></div>
                <div><p className="text-xs text-[var(--muted)]">Jobs</p><p className="text-sm font-bold text-[var(--ink)]">{d.completedEngagements}</p></div>
                <div><p className="text-xs text-[var(--muted)]">Rating</p><p className="text-sm font-bold text-[var(--ink)]">{d.avgRating ? `${d.avgRating.toFixed(1)}` : '—'}</p></div>
              </div>

              {!token ? (
                <p className="text-xs text-[var(--muted)] text-center">Sign in to hire</p>
              ) : hiring === d.creatorId ? (
                <div className="space-y-2">
                  <textarea rows={2} value={hireDesc} onChange={(e) => setHireDesc(e.target.value)}
                    placeholder="Describe what you want built (optional)"
                    aria-label="Project description"
                    className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1.5 text-xs" />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => hire(d.creatorId)} disabled={hiringBusy}
                      className="flex-1 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">{hiringBusy ? 'Creating...' : 'Confirm'}</button>
                    <button type="button" onClick={() => { setHiring(null); setHireStatus(null) }}
                      className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--ink)]">Cancel</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setHiring(d.creatorId)}
                  className="w-full rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                  Hire — ${(d.promptRateCents / 100).toFixed(2)}/prompt
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
