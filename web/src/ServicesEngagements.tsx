import { useState, useEffect, useCallback, useRef } from 'react'
import { API_BASE, authHeaders } from './api'
import type { Engagement, ServiceMessage } from './servicesTypes'

export function EngagementsTab({ token }: { token: string | null }) {
  const [engs, setEngs] = useState<Engagement[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Engagement | null>(null)
  const [messages, setMessages] = useState<ServiceMessage[]>([])
  const [msgInput, setMsgInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const justSentRef = useRef(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  // Rating
  const [ratingScore, setRatingScore] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [ratingBusy, setRatingBusy] = useState(false)
  const [ratingDone, setRatingDone] = useState(false)
  const [ratingError, setRatingError] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return }
    try {
      const res = await fetch(`${API_BASE}/services/engagements`, { headers: authHeaders(token) })
      if (res.ok) { setEngs(((await res.json()) as { engagements: Engagement[] }).engagements); setLoadError(null) }
      else setLoadError('Failed to load engagements')
    } catch { setLoadError('Network error') }
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  const openChat = async (eng: Engagement) => {
    if (!token) return
    setSelected(eng)
    setMessages([])
    setSendError(null)
    setConfirmCancel(false)
    setStatusError(null)
    setLoadingMsgs(true)
    try {
      const res = await fetch(`${API_BASE}/services/engagements/${eng.id}/messages`, { headers: authHeaders(token) })
      if (res.ok) setMessages(((await res.json()) as { messages: ServiceMessage[] }).messages)
      else setSendError('Failed to load messages')
    } catch { setSendError('Network error loading messages') }
    setLoadingMsgs(false)
    setTimeout(scrollToBottom, 100)
    // Mark as read
    fetch(`${API_BASE}/services/engagements/${eng.id}/read`, {
      method: 'POST', headers: authHeaders(token),
    }).catch(() => {})
  }

  // Poll messages when chat is open
  useEffect(() => {
    if (!selected?.id || !token) return
    const engId = selected.id
    const poll = setInterval(async () => {
      if (document.hidden) return
      // Skip one poll cycle after a send to avoid replacing the optimistic message
      if (justSentRef.current) { justSentRef.current = false; return }
      try {
        const res = await fetch(`${API_BASE}/services/engagements/${engId}/messages`, { headers: authHeaders(token) })
        if (res.ok) {
          const data = (await res.json()) as { messages: ServiceMessage[] }
          setMessages((prev) => {
            const lastId = prev.at(-1)?.id
            const newLastId = data.messages.at(-1)?.id
            if (lastId !== newLastId || data.messages.length !== prev.length) {
              setTimeout(scrollToBottom, 50)
              return data.messages
            }
            return prev
          })
        }
      } catch { /* */ }
    }, 2000) // 2s poll for near-real-time chat
    return () => clearInterval(poll)
  }, [selected?.id, token])

  const sendMsg = async () => {
    if (!token || !selected || !msgInput.trim()) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(`${API_BASE}/services/engagements/${selected.id}/messages`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: msgInput.trim() }),
      })
      if (res.ok) {
        const msg = await res.json() as ServiceMessage
        setMessages((prev) => [...prev, msg])
        setMsgInput('')
        justSentRef.current = true // skip next poll to avoid replacing optimistic message
        load()
        setTimeout(scrollToBottom, 50)
      } else {
        const err = await res.json().catch(() => ({ error: 'Send failed' })) as { error: string }
        setSendError(err.error)
      }
    } catch (e) { setSendError((e as Error).message) }
    setSending(false)
  }

  const updateStatus = async (engId: string, status: string) => {
    if (!token) return
    setStatusBusy(true)
    setStatusError(null)
    try {
      const res = await fetch(`${API_BASE}/services/engagements/${engId}`, {
        method: 'PATCH',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        load()
        if (selected?.id === engId) setSelected(null)
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed' })) as { error: string }
        setStatusError(err.error)
      }
    } catch (e) { setStatusError((e as Error).message) }
    setStatusBusy(false)
    setConfirmCancel(false)
  }

  const submitRating = async () => {
    if (!token || !selected || ratingScore < 1) return
    setRatingBusy(true)
    setRatingError(null)
    try {
      const res = await fetch(`${API_BASE}/services/engagements/${selected.id}/rate`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: ratingScore, comment: ratingComment || undefined }),
      })
      if (res.ok || res.status === 409) {
        // 409 = already rated (on remount). Treat as success.
        setRatingDone(true)
      } else {
        const err = await res.json().catch(() => ({ error: 'failed' })) as { error: string }
        setRatingError(err.error)
      }
    } catch (e) { setRatingError((e as Error).message) }
    setRatingBusy(false)
  }

  if (loading) return <p className="py-8 text-center text-sm text-[var(--muted)]">Loading engagements...</p>
  if (loadError) return <p className="py-8 text-center text-sm text-[var(--error)]">{loadError} <button type="button" onClick={load} className="underline ml-1">Retry</button></p>

  if (selected) {
    return (
      <div className="max-w-2xl space-y-4">
        <button type="button" onClick={() => setSelected(null)}
          className="text-sm text-[var(--accent)] hover:underline">&larr; Back to engagements</button>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-bold text-[var(--ink)]">
                {selected.role === 'client' ? selected.devLogin ?? 'Developer' : selected.clientLogin ?? 'Client'}
              </h3>
              <StatusBadge status={selected.status} />
            </div>
            <div className="text-right text-xs text-[var(--muted)]">
              <p>${(selected.promptRateCents / 100).toFixed(2)}/prompt · {selected.promptsCount} prompts</p>
              <p className="font-semibold">${(selected.totalChargedCents / 100).toFixed(2)} total</p>
            </div>
          </div>

          {selected.status === 'active' && (
            <div className="mt-3 space-y-2">
              {statusError && <p className="text-xs text-[var(--error)]">{statusError}</p>}
              {confirmCancel ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--muted)]">Cancel this engagement?</span>
                  <button type="button" onClick={() => updateStatus(selected.id, 'cancelled')} disabled={statusBusy}
                    className="rounded-lg bg-[var(--error)] px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                    {statusBusy ? 'Cancelling...' : 'Yes, cancel'}
                  </button>
                  <button type="button" onClick={() => setConfirmCancel(false)}
                    className="text-xs text-[var(--muted)] hover:text-[var(--ink)]">No</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  {selected.role === 'developer' && (
                    <button type="button" onClick={() => updateStatus(selected.id, 'delivered')} disabled={statusBusy}
                      className="rounded-lg bg-[var(--success)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                      {statusBusy ? 'Saving...' : 'Mark Delivered'}
                    </button>
                  )}
                  <button type="button" onClick={() => setConfirmCancel(true)}
                    className="rounded-lg border border-[var(--error)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--error)] hover:bg-[var(--error)]/10">Cancel</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Workspace link — both client and dev can see the build progress */}
        {selected.projectSlug && (
          <a href={`/app/#/apps/${selected.projectSlug}/build`}
            className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 hover:border-[var(--accent)] transition-colors"
            title={selected.role === 'client' ? 'Watch the developer build your app' : 'Open the workspace'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent)]"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">
                {selected.role === 'client' ? 'Watch progress' : 'Open workspace'}
              </p>
              <p className="text-xs text-[var(--muted)]">{selected.projectSlug}.proappstore.online</p>
            </div>
          </a>
        )}

        {/* Rating — shown to clients after delivery */}
        {selected.status === 'delivered' && selected.role === 'client' && !ratingDone && (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
            <h3 className="text-sm font-bold text-[var(--ink)] mb-3">Rate this developer</h3>
            <div className="flex items-center gap-1 mb-3">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} type="button" onClick={() => setRatingScore(s)}
                  className={`text-2xl transition-colors ${s <= ratingScore ? 'text-amber-400' : 'text-[var(--line-strong)] hover:text-amber-300'}`}>
                  {s <= ratingScore ? '\u2605' : '\u2606'}
                </button>
              ))}
              {ratingScore > 0 && <span className="text-sm text-[var(--muted)] ml-2">{ratingScore}/5</span>}
            </div>
            <textarea rows={2} value={ratingComment} onChange={(e) => setRatingComment(e.target.value)}
              placeholder="Optional comment — what was the experience like?"
              aria-label="Rating comment"
              className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm mb-3" />
            {ratingError && <p className="text-xs text-[var(--error)] mb-2">{ratingError}</p>}
            <button type="button" onClick={submitRating} disabled={ratingBusy || ratingScore < 1}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {ratingBusy ? 'Submitting...' : 'Submit Rating'}
            </button>
          </div>
        )}
        {ratingDone && (
          <div className="rounded-lg bg-[var(--success)]/10 text-[var(--success)] px-4 py-2 text-sm font-medium">
            Rating submitted — thank you!
          </div>
        )}

        {/* Chat */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--line)]">
            <h3 className="text-sm font-bold text-[var(--ink)]">Service Chat</h3>
          </div>
          <div className="max-h-[400px] overflow-y-auto p-4 space-y-3">
            {loadingMsgs && <p className="text-xs text-[var(--muted)] text-center">Loading...</p>}
            {!loadingMsgs && messages.length === 0 && (
              <p className="text-xs text-[var(--muted)] text-center py-4">No messages yet. Start the conversation.</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.senderRole === (selected.role === 'client' ? 'client' : 'developer') ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 ${
                  m.senderRole === 'system' ? 'bg-[var(--panel-hover)] text-[var(--muted)] text-xs italic'
                  : m.senderRole === (selected.role === 'client' ? 'client' : 'developer') ? 'bg-[var(--accent)] text-white'
                  : 'border border-[var(--line)] bg-[var(--panel)]'
                }`}>
                  <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] opacity-60">
                    <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {m.charged && <span className="font-semibold">${(m.chargeCents / 100).toFixed(2)}</span>}
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          {selected.status === 'active' && (
            <div className="p-3 border-t border-[var(--line)]">
              {sendError && <p className="text-xs text-[var(--error)] mb-2">{sendError}</p>}
              <div className="flex gap-2">
                <input value={msgInput} onChange={(e) => { setMsgInput(e.target.value); setSendError(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg() } }}
                  placeholder={selected.role === 'developer' ? `Send (charges client $${(selected.promptRateCents / 100).toFixed(2)})` : 'Send a message (free)'}
                  disabled={sending}
                  aria-label="Service chat message"
                  className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm disabled:opacity-50" />
                <button type="button" onClick={sendMsg} disabled={sending || !msgInput.trim()}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                  {sending ? '...' : 'Send'}
                </button>
              </div>
              {selected.role === 'developer' && (
                <p className="text-[10px] text-[var(--muted)] mt-1">Each message you send charges the client ${(selected.promptRateCents / 100).toFixed(2)}. You earn 90%.</p>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-3">
      {engs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--line-strong)] p-12 text-center">
          <p className="text-[var(--muted)]">No engagements yet. Hire a developer from the directory or post a build request.</p>
        </div>
      ) : engs.map((e) => (
        <button key={e.id} type="button" onClick={() => openChat(e)}
          className="w-full text-left rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 hover:border-[var(--accent)] transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold text-[var(--ink)]">
                {e.role === 'client' ? e.devLogin ?? 'Developer' : e.clientLogin ?? 'Client'}
              </span>
              <span className="text-xs text-[var(--muted)] ml-2">({e.role})</span>
            </div>
            <StatusBadge status={e.status} />
          </div>
          <div className="text-xs text-[var(--muted)] mt-1">
            {e.promptsCount} prompts · ${(e.totalChargedCents / 100).toFixed(2)} · ${(e.promptRateCents / 100).toFixed(2)}/prompt
          </div>
        </button>
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    : status === 'delivered' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{status}</span>
}
