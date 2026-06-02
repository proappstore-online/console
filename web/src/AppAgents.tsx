import { useState, useEffect, useCallback, useRef } from 'react'

const AGENT_API = 'https://agents.proappstore.online/v1'

// ── Types ────────────────────────────────────────────────────

type TicketStatus =
  | 'inbox' | 'ba-refining' | 'awaiting-approval' | 'ready'
  | 'dev-active' | 'qa-active' | 'qa-failed' | 'needs-input' | 'done' | 'failed' | 'cancelled'

interface Ticket {
  id: string
  title: string
  rawIdea: string
  status: TicketStatus
  assigneeRole: string | null
  iterations: number
  costSpentUsd: number
}

interface Project {
  id: string
  name: string
  slug: string
  costCapMonthlyUsd: number
  costSpentMonthlyUsd: number
  status: 'running' | 'paused'
}

interface ChatMessage {
  id: string
  role: 'user' | 'po' | 'BA' | 'Dev' | 'QA' | 'system'
  text: string
  timestamp: number
  toolCall?: { name: string; args?: string }
}

interface ActivityEntry {
  id: string
  type: string
  detail: string
  timestamp: number
}

// ── API ──────────────────────────────────────────────────────

async function api(path: string, token: string, opts?: { method?: string; body?: unknown }) {
  const res = await fetch(`${AGENT_API}${path}`, {
    method: opts?.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json()
}

// ── Kanban columns ──────────────────────────────────────────

const COLUMNS: { keys: TicketStatus[]; label: string; color: string }[] = [
  { keys: ['inbox'], label: 'Inbox', color: '#94a3b8' },
  { keys: ['ba-refining', 'awaiting-approval'], label: 'BA', color: '#f59e0b' },
  { keys: ['ready', 'dev-active'], label: 'Dev', color: '#3b82f6' },
  { keys: ['qa-active', 'qa-failed'], label: 'QA', color: '#8b5cf6' },
  { keys: ['needs-input'], label: 'Blocked', color: '#ef4444' },
  { keys: ['done'], label: 'Done', color: '#22c55e' },
]

const ROLE_COLOR: Record<string, string> = {
  po: '#6366f1', BA: '#f59e0b', Dev: '#3b82f6', QA: '#8b5cf6', system: '#94a3b8', user: 'var(--ink)',
}

function CopyBtn({ getData, label }: { getData: () => string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(getData())
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="text-[10px] text-[var(--muted)] hover:text-[var(--ink)] px-1.5 py-0.5 rounded border border-[var(--line)] hover:border-[var(--accent)] transition-colors"
      title={`Copy ${label} as JSON`}
    >
      {copied ? 'Copied!' : label}
    </button>
  )
}

// ── Component ───────────────────────────────────────────────
// The agent team for ONE app. The agent-teams project slug IS the app id, so
// this is scoped by appId — no localStorage, no separate project picker.

export function AppAgents({ appId, appName, getToken }: { appId: string; appName?: string | null; getToken: () => string | null }) {
  const [project, setProject] = useState<Project | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notStarted, setNotStarted] = useState(false)
  const [idea, setIdea] = useState('')
  const [starting, setStarting] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const activityEndRef = useRef<HTMLDivElement>(null)
  const token = getToken()

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat])
  useEffect(() => { activityEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [activity])

  // Activity is persisted server-side (DB), loaded here — no client-only log.
  const loadActivity = useCallback(async () => {
    if (!token) return
    try {
      const a = await api(`/projects/${appId}/activity`, token) as { activity: { id: string; type: string; detail: string; createdAt: number }[] }
      setActivity(a.activity.map(e => ({ id: e.id, type: e.type, detail: e.detail, timestamp: e.createdAt })))
    } catch { /* no activity yet */ }
  }, [token, appId])

  // Load this app's project (slug = appId)
  const loadProject = useCallback(async (silent = false) => {
    if (!token) return
    if (!silent) setLoading(true)
    try {
      const data = await api(`/projects/${appId}`, token) as Project
      setProject(data)
      setNotStarted(false)
      const t = await api(`/projects/${appId}/tickets`, token) as { tickets: Ticket[] }
      setTickets(t.tickets)
      try {
        const h = await api(`/projects/${appId}/chat/history`, token) as { messages: { id: string; role: string; body: string; toolCall?: { name: string; args: string }; createdAt: number }[] }
        setChat(h.messages.map(m => ({ id: m.id, role: m.role as ChatMessage['role'], text: m.body, timestamp: m.createdAt, toolCall: m.toolCall })))
      } catch { /* no history yet */ }
      await loadActivity()
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('404')) setNotStarted(true)
      else setError(msg)
    }
    if (!silent) setLoading(false)
  }, [token, appId, loadActivity])

  // Reload just the tickets (used by live WS events — no loading spinner).
  const refreshTickets = useCallback(async () => {
    if (!token) return
    try {
      const t = await api(`/projects/${appId}/tickets`, token) as { tickets: Ticket[] }
      setTickets(t.tickets)
    } catch { /* ignore */ }
  }, [token, appId])

  useEffect(() => { loadProject() }, [loadProject])

  // ── Live updates over WebSocket ───────────────────────────
  // The DO broadcasts every event (play-state, activity, chat, transitions).
  // Connect once a project exists; reconnect with backoff; clean up on unmount.
  useEffect(() => {
    if (!token || notStarted) return
    let closed = false
    let ws: WebSocket | null = null
    let retry = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined

    const connect = () => {
      if (closed) return
      ws = new WebSocket(`wss://agents.proappstore.online/v1/projects/${appId}/ws?token=${encodeURIComponent(token)}`)
      ws.onopen = () => { retry = 0 }
      ws.onmessage = (ev) => {
        let d: Record<string, unknown>
        try { d = JSON.parse(typeof ev.data === 'string' ? ev.data : '') } catch { return }
        switch (d.type) {
          case 'play-state':
            setProject(prev => prev ? { ...prev, status: d.status as 'running' | 'paused' } : prev)
            break
          case 'activity': {
            const e = d.entry as { id: string; type: string; detail: string; createdAt: number } | undefined
            if (e) setActivity(prev => prev.some(a => a.id === e.id) ? prev : [...prev.slice(-300), { id: e.id, type: e.type, detail: e.detail, timestamp: e.createdAt }])
            break
          }
          case 'chat': {
            if (d.role === 'user') break // sender already shows it optimistically
            const id = String(d.id ?? crypto.randomUUID())
            setChat(prev => prev.some(m => m.id === id) ? prev : [...prev, { id, role: d.role as ChatMessage['role'], text: String(d.body ?? ''), timestamp: Date.now(), toolCall: d.toolCall as ChatMessage['toolCall'] }])
            break
          }
          case 'transition':
          case 'ticket-created':
          case 'ticket-updated':
          case 'ticket-failed':
            refreshTickets()
            break
          case 'cost-cap-reached':
            setProject(prev => prev ? { ...prev, status: 'paused' } : prev)
            refreshTickets()
            break
        }
      }
      ws.onerror = () => { try { ws?.close() } catch { /* noop */ } }
      ws.onclose = () => {
        if (closed) return
        retry += 1
        reconnectTimer = setTimeout(connect, Math.min(1000 * retry, 10000))
      }
    }
    connect()

    return () => {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      try { ws?.close() } catch { /* noop */ }
    }
  }, [token, appId, notStarted, refreshTickets])

  // Start the agent team for this app (creates the project, slug = appId)
  const startTeam = async () => {
    if (!token) return
    setStarting(true)
    setError(null)
    try {
      await api('/projects', token, { method: 'POST', body: { name: appName || appId, slug: appId, idea: idea.trim() || undefined } })
      setChat([{ id: '0', role: 'system', text: `Agent team ready for "${appName || appId}". Press Play to start, or chat to add work — the PO agent turns your messages into tickets.`, timestamp: Date.now() }])
      await loadProject()
    } catch (err) { setError((err as Error).message) }
    setStarting(false)
  }

  const togglePlay = async () => {
    if (!token || !project) return
    const action = project.status === 'running' ? 'pause' : 'play'
    try {
      await api(`/projects/${appId}/${action}`, token, { method: 'POST' })
      setProject(prev => prev ? { ...prev, status: action === 'play' ? 'running' : 'paused' } : prev)
      loadProject(true) // silent — don't blank the board with a spinner
    } catch (err) { setError((err as Error).message) }
  }

  const sendMessage = async () => {
    if (!token || !input.trim()) return
    const text = input.trim()
    setInput('')
    setSending(true)
    setChat(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text, timestamp: Date.now() }])
    try {
      const result = await api(`/projects/${appId}/chat`, token, { method: 'POST', body: { message: text } }) as { id: string; role: string; body: string; toolCall?: { name: string; args: string }; createdAt: number }
      setChat(prev => [...prev, { id: result.id, role: result.role as ChatMessage['role'], text: result.body, timestamp: result.createdAt, toolCall: result.toolCall }])
      loadProject(true) // silent — keep the board/chat in place
    } catch (err) {
      setChat(prev => [...prev, { id: crypto.randomUUID(), role: 'system', text: `Error: ${(err as Error).message}`, timestamp: Date.now() }])
    }
    setSending(false)
  }

  // ── Not started: offer to start the team for this app ─────────

  if (loading) return <p className="py-12 text-center text-[var(--muted)]">Loading agents...</p>

  if (notStarted) {
    return (
      <div className="max-w-lg mx-auto py-10">
        <h3 className="display-font text-xl font-bold text-[var(--ink)] mb-2">Start the agent team</h3>
        <p className="text-sm text-[var(--muted)] mb-5">
          Describe what <strong>{appName || appId}</strong> should be. A BA / Dev / QA team will refine it,
          build it, and review it — you just press Play and chat.
        </p>
        <textarea
          value={idea}
          onChange={e => setIdea(e.target.value)}
          rows={4}
          placeholder="e.g. A chess training app with daily puzzles, ELO tracking, and spaced-repetition review."
          className="block w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-sm text-[var(--ink)]"
        />
        <button
          type="button"
          onClick={startTeam}
          disabled={starting}
          className="mt-4 w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {starting ? 'Starting...' : 'Start agent team'}
        </button>
        {error && <p className="mt-4 text-sm text-[var(--error)]">{error}</p>}
      </div>
    )
  }

  // ── Workspace: Chat | Kanban + Activity ─────────────────────

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-[calc(100dvh-220px)]">
      {/* LEFT: Chat */}
      <div className="flex flex-col lg:w-[400px] flex-shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--ink)]">Talk to your agents</h3>
            <p className="text-xs text-[var(--muted)]">The PO turns messages into tickets</p>
          </div>
          <div className="flex items-center gap-1">
            <CopyBtn label="ID" getData={() => JSON.stringify({ projectId: project?.id, slug: appId, name: project?.name })} />
            <CopyBtn label="Chat" getData={() => JSON.stringify(chat.map(m => ({ role: m.role, text: m.text, time: new Date(m.timestamp).toISOString(), ...(m.toolCall ? { tool: m.toolCall } : {}) })), null, 2)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ maxHeight: 'calc(100dvh - 360px)' }}>
          {chat.length === 0 && (
            <p className="text-xs text-[var(--muted)] text-center py-8">
              Start typing. Describe what you want built, ask questions, give feedback.
            </p>
          )}
          {chat.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
                msg.role === 'user' ? 'bg-[var(--accent)] text-white'
                  : msg.role === 'system' ? 'bg-[var(--panel-hover)] text-[var(--muted)]'
                    : 'border border-[var(--line)] bg-[var(--panel)]'
              }`}>
                {msg.role !== 'user' && msg.role !== 'system' && (
                  <span className="text-xs font-bold block mb-0.5" style={{ color: ROLE_COLOR[msg.role] }}>{msg.role}</span>
                )}
                <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                {msg.toolCall && (
                  <div className="mt-1 px-2 py-1 rounded bg-black/5 dark:bg-white/5 text-xs font-mono text-[var(--muted)]">
                    {msg.toolCall.name}({msg.toolCall.args ?? ''})
                  </div>
                )}
                <span className="text-[10px] opacity-50 block mt-1">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="p-3 border-t border-[var(--line)]">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder="Describe what you want..."
              disabled={sending}
              className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm text-[var(--ink)] disabled:opacity-50"
            />
            <button type="button" onClick={sendMessage} disabled={sending || !input.trim()}
              className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {sending ? '...' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT: Kanban + Activity */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold text-[var(--ink)]">Board</h3>
              {project && (
                <button type="button" onClick={togglePlay}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    project.status === 'running'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200'
                  }`}>
                  {project.status === 'running' ? (<><span>&#9646;&#9646;</span> Pause</>) : (<><span>&#9654;</span> Play</>)}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <CopyBtn label="Board" getData={() => JSON.stringify({ slug: appId, status: project?.status, cost: { spent: project?.costSpentMonthlyUsd, cap: project?.costCapMonthlyUsd }, tickets: tickets.map(t => ({ id: t.id, title: t.title, status: t.status, assignee: t.assigneeRole, iterations: t.iterations, cost: t.costSpentUsd })) }, null, 2)} />
              {project && (
                <span className="text-xs text-[var(--muted)]">
                  ${(project.costSpentMonthlyUsd ?? 0).toFixed(2)} / ${(project.costCapMonthlyUsd ?? 50).toFixed(2)}
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {COLUMNS.map(col => {
              const colTickets = tickets.filter(t => (col.keys as string[]).includes(t.status))
              return (
                <div key={col.label}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                    <span className="text-[11px] font-semibold text-[var(--ink)]">{col.label}</span>
                    {colTickets.length > 0 && <span className="text-[11px] text-[var(--muted)]">{colTickets.length}</span>}
                  </div>
                  <div className="space-y-1.5 min-h-[60px]">
                    {colTickets.map(ticket => (
                      <div key={ticket.id} className="rounded-lg border border-[var(--line)] p-2 text-xs hover:border-[var(--accent)] transition-colors cursor-default" title={ticket.rawIdea}>
                        <p className="font-medium text-[var(--ink)] line-clamp-2 leading-tight">{ticket.title}</p>
                        <div className="flex items-center gap-1 mt-1">
                          {ticket.assigneeRole && (
                            <span className="font-bold" style={{ color: ROLE_COLOR[ticket.assigneeRole] ?? 'var(--muted)', fontSize: '10px' }}>{ticket.assigneeRole}</span>
                          )}
                          {ticket.iterations > 0 && <span className="text-[var(--muted)]" style={{ fontSize: '10px' }}>i:{ticket.iterations}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex-1 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 flex flex-col min-h-[200px]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-[var(--ink)]">Activity</h3>
            <div className="flex items-center gap-1">
              <button type="button" onClick={loadActivity}
                className="text-[10px] text-[var(--muted)] hover:text-[var(--ink)] px-1.5 py-0.5 rounded border border-[var(--line)] hover:border-[var(--accent)]"
                title="Reload the persisted activity trail">
                Refresh
              </button>
              <CopyBtn label="Log" getData={() => JSON.stringify(activity.map(a => ({ type: a.type, detail: a.detail, time: new Date(a.timestamp).toISOString() })), null, 2)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 text-xs font-mono min-h-0" style={{ maxHeight: 'calc(100dvh - 560px)' }}>
            {activity.length === 0 && (
              <p className="text-[var(--muted)] py-4 text-center font-sans text-xs">Agent activity, tool calls, and ticket transitions appear here.</p>
            )}
            {activity.map(entry => (
              <div key={entry.id} className="flex gap-2 text-[var(--muted)] leading-snug">
                <span className="flex-shrink-0 opacity-50 tabular-nums">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <span className="flex-shrink-0 font-bold" style={{
                  color: entry.type === 'ticket' ? '#f59e0b' : entry.type === 'tool' ? '#3b82f6' : entry.type === 'transition' ? '#8b5cf6' : entry.type === 'error' ? 'var(--error)' : 'var(--muted)',
                }}>{entry.type}</span>
                <span className="text-[var(--ink)] break-words min-w-0">{entry.detail}</span>
              </div>
            ))}
            <div ref={activityEndRef} />
          </div>
        </div>
      </div>

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 font-bold">x</button>
        </div>
      )}
    </div>
  )
}
