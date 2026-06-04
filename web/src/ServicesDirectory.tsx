import { useState, useEffect } from 'react'
import { API_BASE, authHeaders } from './api'
import type { DevProfile } from './servicesTypes'

export function DirectoryTab({ token }: { token: string | null }) {
  const [devs, setDevs] = useState<DevProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [hiring, setHiring] = useState<string | null>(null)
  const [hireDesc, setHireDesc] = useState('')

  useEffect(() => {
    fetch(`${API_BASE}/services/developers`)
      .then(async (r) => { if (r.ok) setDevs(((await r.json()) as { developers: DevProfile[] }).developers) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const hire = async (devId: string) => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/services/engagements`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ developerId: devId, description: hireDesc || undefined }),
      })
      if (res.ok) {
        setHiring(null)
        setHireDesc('')
        alert('Engagement created! Check the Engagements tab.')
      } else {
        const err = await res.json().catch(() => ({ error: 'failed' })) as { error: string }
        alert(err.error)
      }
    } catch (e) { alert((e as Error).message) }
  }

  if (loading) return <p className="py-8 text-center text-sm text-[var(--muted)]">Loading developers...</p>

  if (devs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--line-strong)] p-12 text-center max-w-xl">
        <p className="text-[var(--muted)]">
          No developers available yet. Be the first — switch to "My Profile" and set your rate.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl">
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

          {d.bioServices && (
            <p className="text-xs text-[var(--muted)] line-clamp-2 mb-3">{d.bioServices}</p>
          )}

          <div className="grid grid-cols-4 gap-2 text-center mb-3">
            <div>
              <p className="text-xs text-[var(--muted)]">Apps</p>
              <p className="text-sm font-bold text-[var(--ink)]">{d.appCount ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Quality</p>
              <p className="text-sm font-bold text-[var(--ink)]">{d.qualityScore?.toFixed(1) ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Jobs</p>
              <p className="text-sm font-bold text-[var(--ink)]">{d.completedEngagements}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Rating</p>
              <p className="text-sm font-bold text-[var(--ink)]">{d.avgRating ? `${d.avgRating.toFixed(1)}` : '—'}</p>
            </div>
          </div>

          {hiring === d.creatorId ? (
            <div className="space-y-2">
              <textarea rows={2} value={hireDesc} onChange={(e) => setHireDesc(e.target.value)}
                placeholder="Describe what you want built (optional)"
                aria-label="Project description"
                className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1.5 text-xs" />
              <div className="flex gap-2">
                <button type="button" onClick={() => hire(d.creatorId)}
                  className="flex-1 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">Confirm</button>
                <button type="button" onClick={() => setHiring(null)}
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
  )
}
