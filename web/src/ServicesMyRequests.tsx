import { useState, useEffect, useCallback } from 'react'
import { API_BASE, authHeaders } from './api'

interface MyRequest {
  id: string
  title: string
  description: string
  budgetCents: number | null
  status: string
  acceptedBy: string | null
  devLogin: string | null
  engagementId: string | null
  createdAt: number
  updatedAt: number
}

export function MyRequestsTab({ token }: { token: string | null }) {
  const [requests, setRequests] = useState<MyRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return }
    try {
      const res = await fetch(`${API_BASE}/services/my-requests`, { headers: authHeaders(token) })
      if (res.ok) { setRequests(((await res.json()) as { requests: MyRequest[] }).requests); setError(null) }
      else setError('Failed to load')
    } catch { setError('Network error') }
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  const cancel = async (id: string) => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/services/requests/${id}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      })
      if (res.ok) load()
    } catch { /* */ }
  }

  if (loading) return <p className="py-8 text-center text-sm text-[var(--muted)]">Loading your requests...</p>
  if (error) return <p className="py-8 text-center text-sm text-[var(--error)]">{error} <button type="button" onClick={load} className="underline ml-1">Retry</button></p>

  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--line-strong)] p-12 text-center max-w-xl">
        <p className="text-[var(--muted)]">
          You haven't posted any build requests yet. Go to the Requests tab to post one, or hire a developer directly from the directory.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-3">
      {requests.map((r) => (
        <div key={r.id} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-[var(--ink)]">{r.title}</p>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase ${
                  r.status === 'open' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : r.status === 'accepted' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}>{r.status}</span>
              </div>
              <p className="text-xs text-[var(--muted)] line-clamp-2">{r.description}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-[var(--muted)]">
                {r.budgetCents && <span>Budget: ${(r.budgetCents / 100).toFixed(0)}</span>}
                <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                {r.devLogin && <span>Developer: <strong className="text-[var(--ink)]">{r.devLogin}</strong></span>}
              </div>
            </div>
            <div className="flex-shrink-0">
              {r.status === 'open' && (
                <button type="button" onClick={() => cancel(r.id)}
                  className="rounded-lg border border-[var(--error)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--error)] hover:bg-[var(--error)]/10">
                  Cancel
                </button>
              )}
              {r.status === 'accepted' && r.engagementId && (
                <span className="text-xs text-[var(--accent)] font-semibold">In progress</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
