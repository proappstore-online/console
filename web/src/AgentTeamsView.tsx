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

// ── Copy helper ─────────────────────────────────────────────

function CopyBtn({ getData, label }: { getData: () => string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
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

export function AgentTeamsView({ getToken }: { getToken: () => string | null }) {
  const [project, setProject] = useState<Project | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [setupMode, setSetupMode] = useState(false)
  const [slug, setSlug] = useState('')
  const [projectName, setProjectName] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const activityEndRef = useRef<HTMLDivElement>(null)
  const token = getToken()

  // Scroll chat to bottom
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat])
  useEffect(() => { activityEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [activity])

  // Log activity
  const logActivity = useCallback((type: string, detail: string) => {
    setActivity(prev => [...prev.slice(-200), {
      id: crypto.randomUUID(),
      type,
      detail,
      timestamp: Date.now(),
    }])
  }, [])

  // Load project
  const loadProject = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const stored = localStorage.getItem('pas-agent-project-slug')
      if (!stored) { setSetupMode(true); setLoading(false); return }
      const data = await api(`/projects/${stored}`, token) as Project
      setProject(data)
      setSlug(stored)
      const t = await api(`/projects/${stored}/tickets`, token) as { tickets: Ticket[] }
      setTickets(t.tickets)

      // Load chat history
      try {
        const h = await api(`/projects/${stored}/chat/history`, token) as { messages: { id: string; role: string; body: string; toolCall?: { name: string; args: string }; createdAt: number }[] }
        setChat(h.messages.map(m => ({
          id: m.id,
          role: m.role as ChatMessage['role'],
          text: m.body,
          timestamp: m.createdAt,
          toolCall: m.toolCall,
        })))
      } catch { /* first load, no history yet */ }
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('404')) { localStorage.removeItem('pas-agent-project-slug'); setSetupMode(true) }
      else setError(msg)
    }
    setLoading(false)
  }, [token])

  useEffect(() => { loadProject() }, [loadProject])

  // Create project
  const createProject = async () => {
    if (!token || !projectName || !slug) return
    setError(null)
    try {
      await api('/projects', token, { method: 'POST', body: { name: projectName, slug } })
      localStorage.setItem('pas-agent-project-slug', slug)
      setSetupMode(false)
      setChat([{ id: '0', role: 'system', text: `Project "${projectName}" created. You can start talking -- the PO agent reads your messages and creates tickets automatically.`, timestamp: Date.now() }])
      logActivity('project', `Created project: ${projectName} (${slug})`)
      loadProject()
    } catch (err) { setError((err as Error).message) }
  }

  // Send chat message — calls the PO agent
  const sendMessage = async () => {
    if (!token || !slug || !input.trim()) return
    const text = input.trim()
    setInput('')
    setSending(true)

    // Show user message immediately (optimistic)
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text, timestamp: Date.now() }
    setChat(prev => [...prev, userMsg])
    logActivity('chat', `You: ${text.slice(0, 80)}${text.length > 80 ? '...' : ''}`)

    try {
      // Call PO agent — it decides whether to create a ticket, answer, or route
      const result = await api(`/projects/${slug}/chat`, token, {
        method: 'POST',
        body: { message: text },
      }) as { id: string; role: string; body: string; toolCall?: { name: string; args: string }; createdAt: number }

      const poReply: ChatMessage = {
        id: result.id,
        role: result.role as ChatMessage['role'],
        text: result.body,
        timestamp: result.createdAt,
        toolCall: result.toolCall,
      }
      setChat(prev => [...prev, poReply])

      if (result.toolCall) {
        logActivity('tool', `${result.role}: ${result.toolCall.name}(${result.toolCall.args ?? ''})`)
      }
      logActivity('chat', `PO: ${result.body.slice(0, 80)}`)

      // Reload tickets in case PO created one
      loadProject()
    } catch (err) {
      const errMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'system',
        text: `Error: ${(err as Error).message}`,
        timestamp: Date.now(),
      }
      setChat(prev => [...prev, errMsg])
      logActivity('error', (err as Error).message)
    }
    setSending(false)
  }

  // ── Setup ─────────────────────────────────────────────────

  if (setupMode) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <h2 className="display-font text-2xl font-bold text-[var(--ink)] mb-2">Create Agent Project</h2>
        <p className="text-sm text-[var(--muted)] mb-6">
          Set up a project with AI agents. You chat, they build.
        </p>
        <div className="space-y-4">
          <input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Chess Academy"
            className="block w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-sm text-[var(--ink)]" />
          <div>
            <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="chess-academy"
              className="block w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-sm text-[var(--ink)]" />
            {slug && <p className="mt-1 text-xs text-[var(--muted)]">{slug}.proappstore.online</p>}
          </div>
          <button onClick={createProject} disabled={!projectName || slug.length < 2}
            className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            Create Project
          </button>
        </div>
        {error && <p className="mt-4 text-sm text-[var(--error)]">{error}</p>}
      </div>
    )
  }

  if (loading) return <p className="py-12 text-center text-[var(--muted)]">Loading...</p>

  // ── Main layout: Chat | Kanban + Activity ─────────────────

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-[calc(100dvh-120px)]">

      {/* LEFT: Chat */}
      <div className="flex flex-col lg:w-[400px] flex-shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        {/* Chat header */}
        <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--ink)]">{project?.name ?? 'Chat'}</h3>
            <p className="text-xs text-[var(--muted)]">Talk to your agents</p>
          </div>
          <div className="flex items-center gap-1">
            <CopyBtn label="ID" getData={() => JSON.stringify({ projectId: project?.id, slug, name: project?.name })} />
            <CopyBtn label="Chat" getData={() => JSON.stringify(chat.map(m => ({ role: m.role, text: m.text, time: new Date(m.timestamp).toISOString(), ...(m.toolCall ? { tool: m.toolCall } : {}) })), null, 2)} />
            <button onClick={() => { localStorage.removeItem('pas-agent-project-slug'); setSetupMode(true) }}
              className="text-[10px] text-[var(--muted)] hover:text-[var(--ink)] px-1.5 py-0.5 rounded border border-[var(--line)] hover:border-[var(--accent)]">Switch</button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ maxHeight: 'calc(100dvh - 280px)' }}>
          {chat.length === 0 && (
            <p className="text-xs text-[var(--muted)] text-center py-8">
              Start typing. Describe what you want built, ask questions, give feedback.
              The PO agent reads everything and creates tickets automatically.
            </p>
          )}
          {chat.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
                msg.role === 'user'
                  ? 'bg-[var(--accent)] text-white'
                  : msg.role === 'system'
                    ? 'bg-[var(--panel-hover)] text-[var(--muted)]'
                    : 'border border-[var(--line)] bg-[var(--panel)]'
              }`}>
                {msg.role !== 'user' && msg.role !== 'system' && (
                  <span className="text-xs font-bold block mb-0.5" style={{ color: ROLE_COLOR[msg.role] }}>
                    {msg.role}
                  </span>
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

        {/* Input */}
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
            <button onClick={sendMessage} disabled={sending || !input.trim()}
              className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {sending ? '...' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT: Kanban + Activity */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">

        {/* Kanban board */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold text-[var(--ink)]">Board</h3>
              {project && (
                <button
                  onClick={async () => {
                    if (!token || !slug) return
                    const action = project.status === 'running' ? 'pause' : 'play'
                    try {
                      await api(`/projects/${slug}/${action}`, token, { method: 'POST' })
                      logActivity('control', action === 'play' ? 'Agents STARTED' : 'Agents PAUSED')
                      setProject(prev => prev ? { ...prev, status: action === 'play' ? 'running' : 'paused' } : prev)
                      if (action === 'play') loadProject()
                    } catch (err) {
                      const msg = (err as Error).message
                      if (msg.includes('404')) {
                        setProject(null)
                        setSetupMode(true)
                        localStorage.removeItem('pas-agent-project-slug')
                      }
                      setError(msg)
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    project.status === 'running'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200'
                  }`}
                >
                  {project.status === 'running' ? (
                    <><span>&#9646;&#9646;</span> Pause</>
                  ) : (
                    <><span>&#9654;</span> Play</>
                  )}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <CopyBtn label="Board" getData={() => JSON.stringify({ slug, status: project?.status, cost: { spent: project?.costSpentMonthlyUsd, cap: project?.costCapMonthlyUsd }, tickets: tickets.map(t => ({ id: t.id, title: t.title, status: t.status, assignee: t.assigneeRole, iterations: t.iterations, cost: t.costSpentUsd })) }, null, 2)} />
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
                      <div key={ticket.id}
                        className="rounded-lg border border-[var(--line)] p-2 text-xs hover:border-[var(--accent)] transition-colors cursor-default"
                        title={ticket.rawIdea}>
                        <p className="font-medium text-[var(--ink)] line-clamp-2 leading-tight">{ticket.title}</p>
                        <div className="flex items-center gap-1 mt-1">
                          {ticket.assigneeRole && (
                            <span className="font-bold" style={{ color: ROLE_COLOR[ticket.assigneeRole] ?? 'var(--muted)', fontSize: '10px' }}>
                              {ticket.assigneeRole}
                            </span>
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

        {/* Activity log */}
        <div className="flex-1 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 flex flex-col min-h-[200px]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-[var(--ink)]">Activity</h3>
            <CopyBtn label="Log" getData={() => JSON.stringify(activity.map(a => ({ type: a.type, detail: a.detail, time: new Date(a.timestamp).toISOString() })), null, 2)} />
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 text-xs font-mono min-h-0" style={{ maxHeight: 'calc(100dvh - 500px)' }}>
            {activity.length === 0 && (
              <p className="text-[var(--muted)] py-4 text-center font-sans text-xs">
                Agent activity, tool calls, and ticket transitions appear here.
              </p>
            )}
            {activity.map(entry => (
              <div key={entry.id} className="flex gap-2 text-[var(--muted)] leading-snug">
                <span className="flex-shrink-0 opacity-50 tabular-nums">
                  {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="flex-shrink-0 font-bold" style={{
                  color: entry.type === 'ticket' ? '#f59e0b'
                    : entry.type === 'tool' ? '#3b82f6'
                    : entry.type === 'transition' ? '#8b5cf6'
                    : entry.type === 'error' ? 'var(--error)'
                    : 'var(--muted)',
                }}>
                  {entry.type}
                </span>
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
          <button onClick={() => setError(null)} className="ml-2 font-bold">x</button>
        </div>
      )}
    </div>
  )
}
