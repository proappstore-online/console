import { useState, useEffect, useCallback } from 'react'
import { API_BASE, authHeaders } from './api'
import type { Engagement, ServiceMessage } from './servicesTypes'

export function EngagementsTab({ token }: { token: string | null }) {
  const [engs, setEngs] = useState<Engagement[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Engagement | null>(null)
  const [messages, setMessages] = useState<ServiceMessage[]>([])
  const [msgInput, setMsgInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return }
    try {
      const res = await fetch(`${API_BASE}/services/engagements`, { headers: authHeaders(token) })
      if (res.ok) setEngs(((await res.json()) as { engagements: Engagement[] }).engagements)
    } catch { /* */ }
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  const openChat = async (eng: Engagement) => {
    if (!token) return
    setSelected(eng)
    setMessages([]) // clear stale messages from previous engagement
    setLoadingMsgs(true)
    try {
      const res = await fetch(`${API_BASE}/services/engagements/${eng.id}/messages`, { headers: authHeaders(token) })
      if (res.ok) setMessages(((await res.json()) as { messages: ServiceMessage[] }).messages)
    } catch { /* */ }
    setLoadingMsgs(false)
  }

  // Poll messages when chat is open
  useEffect(() => {
    if (!selected || !token) return
    const poll = setInterval(async () => {
      if (document.hidden) return
      try {
        const res = await fetch(`${API_BASE}/services/engagements/${selected.id}/messages`, { headers: authHeaders(token) })
        if (res.ok) {
          const data = (await res.json()) as { messages: ServiceMessage[] }
          setMessages((prev) => {
            const lastId = prev.at(-1)?.id
            const newLastId = data.messages.at(-1)?.id
            return lastId !== newLastId || data.messages.length !== prev.length ? data.messages : prev
          })
        }
      } catch { /* */ }
    }, 5000)
    return () => clearInterval(poll)
  }, [selected?.id, token])

  const sendMsg = async () => {
    if (!token || !selected || !msgInput.trim()) return
    setSending(true)
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
        load()
      } else {
        const err = await res.json().catch(() => ({ error: 'failed' })) as { error: string }
        alert(err.error)
      }
    } catch (e) { alert((e as Error).message) }
    setSending(false)
  }

  const updateStatus = async (engId: string, status: string) => {
    if (!token) return
    await fetch(`${API_BASE}/services/engagements/${engId}`, {
      method: 'PATCH',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
    if (selected?.id === engId) setSelected(null)
  }

  if (loading) return <p className="py-8 text-center text-sm text-[var(--muted)]">Loading engagements...</p>

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
            <div className="flex gap-2 mt-3">
              {selected.role === 'developer' && (
                <button type="button" onClick={() => updateStatus(selected.id, 'delivered')}
                  className="rounded-lg bg-[var(--success)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">Mark Delivered</button>
              )}
              <button type="button" onClick={() => { if (confirm('Cancel this engagement?')) updateStatus(selected.id, 'cancelled') }}
                className="rounded-lg border border-[var(--error)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--error)] hover:bg-[var(--error)]/10">Cancel</button>
            </div>
          )}
        </div>

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
          </div>
          {selected.status === 'active' && (
            <div className="p-3 border-t border-[var(--line)]">
              <div className="flex gap-2">
                <input value={msgInput} onChange={(e) => setMsgInput(e.target.value)}
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
