import { useState, useEffect, useCallback } from 'react'
import { API_BASE, authHeaders } from './api'
import type { BuildRequest } from './servicesTypes'

export function RequestsTab({ token }: { token: string | null }) {
  const [requests, setRequests] = useState<BuildRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [budget, setBudget] = useState('')
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const [acceptStatus, setAcceptStatus] = useState<{ id: string; type: 'ok' | 'error'; msg: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/services/requests`)
      if (res.ok) { setRequests(((await res.json()) as { requests: BuildRequest[] }).requests); setLoadError(null) }
      else setLoadError('Failed to load requests')
    } catch { setLoadError('Network error') }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const post = async () => {
    if (!token || !title.trim() || !desc.trim()) return
    setPosting(true)
    setPostError(null)
    try {
      const res = await fetch(`${API_BASE}/services/requests`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: desc.trim(),
          budgetCents: budget ? Math.round(parseFloat(budget) * 100) : undefined,
        }),
      })
      if (res.ok) { setShowNew(false); setTitle(''); setDesc(''); setBudget(''); load() }
      else { const err = await res.json().catch(() => ({ error: 'failed' })) as { error: string }; setPostError(err.error) }
    } catch (e) { setPostError((e as Error).message) }
    setPosting(false)
  }

  const accept = async (reqId: string) => {
    if (!token) return
    setAcceptStatus(null)
    try {
      const res = await fetch(`${API_BASE}/services/requests/${reqId}/accept`, {
        method: 'POST',
        headers: authHeaders(token),
      })
      if (res.ok) {
        setAcceptStatus({ id: reqId, type: 'ok', msg: 'Accepted! Check the Engagements tab.' })
        load()
      } else {
        const err = await res.json().catch(() => ({ error: 'failed' })) as { error: string }
        setAcceptStatus({ id: reqId, type: 'error', msg: err.error })
      }
    } catch (e) { setAcceptStatus({ id: reqId, type: 'error', msg: (e as Error).message }) }
  }

  if (loading) return <p className="py-8 text-center text-sm text-[var(--muted)]">Loading requests...</p>
  if (loadError) return <p className="py-8 text-center text-sm text-[var(--error)]">{loadError} <button type="button" onClick={load} className="underline ml-1">Retry</button></p>

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="display-font text-lg font-bold text-[var(--ink)]">Build Requests</h3>
        {token && (
          <button type="button" onClick={() => { setShowNew(!showNew); setPostError(null) }}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
            {showNew ? 'Cancel' : '+ Post Request'}
          </button>
        )}
      </div>

      {showNew && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-3">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What do you want built?"
            aria-label="Build request title"
            className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm" />
          <textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)}
            placeholder="Describe the app in detail — features, target users, any tech preferences..."
            aria-label="Build request description"
            className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--muted)]">Budget (optional): $</span>
            <input type="number" min="10" step="10" value={budget} onChange={(e) => setBudget(e.target.value)}
              placeholder="—" aria-label="Budget amount"
              className="w-24 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm" />
          </div>
          {postError && <p className="text-xs text-[var(--error)]">{postError}</p>}
          <button type="button" onClick={post} disabled={posting || !title.trim() || !desc.trim()}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {posting ? 'Posting...' : 'Post Request'}
          </button>
        </div>
      )}

      {acceptStatus && (
        <div className={`rounded-lg px-4 py-2 text-sm font-medium ${acceptStatus.type === 'ok' ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--error)]/10 text-[var(--error)]'}`}>
          {acceptStatus.msg}
        </div>
      )}

      {requests.length === 0 && !showNew && (
        <div className="rounded-2xl border border-dashed border-[var(--line-strong)] p-12 text-center">
          <p className="text-[var(--muted)]">No open build requests. Post one to find a developer, or browse the directory.</p>
        </div>
      )}

      {requests.map((r) => (
        <div key={r.id} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-[var(--ink)]">{r.title}</p>
              <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2">{r.description}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-[var(--muted)]">
                <span>by {r.clientLogin}</span>
                {r.budgetCents && <span className="font-semibold">Budget: ${(r.budgetCents / 100).toFixed(0)}</span>}
                <span>{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            {token && (
              <button type="button" onClick={() => accept(r.id)}
                className="flex-shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                Accept
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
