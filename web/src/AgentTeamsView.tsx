import { useState, useEffect, useCallback, useRef } from 'react'

const AGENT_API = 'https://agents.proappstore.online/v1'

// ── Types ────────────────────────────────────────────────────

type TicketStatus =
  | 'inbox' | 'ba-refining' | 'awaiting-approval' | 'ready'
  | 'dev-active' | 'qa-active' | 'qa-failed' | 'done' | 'failed' | 'cancelled'

interface Ticket {
  id: string
  title: string
  rawIdea: string
  status: TicketStatus
  assigneeRole: string | null
  iterations: number
  costSpentUsd: number
  createdAt: number
  updatedAt: number
  stuckReason: string | null
}

interface Project {
  id: string
  name: string
  slug: string
  costCapMonthlyUsd: number
  costSpentMonthlyUsd: number
}

interface Message {
  id: string
  ticketId: string
  author: string
  body: string
  createdAt: number
  costUsd: number
}

interface CostSummary {
  cap: number
  spent: number
  byRole: { role: string; total: number }[]
}

// ── API helpers ──────────────────────────────────────────────

async function api(path: string, token: string, opts?: { method?: string; body?: unknown }) {
  const res = await fetch(`${AGENT_API}${path}`, {
    method: opts?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  return res.json()
}

// ── Kanban columns ──────────────────────────────────────────

const COLUMNS: { key: TicketStatus[]; label: string; color: string }[] = [
  { key: ['inbox'], label: 'Inbox', color: 'var(--muted)' },
  { key: ['ba-refining', 'awaiting-approval'], label: 'BA / Approval', color: '#f59e0b' },
  { key: ['ready', 'dev-active'], label: 'Development', color: '#3b82f6' },
  { key: ['qa-active', 'qa-failed'], label: 'QA', color: '#8b5cf6' },
  { key: ['done'], label: 'Done', color: '#22c55e' },
  { key: ['failed', 'cancelled'], label: 'Closed', color: 'var(--error, #ef4444)' },
]

const STATUS_LABELS: Record<string, string> = {
  'inbox': 'Inbox',
  'ba-refining': 'BA Refining',
  'awaiting-approval': 'Awaiting Approval',
  'ready': 'Ready',
  'dev-active': 'Dev Active',
  'qa-active': 'QA Active',
  'qa-failed': 'QA Failed',
  'done': 'Done',
  'failed': 'Failed',
  'cancelled': 'Cancelled',
}

// ── Main component ──────────────────────────────────────────

export function AgentTeamsView({ getToken }: { getToken: () => string | null }) {
  const [project, setProject] = useState<Project | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [cost, setCost] = useState<CostSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newIdea, setNewIdea] = useState('')
  const [view, setView] = useState<'board' | 'detail'>('board')
  const [slug, setSlug] = useState('')
  const [projectName, setProjectName] = useState('')
  const [setupMode, setSetupMode] = useState(false)
  const selectedTicketIdRef = useRef<string | null>(null)

  const token = getToken()

  // Keep ref in sync for WebSocket closure
  useEffect(() => { selectedTicketIdRef.current = selectedTicketId }, [selectedTicketId])

  // Load project
  const loadProject = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const stored = localStorage.getItem('pas-agent-project-slug')
      if (!stored) {
        setSetupMode(true)
        setLoading(false)
        return
      }
      const data = await api(`/projects/${stored}`, token)
      setProject(data as Project)
      setSlug(stored)

      const ticketData = await api(`/projects/${stored}/tickets`, token) as { tickets: Ticket[] }
      setTickets(ticketData.tickets)

      const costData = await api(`/projects/${stored}/cost`, token) as CostSummary
      setCost(costData)
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('404') || msg.includes('not_found')) {
        localStorage.removeItem('pas-agent-project-slug')
        setSetupMode(true)
      } else {
        setError(msg)
      }
    }
    setLoading(false)
  }, [token])

  useEffect(() => { loadProject() }, [loadProject])

  // Load messages for a ticket
  const loadMessages = useCallback(async (ticketId: string) => {
    if (!token || !slug) return
    try {
      const data = await api(`/projects/${slug}/tickets/${ticketId}/messages`, token) as { messages: Message[] }
      setMessages(data.messages)
    } catch { /* non-fatal */ }
  }, [token, slug])

  // Create project
  const createProject = async () => {
    if (!token || !projectName || !slug) return
    setError(null)
    try {
      await api('/projects', token, { method: 'POST', body: { name: projectName, slug } })
      localStorage.setItem('pas-agent-project-slug', slug)
      setSetupMode(false)
      loadProject()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Create ticket
  const createTicket = async () => {
    if (!token || !slug || !newTitle || !newIdea) return
    setCreating(true)
    setError(null)
    try {
      await api(`/projects/${slug}/tickets`, token, {
        method: 'POST',
        body: { title: newTitle, rawIdea: newIdea },
      })
      setNewTitle('')
      setNewIdea('')
      loadProject()
    } catch (err) {
      setError((err as Error).message)
    }
    setCreating(false)
  }

  // Transition ticket
  const transition = async (ticketId: string, to: TicketStatus, trigger: string) => {
    if (!token || !slug) return
    setError(null)
    try {
      await api(`/projects/${slug}/tickets/${ticketId}/transition`, token, {
        method: 'POST',
        body: { to, trigger },
      })
      loadProject()
      if (selectedTicketId === ticketId) loadMessages(ticketId)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Run agent on ticket
  const runAgent = async (ticketId: string) => {
    if (!token || !slug) return
    setError(null)
    try {
      const result = await api(`/projects/${slug}/tickets/${ticketId}/run`, token, { method: 'POST', body: {} })
      const data = result as { status?: string; note?: string }
      if (data.note) setError(data.note)
      loadProject()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Open ticket detail
  const openTicket = (ticket: Ticket) => {
    setSelectedTicketId(ticket.id)
    setView('detail')
    loadMessages(ticket.id)
  }

  // ── Setup mode ────────────────────────────────────────────

  if (setupMode) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <h2 className="display-font text-2xl font-bold text-[var(--ink)] mb-2">Create Agent Project</h2>
        <p className="text-sm text-[var(--muted)] mb-6">
          Set up a project with AI agents (BA, Dev, QA) that build your app.
        </p>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-[var(--ink)]">Project name</label>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Chess Academy"
              className="mt-1 block w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-sm text-[var(--ink)]"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--ink)]">Slug (becomes the app ID)</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="chess-academy"
              className="mt-1 block w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-sm text-[var(--ink)]"
            />
            {slug && <p className="mt-1 text-xs text-[var(--muted)]">{slug}.proappstore.online</p>}
          </div>
          <button
            onClick={createProject}
            disabled={!projectName || !slug || slug.length < 2}
            className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Create Project
          </button>
        </div>
        {error && <p className="mt-4 text-sm text-[var(--error)] rounded-lg bg-red-50 dark:bg-red-950/30 p-3">{error}</p>}
      </div>
    )
  }

  if (loading) return <p className="py-12 text-center text-[var(--muted)]">Loading...</p>

  // ── Board view ────────────────────────────────────────────

  if (view === 'board') {
    return (
      <div>
        {/* Header bar */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="display-font text-xl font-bold text-[var(--ink)]">
              {project?.name ?? 'Agent Teams'}
            </h2>
            {cost && (
              <p className="text-xs text-[var(--muted)] mt-1">
                Cost: ${cost.spent.toFixed(2)} / ${cost.cap.toFixed(2)} this month
                {cost.byRole.map((r) => ` | ${r.role}: $${(r.total as number).toFixed(2)}`)}
              </p>
            )}
          </div>
          <button
            onClick={() => { localStorage.removeItem('pas-agent-project-slug'); setSetupMode(true) }}
            className="text-xs text-[var(--muted)] hover:text-[var(--ink)]"
          >
            Switch project
          </button>
        </div>

        {/* New ticket form */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 mb-6">
          <h3 className="text-sm font-semibold text-[var(--ink)] mb-3">New ticket</h3>
          <div className="space-y-3">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Title (e.g. 'Add game rooms with chess clock')"
              className="block w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm text-[var(--ink)]"
              maxLength={200}
            />
            <textarea
              value={newIdea}
              onChange={(e) => setNewIdea(e.target.value)}
              placeholder="Describe what you want built..."
              rows={3}
              className="block w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm text-[var(--ink)] resize-none"
              maxLength={65536}
            />
            <button
              onClick={createTicket}
              disabled={creating || !newTitle || !newIdea}
              className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Ticket'}
            </button>
          </div>
        </div>

        {/* Kanban board */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {COLUMNS.map((col) => {
            const colTickets = tickets.filter((t) => (col.key as string[]).includes(t.status))
            return (
              <div key={col.label} className="min-h-[120px]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                  <span className="text-xs font-semibold text-[var(--ink)]">{col.label}</span>
                  <span className="text-xs text-[var(--muted)]">{colTickets.length}</span>
                </div>
                <div className="space-y-2">
                  {colTickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      onClick={() => openTicket(ticket)}
                      className="w-full text-left rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 hover:border-[var(--accent)] transition-colors"
                    >
                      <p className="text-sm font-medium text-[var(--ink)] line-clamp-2">{ticket.title}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--panel-hover)] text-[var(--muted)]">
                          {STATUS_LABELS[ticket.status] ?? ticket.status}
                        </span>
                        {ticket.assigneeRole && (
                          <span className="text-xs text-[var(--accent)] font-medium">{ticket.assigneeRole}</span>
                        )}
                        {ticket.iterations > 0 && (
                          <span className="text-xs text-[var(--muted)]">iter:{ticket.iterations}</span>
                        )}
                      </div>
                      {ticket.costSpentUsd > 0 && (
                        <p className="text-xs text-[var(--muted)] mt-1">${ticket.costSpentUsd.toFixed(2)}</p>
                      )}
                    </button>
                  ))}
                  {colTickets.length === 0 && (
                    <p className="text-xs text-[var(--muted)] py-4 text-center">Empty</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {error && <p className="mt-4 text-sm text-[var(--error)] rounded-lg bg-red-50 dark:bg-red-950/30 p-3">{error}</p>}
      </div>
    )
  }

  // ── Ticket detail view ────────────────────────────────────

  const ticket = tickets.find((t) => t.id === selectedTicketId)

  if (view === 'detail' && ticket) {
    return (
      <div>
        <button
          onClick={() => { setView('board'); setSelectedTicketId(null) }}
          className="text-sm text-[var(--muted)] hover:text-[var(--ink)] mb-4 py-2"
        >
          &larr; Back to board
        </button>

        {/* Ticket header */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 mb-4">
          <h2 className="text-lg font-bold text-[var(--ink)]">{ticket.title}</h2>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-xs px-2 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] font-medium">
              {STATUS_LABELS[ticket.status] ?? ticket.status}
            </span>
            {ticket.assigneeRole && (
              <span className="text-xs px-2 py-1 rounded-lg bg-[var(--panel-hover)] text-[var(--muted)]">
                {ticket.assigneeRole}
              </span>
            )}
            <span className="text-xs text-[var(--muted)]">
              iter: {ticket.iterations}/5 | cost: ${ticket.costSpentUsd.toFixed(2)}
            </span>
          </div>
          {ticket.stuckReason && (
            <p className="mt-2 text-xs text-[var(--error)] bg-red-50 dark:bg-red-950/30 rounded-lg p-2">{ticket.stuckReason}</p>
          )}

          {/* Raw idea */}
          <div className="mt-4 p-3 rounded-lg bg-[var(--panel-hover)]">
            <p className="text-xs font-medium text-[var(--muted)] mb-1">Raw idea</p>
            <p className="text-sm text-[var(--ink)] whitespace-pre-wrap">{ticket.rawIdea}</p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 mt-4">
            {ticket.status === 'inbox' && (
              <button
                onClick={() => transition(ticket.id, 'ba-refining', 'BA')}
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
              >
                Start BA Refinement
              </button>
            )}
            {ticket.status === 'awaiting-approval' && (
              <>
                <button
                  onClick={() => transition(ticket.id, 'ready', 'po')}
                  className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                >
                  Approve Spec
                </button>
                <button
                  onClick={() => transition(ticket.id, 'ba-refining', 'po')}
                  className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--panel-hover)]"
                >
                  Reject (Back to BA)
                </button>
              </>
            )}
            {(ticket.status === 'ready' || ticket.status === 'qa-failed') && (
              <button
                onClick={() => runAgent(ticket.id)}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
              >
                Run Dev Agent
              </button>
            )}
            {ticket.status === 'dev-active' && (
              <span className="text-xs text-blue-500 py-2 flex items-center gap-1">
                <span className="animate-pulse">●</span> Dev agent running...
              </span>
            )}
            {ticket.status === 'qa-active' && (
              <span className="text-xs text-purple-500 py-2 flex items-center gap-1">
                <span className="animate-pulse">●</span> QA agent running...
              </span>
            )}
            {ticket.status === 'ba-refining' && (
              <span className="text-xs text-amber-500 py-2 flex items-center gap-1">
                <span className="animate-pulse">●</span> BA refining spec...
              </span>
            )}
            {!['done', 'failed', 'cancelled'].includes(ticket.status) && (
              <button
                onClick={() => transition(ticket.id, 'cancelled', 'po')}
                className="rounded-lg border border-[var(--error)] px-3 py-2 text-xs font-semibold text-[var(--error)] hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Message log */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[var(--ink)]">Activity</h3>
            <button
              onClick={() => loadMessages(ticket.id)}
              className="text-xs text-[var(--muted)] hover:text-[var(--ink)]"
            >
              Refresh
            </button>
          </div>
          {messages.length === 0 ? (
            <p className="text-xs text-[var(--muted)] py-8 text-center">No agent activity yet. Start a refinement or run to see output here.</p>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-lg p-3 ${
                    msg.author === 'po' || msg.author === 'system'
                      ? 'bg-[var(--panel-hover)]'
                      : 'border border-[var(--line)]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold ${
                      msg.author === 'BA' ? 'text-amber-500'
                        : msg.author === 'Dev' ? 'text-blue-500'
                        : msg.author === 'QA' ? 'text-purple-500'
                        : 'text-[var(--muted)]'
                    }`}>
                      {msg.author}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </span>
                    {msg.costUsd > 0 && (
                      <span className="text-xs text-[var(--muted)]">${msg.costUsd.toFixed(3)}</span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--ink)] whitespace-pre-wrap break-words">{msg.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-[var(--error)] rounded-lg bg-red-50 dark:bg-red-950/30 p-3">{error}</p>}
      </div>
    )
  }

  if (view === 'detail' && !ticket) {
    return (
      <div>
        <button onClick={() => setView('board')} className="text-sm text-[var(--muted)] hover:text-[var(--ink)] py-2">
          &larr; Back to board
        </button>
        <p className="py-8 text-center text-[var(--muted)]">Ticket not found</p>
      </div>
    )
  }

  return null
}
