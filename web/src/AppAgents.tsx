import { useState, useEffect, useCallback, useRef } from 'react'
import { Markdown } from './Markdown'
import { CodeView } from './CodeView'
import { useStickToBottom } from './useStickToBottom'
import { AGENT_BASE as AGENT_API } from './api'

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
  updatedAt: number
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
  meta?: string // JSON: { args?, ok?, result? } — tool call output, for the audit view
}

// ── API ──────────────────────────────────────────────────────

async function api(path: string, token: string, opts?: { method?: string; body?: unknown }) {
  const res = await fetch(`${AGENT_API}${path}`, {
    method: opts?.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  })
  if (!res.ok) {
    const text = await res.text()
    let msg = text
    try { msg = (JSON.parse(text) as { error?: string }).error ?? text } catch { /* not json */ }
    throw new Error(msg || `${res.status}`)
  }
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

// Extract previewable file paths from an enriched tool-activity detail line, e.g.
// "Dev: read_file src/index.ts" or "Dev: batch_write_files (3): a.ts, b.ts, c.ts".
function fileRefsFromActivity(detail: string): string[] {
  const single = detail.match(/(?:read_file|write_file)\s+(\S+)/)
  if (single) return [single[1]!]
  const batch = detail.match(/batch_write_files\s*\(\d+\):\s*(.+)$/)
  if (batch) return batch[1]!.split(',').map(s => s.trim()).filter(p => p && p !== '…' && p !== '...')
  return []
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

// Tiny icon copy button for a single message/detail. Inherits currentColor so it
// works on both the accent (user) bubble and the muted agent bubbles.
function InlineCopy({ text, title = 'Copy' }: { text: string; title?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" title={title}
      onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200) }}
      className="inline-flex items-center opacity-50 hover:opacity-100 transition-opacity">
      {done
        ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
    </button>
  )
}

// Prominent "copy the whole screen as JSON" button (vs the subtle per-tile ones).
function ScreenCopyBtn({ getData }: { getData: () => string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(getData())
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--accent)] transition-colors"
      title="Copy the entire screen state (all tiles) as JSON"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      {copied ? 'Copied screen!' : 'Copy screen'}
    </button>
  )
}

// Explains the agent team + roles + board flow. Opened from the (i) in the chat header.
const ROLE_INFO: { role: string; title: string; blurb: string }[] = [
  { role: 'po', title: 'PO — Product Owner', blurb: 'Reads your chat and turns it into tickets. Decides what gets built and in what order. This is who you talk to.' },
  { role: 'BA', title: 'BA — Business Analyst', blurb: 'Refines a ticket into a clear spec with acceptance criteria. Pushes back on vague requests instead of guessing.' },
  { role: 'Dev', title: 'Dev — Developer', blurb: 'Implements the approved spec — writes and edits the app’s files, then deploys.' },
  { role: 'QA', title: 'QA — Quality Assurance', blurb: 'Reviews the Dev’s work against the acceptance criteria. Passes it to Done, or sends it back for another pass.' },
]

function AgentsInfoModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] shadow-[var(--shadow-card)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)] sticky top-0 bg-[var(--panel-solid)]">
          <h3 className="text-base font-bold text-[var(--ink)]">How your agent team works</h3>
          <button type="button" onClick={onClose} className="text-[var(--muted)] hover:text-[var(--ink)] text-xl leading-none">&times;</button>
        </div>
        <div className="px-5 py-4 space-y-5 text-sm text-[var(--ink)]">
          <p className="text-[var(--muted)]">
            You describe what you want in <strong className="text-[var(--ink)]">Chat</strong>. The team takes it from there —
            refining, building, reviewing, and deploying — while you watch the board. Press <strong className="text-[var(--ink)]">Play</strong> to
            let them work autonomously, <strong className="text-[var(--ink)]">Pause</strong> to stop.
          </p>

          <div>
            <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">The roles</h4>
            <div className="space-y-2">
              {ROLE_INFO.map(r => (
                <div key={r.role} className="flex gap-3 rounded-xl border border-[var(--line)] p-3">
                  <span className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0" style={{ background: ROLE_COLOR[r.role] ?? 'var(--muted)' }} />
                  <div>
                    <p className="font-semibold" style={{ color: ROLE_COLOR[r.role] ?? 'var(--ink)' }}>{r.title}</p>
                    <p className="text-[var(--muted)] mt-0.5">{r.blurb}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">The board</h4>
            <p className="text-[var(--muted)]">
              Tickets flow left to right: <strong className="text-[var(--ink)]">Inbox → BA → Dev → QA → Done</strong>.
              A ticket in <strong className="text-[var(--ink)]">Blocked</strong> means an agent needs your input — answer in chat,
              or press Play to retry. Click any ticket to see its full spec and the agents’ conversation.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Cost</h4>
            <p className="text-[var(--muted)]">
              Agents run on <strong className="text-[var(--ink)]">your own API key</strong> (add it in Profile). The board shows
              spend vs. your monthly cap; the team auto-pauses when the cap is reached.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Per-app agent configuration: model, runtime, and output token cap for each
// role (BA/Dev/QA). Backed by GET/PUT /projects/:slug/roles. Settings are
// per-project (each app's team can use different models) — not account-wide.
interface RoleCfg {
  role: string
  runtime: 'cf-native' | 'openai-responses'
  model: string
  maxTokens?: number
  persona?: string
  spineTools: string[]
  vendorTools: string[]
  systemPromptOverride?: string
}

const MODEL_SUGGESTIONS: Record<string, string[]> = {
  // Anthropic Claude 4.x lineup (Opus = most capable, Haiku = fastest/cheapest).
  'cf-native': ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  'openai-responses': ['gpt-4o', 'gpt-4o-mini', 'o3', 'o3-mini'],
}

function AgentSettingsModal({ appId, token, onClose }: { appId: string; token: string; onClose: () => void }) {
  const [roles, setRoles] = useState<RoleCfg[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api(`/projects/${appId}/roles`, token)
      .then((r: { roles: RoleCfg[] }) => setRoles(r.roles))
      .catch((e: Error) => setError(e.message))
  }, [appId, token])

  const patch = (role: string, change: Partial<RoleCfg>) =>
    setRoles(prev => prev?.map(r => r.role === role ? { ...r, ...change } : r) ?? prev)

  const save = async () => {
    if (!roles) return
    setSaving(true); setError(null)
    try {
      await api(`/projects/${appId}/roles`, token, { method: 'PUT', body: { roles } })
      setSaved(true); setTimeout(() => setSaved(false), 1500)
    } catch (e) { setError((e as Error).message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] shadow-[var(--shadow-card)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)] sticky top-0 bg-[var(--panel-solid)]">
          <div>
            <h3 className="text-base font-bold text-[var(--ink)]">Agent settings</h3>
            <p className="text-xs text-[var(--muted)]">Model &amp; token limit per role, for this app.</p>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--muted)] hover:text-[var(--ink)] text-xl leading-none">&times;</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {!roles && !error && <p className="text-sm text-[var(--muted)]">Loading…</p>}
          {roles?.map(r => (
            <div key={r.role} className="rounded-xl border border-[var(--line)] p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full" style={{ background: ROLE_COLOR[r.role] ?? 'var(--muted)' }} />
                <span className="text-sm font-bold" style={{ color: ROLE_COLOR[r.role] ?? 'var(--ink)' }}>{r.role}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="text-xs text-[var(--muted)]">
                  Provider
                  <select value={r.runtime} onChange={e => patch(r.role, { runtime: e.target.value as RoleCfg['runtime'] })}
                    className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)]">
                    <option value="cf-native">Anthropic</option>
                    <option value="openai-responses">OpenAI</option>
                  </select>
                </label>
                <label className="text-xs text-[var(--muted)]">
                  Model
                  <input list={`models-${r.role}`} value={r.model} onChange={e => patch(r.role, { model: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)]" />
                  <datalist id={`models-${r.role}`}>
                    {(MODEL_SUGGESTIONS[r.runtime] ?? []).map(m => <option key={m} value={m} />)}
                  </datalist>
                </label>
                <label className="text-xs text-[var(--muted)]">
                  Max tokens
                  <input type="number" min={1024} max={64000} step={1024} value={r.maxTokens ?? 16384}
                    onChange={e => patch(r.role, { maxTokens: Number(e.target.value) || undefined })}
                    className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)]" />
                </label>
              </div>
              <label className="text-xs text-[var(--muted)] block mt-2">
                Persona (soul) — identity, principles, tone
                <textarea value={r.persona ?? ''} rows={3}
                  onChange={e => patch(r.role, { persona: e.target.value })}
                  placeholder="e.g. You are the Developer. Directive: ship working code. Vibe: pragmatic, fast."
                  className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1.5 text-xs text-[var(--ink)]" />
              </label>
            </div>
          ))}
          {error && <p className="text-sm text-[var(--error)]">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--line)] sticky bottom-0 bg-[var(--panel-solid)]">
          {saved && <span className="text-xs text-[var(--success)]">Saved</span>}
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]">Close</button>
          <button type="button" onClick={save} disabled={saving || !roles}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// The team's durable memory — decisions/facts every agent treats as ground truth.
function MemoryPanel({ entries, onAdd, onDelete, onClose }: {
  entries: { id: string; category: string; key: string; value: string }[]
  onAdd: (key: string, value: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [k, setK] = useState('')
  const [v, setV] = useState('')
  const submit = () => { if (k.trim() && v.trim()) { onAdd(k.trim(), v.trim()); setK(''); setV('') } }
  return (
    <div className="flex flex-col lg:w-[340px] flex-shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--line)] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--ink)]">Memory {entries.length > 0 && <span className="text-[var(--muted)] font-normal">({entries.length})</span>}</h3>
          <p className="text-[10px] text-[var(--muted)]">Decisions &amp; facts the whole team uses</p>
        </div>
        <button type="button" onClick={onClose} className="text-[var(--muted)] hover:text-[var(--ink)] text-lg leading-none px-1" title="Close">&times;</button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2">
        {entries.length === 0 && <p className="text-xs text-[var(--muted)] py-2">No memory yet. The PO records decisions here as you make them — or add one below.</p>}
        {entries.map(e => (
          <div key={e.id} className="group rounded-lg border border-[var(--line)] p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--ink)] break-words">{e.key}</p>
                <p className="text-xs text-[var(--muted)] break-words">{e.value}</p>
              </div>
              <button type="button" onClick={() => onDelete(e.id)} title="Forget"
                className="text-[var(--muted)] hover:text-[var(--error)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-[var(--line)] space-y-2">
        <input value={k} onChange={e => setK(e.target.value)} placeholder="key (e.g. auth)"
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-xs text-[var(--ink)]" />
        <div className="flex gap-2">
          <input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} placeholder="value (e.g. GitHub OAuth)"
            className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-xs text-[var(--ink)]" />
          <button type="button" onClick={submit} disabled={!k.trim() || !v.trim()}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">Add</button>
        </div>
      </div>
    </div>
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
  const [selTicket, setSelTicket] = useState<Ticket | null>(null)
  const [selMsgs, setSelMsgs] = useState<{ id: string; author: string; body: string; createdAt: number }[]>([])
  const [showInfo, setShowInfo] = useState(false)
  const [showAgentCfg, setShowAgentCfg] = useState(false)
  // File preview (right inspector). Takes priority over the ticket panel.
  const [filePreview, setFilePreview] = useState<{ path: string; content: string; loading: boolean; truncated?: boolean } | null>(null)
  const [fileList, setFileList] = useState<{ path: string; size: number }[] | null>(null)
  const fileListOpenRef = useRef(false)
  // Project memory (decisions/facts the team treats as ground truth).
  const [memory, setMemory] = useState<{ id: string; category: string; key: string; value: string }[] | null>(null)
  const memOpenRef = useRef(false)
  // Windowed rendering — these lists can grow without bound, so render the tail
  // and let the user pull in older items with a "load previous" button.
  const [chatLimit, setChatLimit] = useState(20)
  const [actLimit, setActLimit] = useState(50)
  const [msgLimit, setMsgLimit] = useState(20)
  const [fileLimit, setFileLimit] = useState(50)
  const token = getToken()

  // Best-practice chat scroll: auto-stick to bottom only when already there,
  // otherwise surface a "N new" pill instead of yanking the view.
  const chatScroll = useStickToBottom(chat.length)
  const actScroll = useStickToBottom(activity.length)

  // Activity is persisted server-side (DB), loaded here — no client-only log.
  const loadActivity = useCallback(async () => {
    if (!token) return
    try {
      const a = await api(`/projects/${appId}/activity`, token) as { activity: { id: string; type: string; detail: string; createdAt: number; meta?: string }[] }
      const next = a.activity.map(e => ({ id: e.id, type: e.type, detail: e.detail, timestamp: e.createdAt, meta: e.meta }))
      // Only swap when it changed, so polling doesn't re-render/re-scroll the log.
      setActivity(prev => (prev.length === next.length && prev[prev.length - 1]?.id === next[next.length - 1]?.id) ? prev : next)
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

  // Delete a ticket (with confirm). Closes the panel + refreshes the board.
  const deleteTicket = useCallback(async (t: Ticket) => {
    if (!token) return
    if (!confirm(`Delete ticket "${t.title}"? This removes it and its messages.`)) return
    try {
      await api(`/projects/${appId}/tickets/${t.id}`, token, { method: 'DELETE' })
      setSelTicket(prev => prev?.id === t.id ? null : prev)
      setTickets(prev => prev.filter(x => x.id !== t.id))
    } catch (err) { setError((err as Error).message) }
  }, [token, appId])

  // Clear the founder↔PO chat (tickets are untouched).
  const clearChat = useCallback(async () => {
    if (!token) return
    if (!confirm('Clear the chat history? Tickets and the board are not affected.')) return
    try { await api(`/projects/${appId}/chat/history`, token, { method: 'DELETE' }); setChat([]) }
    catch (err) { setError((err as Error).message) }
  }, [token, appId])

  // Clear the activity trail (audit log) to start fresh.
  const clearActivity = useCallback(async () => {
    if (!token) return
    if (!confirm('Clear the activity log?')) return
    try { await api(`/projects/${appId}/activity`, token, { method: 'DELETE' }); setActivity([]) }
    catch (err) { setError((err as Error).message) }
  }, [token, appId])

  // Turn a chat message into a backlog ticket with one click (PO short-circuit).
  const convertToTicket = useCallback(async (text: string) => {
    if (!token || !text.trim()) return
    const title = text.trim().replace(/\s+/g, ' ').slice(0, 80)
    try {
      await api(`/projects/${appId}/tickets`, token, { method: 'POST', body: { title, rawIdea: text.trim() } })
      await refreshTickets()
    } catch (err) { setError((err as Error).message) }
  }, [token, appId, refreshTickets])

  // Reload chat history, but only swap state when it actually grew/changed — keeps
  // polling from re-rendering (and re-scrolling) the chat on every tick.
  const refreshChat = useCallback(async () => {
    if (!token) return
    try {
      const h = await api(`/projects/${appId}/chat/history`, token) as { messages: { id: string; role: string; body: string; toolCall?: { name: string; args: string }; createdAt: number }[] }
      const next = h.messages.map(m => ({ id: m.id, role: m.role as ChatMessage['role'], text: m.body, timestamp: m.createdAt, toolCall: m.toolCall }))
      setChat(prev => (prev.length === next.length && prev[prev.length - 1]?.id === next[next.length - 1]?.id) ? prev : next)
    } catch { /* ignore */ }
  }, [token, appId])

  // Pull the full live state in one shot. Used on WS (re)connect to catch up on
  // anything missed while disconnected, and as a polling fallback while running
  // (so the UI stays fresh even if the WebSocket push silently drops).
  const syncLive = useCallback(() => {
    refreshTickets()
    refreshChat()
    loadActivity()
  }, [refreshTickets, refreshChat, loadActivity])

  // Full-screen state snapshot — everything visible across every tile, as JSON,
  // so it can be pasted into a chat/issue and someone sees exactly what you see.
  const screenSnapshot = useCallback(() => JSON.stringify({
    capturedAt: new Date().toISOString(),
    app: { slug: appId, name: appName },
    project: project && {
      id: project.id, name: project.name, status: project.status,
      cost: { spentMonthlyUsd: project.costSpentMonthlyUsd, capMonthlyUsd: project.costCapMonthlyUsd },
    },
    board: {
      columns: COLUMNS.map(c => ({
        label: c.label,
        tickets: tickets.filter(t => (c.keys as string[]).includes(t.status))
          .map(t => ({ id: t.id, title: t.title, status: t.status, assignee: t.assigneeRole, iterations: t.iterations, costUsd: t.costSpentUsd })),
      })),
    },
    chat: chat.map(m => ({ role: m.role, text: m.text, time: new Date(m.timestamp).toISOString(), ...(m.toolCall ? { tool: m.toolCall } : {}) })),
    activity: activity.map(a => ({ type: a.type, detail: a.detail, time: new Date(a.timestamp).toISOString() })),
    selectedTicket: selTicket && {
      id: selTicket.id, title: selTicket.title, status: selTicket.status, assignee: selTicket.assigneeRole,
      iterations: selTicket.iterations, costUsd: selTicket.costSpentUsd, idea: selTicket.rawIdea,
      messages: selMsgs.map(m => ({ author: m.author, body: m.body, time: new Date(m.createdAt).toISOString() })),
    },
  }, null, 2), [appId, appName, project, tickets, chat, activity, selTicket, selMsgs])

  // Fetch a ticket's messages (no flicker — used both on open and on live refresh).
  const loadMsgs = useCallback(async (ticketId: string) => {
    if (!token) return
    try {
      const r = await api(`/projects/${appId}/tickets/${ticketId}/messages`, token) as { messages: { id: string; author: string; body: string; createdAt: number }[] }
      setSelMsgs(r.messages ?? [])
    } catch { /* ignore */ }
  }, [token, appId])

  // Open a ticket's detail panel (right of the board): full ticket + its messages.
  const openTicket = useCallback(async (t: Ticket) => {
    setFilePreview(null) // ticket takes the inspector
    setSelTicket(t)
    setSelMsgs([])
    setMsgLimit(20)
    await loadMsgs(t.id)
  }, [loadMsgs])

  // Preview one of the agents' working-tree files in the right inspector.
  const openFile = useCallback(async (path: string) => {
    if (!token) return
    setFilePreview({ path, content: '', loading: true })
    try {
      const r = await api(`/projects/${appId}/files/content?path=${encodeURIComponent(path)}`, token) as { path: string; content: string; truncated?: boolean }
      setFilePreview({ path: r.path, content: r.content, loading: false, truncated: r.truncated })
    } catch (err) {
      setFilePreview({ path, content: `Could not load file: ${(err as Error).message}`, loading: false })
    }
  }, [token, appId])

  // Show a tool call's captured output (args + returned result) in the inspector.
  const openToolResult = useCallback((entry: ActivityEntry) => {
    if (!entry.meta) return
    let content = entry.meta
    try {
      const m = JSON.parse(entry.meta) as { args?: unknown; ok?: boolean; result?: string }
      const parts: string[] = []
      if (m.args !== undefined && Object.keys(m.args as object).length) parts.push(`// args\n${JSON.stringify(m.args, null, 2)}`)
      if (m.ok === false) parts.push('// ⚠ tool reported an error')
      parts.push(`// output\n${m.result ?? '(no output)'}`)
      content = parts.join('\n\n')
    } catch { /* show raw meta */ }
    setFilePreview({ path: entry.detail, content, loading: false })
  }, [])

  const loadFileList = useCallback(async () => {
    if (!token) return
    try {
      const r = await api(`/projects/${appId}/files`, token) as { files: { path: string; size: number }[] }
      setFileList(r.files)
    } catch { setFileList([]) }
  }, [token, appId])

  // Lazy-load the file list the first time the Files browser is opened.
  const toggleFileList = useCallback(() => {
    if (fileList) { setFileList(null); fileListOpenRef.current = false; return }
    fileListOpenRef.current = true; setFileList([]); loadFileList()
  }, [fileList, loadFileList])

  const [syncing, setSyncing] = useState(false)
  // Manually pull the latest committed code from GitHub into the working tree.
  const syncRepo = useCallback(async () => {
    if (!token) return
    setSyncing(true)
    try {
      await api(`/projects/${appId}/sync`, token, { method: 'POST' })
      const f = await api(`/projects/${appId}/files`, token) as { files: { path: string; size: number }[] }
      setFileList(f.files)
    } catch (err) { setError((err as Error).message) }
    setSyncing(false)
  }, [token, appId])

  const loadMemory = useCallback(async () => {
    if (!token) return
    try {
      const r = await api(`/projects/${appId}/memory`, token) as { memory: { id: string; category: string; key: string; value: string }[] }
      setMemory(r.memory)
    } catch { setMemory([]) }
  }, [token, appId])

  const toggleMemory = useCallback(() => {
    if (memory) { setMemory(null); memOpenRef.current = false; return }
    memOpenRef.current = true; setMemory([]); loadMemory()
  }, [memory, loadMemory])

  const addMemory = useCallback(async (key: string, value: string) => {
    if (!token || !key.trim() || !value.trim()) return
    try {
      const r = await api(`/projects/${appId}/memory`, token, { method: 'POST', body: { key, value } }) as { memory: { id: string; category: string; key: string; value: string }[] }
      setMemory(r.memory)
    } catch (err) { setError((err as Error).message) }
  }, [token, appId])

  const deleteMemory = useCallback(async (id: string) => {
    if (!token) return
    try { await api(`/projects/${appId}/memory/${id}`, token, { method: 'DELETE' }); setMemory(prev => prev?.filter(m => m.id !== id) ?? prev) }
    catch (err) { setError((err as Error).message) }
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
      ws.onopen = () => { retry = 0; syncLive() } // catch up on anything missed while disconnected
      ws.onmessage = (ev) => {
        let d: Record<string, unknown>
        try { d = JSON.parse(typeof ev.data === 'string' ? ev.data : '') } catch { return }
        switch (d.type) {
          case 'play-state':
            setProject(prev => prev ? { ...prev, status: d.status as 'running' | 'paused' } : prev)
            break
          case 'activity': {
            const e = d.entry as { id: string; type: string; detail: string; createdAt: number; meta?: string } | undefined
            if (e) setActivity(prev => prev.some(a => a.id === e.id) ? prev : [...prev.slice(-300), { id: e.id, type: e.type, detail: e.detail, timestamp: e.createdAt, meta: e.meta }])
            break
          }
          case 'activity-meta': {
            // Tool output captured after the call — attach it to the row for the audit view.
            if (d.id) setActivity(prev => prev.map(a => a.id === d.id ? { ...a, meta: d.meta as string } : a))
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
          case 'message': // agent posted a message → ticket updatedAt bumped
            refreshTickets()
            break
          case 'ticket-deleted':
            if (d.ticketId) {
              setTickets(prev => prev.filter(x => x.id !== d.ticketId))
              setSelTicket(prev => prev?.id === d.ticketId ? null : prev)
            }
            break
          case 'memory-updated':
            if (memOpenRef.current) loadMemory()
            break
          case 'files-synced':
            if (fileListOpenRef.current) loadFileList()
            break
          case 'chat-cleared':
            setChat([])
            break
          case 'activity-cleared':
            setActivity([])
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
  }, [token, appId, notStarted, syncLive, loadMemory, loadFileList])

  // Polling safety net so the page is always interactive even if the WebSocket
  // silently drops. WS is the instant path; this guarantees freshness. It's cheap
  // (a few GETs) and respectful: paused while the tab is hidden, fast (2.5s) while
  // the team is running, slow (8s) when idle, and it refreshes on tab focus.
  useEffect(() => {
    if (notStarted) return
    const cadence = project?.status === 'running' ? 2500 : 8000
    const id = setInterval(() => { if (!document.hidden) syncLive() }, cadence)
    const onVisible = () => { if (!document.hidden) syncLive() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [notStarted, project?.status, syncLive])

  // Keep the open ticket panel live: when tickets refresh (WS), pull the fresh
  // row in, and re-fetch its messages whenever the agent has done another turn.
  useEffect(() => {
    if (!selTicket) return
    const fresh = tickets.find(t => t.id === selTicket.id)
    if (!fresh) return
    // updatedAt is the change signature — bumped on status, iteration, cost, AND
    // every new message — so the panel reloads on any update, not just transitions.
    if (fresh.updatedAt !== selTicket.updatedAt) {
      setSelTicket(fresh)
      loadMsgs(fresh.id)
    }
  }, [tickets, selTicket, loadMsgs])

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
    <div className="flex flex-col lg:flex-row gap-3 h-[calc(100dvh-120px)]">
      {/* LEFT: Chat */}
      <div className="flex flex-col lg:w-[360px] flex-shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--line)] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-bold text-[var(--ink)]">Chat</h3>
            <button type="button" onClick={() => setShowInfo(true)}
              className="text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
              title="How the agent team works">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            </button>
          </div>
          <div className="flex items-center gap-1">
            <CopyBtn label="ID" getData={() => JSON.stringify({ projectId: project?.id, slug: appId, name: project?.name })} />
            <InlineCopy title="Copy chat as JSON" text={JSON.stringify(chat.map(m => ({ role: m.role, text: m.text, time: new Date(m.timestamp).toISOString(), ...(m.toolCall ? { tool: m.toolCall } : {}) })), null, 2)} />
            <button type="button" onClick={clearChat} title="Clear chat history"
              className="text-[10px] text-[var(--muted)] hover:text-[var(--error)] px-1.5 py-0.5 rounded border border-[var(--line)] hover:border-[var(--error)] transition-colors">Clear</button>
          </div>
        </div>
        <div className="relative flex-1 min-h-0">
          <div ref={chatScroll.ref} onScroll={chatScroll.onScroll} className="absolute inset-0 overflow-y-auto p-4 space-y-3">
            {chat.length === 0 && (
              <p className="text-xs text-[var(--muted)] text-center py-8">
                Start typing. Describe what you want built, ask questions, give feedback.
              </p>
            )}
            {chat.length > chatLimit && (
              <button type="button" onClick={() => setChatLimit(l => l + 20)}
                className="block mx-auto mb-1 text-xs text-[var(--accent)] hover:underline">
                Load previous 20 ({chat.length - chatLimit} older)
              </button>
            )}
            {chat.slice(-chatLimit).map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
                  msg.role === 'user' ? 'bg-[var(--accent)] text-white'
                    : msg.role === 'system' ? 'bg-[var(--panel-hover)] text-[var(--muted)]'
                      : 'border border-[var(--line)] bg-[var(--panel)]'
                }`}>
                  {msg.role !== 'user' && msg.role !== 'system' && (
                    <span className="text-xs font-bold block mb-0.5" style={{ color: ROLE_COLOR[msg.role] }}>{msg.role}</span>
                  )}
                  {msg.role === 'user'
                    ? <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                    : <Markdown compact>{msg.text}</Markdown>}
                  {msg.toolCall && (
                    <div className="mt-1 px-2 py-1 rounded bg-black/5 dark:bg-white/5 text-xs font-mono text-[var(--muted)]">
                      {msg.toolCall.name}({msg.toolCall.args ?? ''})
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-[10px]">
                    <span className="opacity-50">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {msg.role !== 'system' && <InlineCopy text={msg.text} title="Copy message" />}
                    {msg.role !== 'system' && (
                      <button type="button" onClick={() => convertToTicket(msg.text)}
                        title="Create a ticket from this message"
                        className="inline-flex items-center gap-0.5 opacity-50 hover:opacity-100 transition-opacity font-semibold">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Ticket
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!chatScroll.stuck && (
            <button type="button" onClick={chatScroll.jumpToBottom}
              title="Scroll to latest"
              className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-[var(--accent)] text-white text-xs font-semibold px-3 py-1.5 shadow-lg hover:opacity-90">
              ↓ {chatScroll.unseen > 0 ? `${chatScroll.unseen} new` : 'Latest'}
            </button>
          )}
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
              title="Send message"
              className="flex items-center justify-center rounded-lg bg-[var(--accent)] w-10 h-10 flex-shrink-0 text-white hover:opacity-90 disabled:opacity-50">
              {sending
                ? <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT: Kanban + Activity */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
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
              <button type="button" onClick={() => setShowAgentCfg(true)}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--accent)] transition-colors"
                title="Configure the agents' model and token limits">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                Agents
              </button>
              <ScreenCopyBtn getData={screenSnapshot} />
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
                      <button key={ticket.id} type="button" onClick={() => openTicket(ticket)}
                        className={`w-full text-left rounded-lg border p-2 text-xs transition-colors cursor-pointer ${
                          selTicket?.id === ticket.id ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--line)] hover:border-[var(--accent)]'
                        }`} title={ticket.rawIdea}>
                        <p className="font-medium text-[var(--ink)] line-clamp-2 leading-tight">{ticket.title}</p>
                        <div className="flex items-center gap-1 mt-1">
                          {ticket.assigneeRole && (
                            <span className="font-bold" style={{ color: ROLE_COLOR[ticket.assigneeRole] ?? 'var(--muted)', fontSize: '10px' }}>{ticket.assigneeRole}</span>
                          )}
                          {ticket.iterations > 0 && <span className="text-[var(--muted)]" style={{ fontSize: '10px' }}>i:{ticket.iterations}</span>}
                        </div>
                      </button>
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
              <button type="button" onClick={toggleMemory}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                  memory ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--accent)]'
                }`}
                title="The team's memory — durable decisions & facts">
                Memory
              </button>
              <button type="button" onClick={toggleFileList}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                  fileList ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--accent)]'
                }`}
                title="Browse the agents' working-tree files">
                Files
              </button>
              <button type="button" onClick={loadActivity}
                className="text-[10px] text-[var(--muted)] hover:text-[var(--ink)] px-1.5 py-0.5 rounded border border-[var(--line)] hover:border-[var(--accent)]"
                title="Reload the persisted activity trail">
                Refresh
              </button>
              <CopyBtn label="Log" getData={() => JSON.stringify(activity.map(a => ({ type: a.type, detail: a.detail, time: new Date(a.timestamp).toISOString() })), null, 2)} />
              <button type="button" onClick={clearActivity} title="Clear activity log"
                className="text-[10px] text-[var(--muted)] hover:text-[var(--error)] px-1.5 py-0.5 rounded border border-[var(--line)] hover:border-[var(--error)] transition-colors">Clear</button>
            </div>
          </div>
          <div className="relative flex-1 min-h-0">
            <div ref={actScroll.ref} onScroll={actScroll.onScroll} className="absolute inset-0 overflow-y-auto space-y-1 text-xs font-mono">
              {activity.length === 0 && (
                <p className="text-[var(--muted)] py-4 text-center font-sans text-xs">Agent activity, tool calls, and ticket transitions appear here.</p>
              )}
              {activity.length > actLimit && (
                <button type="button" onClick={() => setActLimit(l => l + 50)}
                  className="block mx-auto mb-1 text-[11px] font-sans text-[var(--accent)] hover:underline">
                  Load previous 50 ({activity.length - actLimit} older)
                </button>
              )}
              {activity.slice(-actLimit).map(entry => {
                const refs = entry.type === 'tool' ? fileRefsFromActivity(entry.detail) : []
                return (
                  <div key={entry.id} className="flex gap-2 text-[var(--muted)] leading-snug">
                    <span className="flex-shrink-0 opacity-50 tabular-nums">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    <span className="flex-shrink-0 font-bold" style={{
                      color: entry.type === 'ticket' ? '#f59e0b' : entry.type === 'tool' ? '#3b82f6' : entry.type === 'transition' ? '#8b5cf6' : entry.type === 'error' ? 'var(--error)' : 'var(--muted)',
                    }}>{entry.type}</span>
                    {entry.meta ? (
                      // Tool call with captured output → click to inspect what it returned.
                      <button type="button" onClick={() => openToolResult(entry)}
                        className="text-left text-[var(--ink)] break-words min-w-0 hover:text-[var(--accent)] hover:underline"
                        title="View this tool's output">
                        {entry.detail} <span className="opacity-50">↗</span>
                      </button>
                    ) : refs.length === 1 ? (
                      <button type="button" onClick={() => openFile(refs[0]!)}
                        className="text-left text-[var(--ink)] break-words min-w-0 hover:text-[var(--accent)] hover:underline"
                        title="Preview this file">{entry.detail}</button>
                    ) : (
                      <span className="text-[var(--ink)] break-words min-w-0">
                        {entry.detail}
                        {refs.length > 1 && (
                          <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
                            {refs.map(p => (
                              <button key={p} type="button" onClick={() => openFile(p)}
                                className="text-[var(--accent)] hover:underline" title="Preview this file">[{p.split('/').pop()}]</button>
                            ))}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            {!actScroll.stuck && (
              <button type="button" onClick={actScroll.jumpToBottom}
                title="Scroll to latest"
                className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-[var(--accent)] text-white text-xs font-semibold px-3 py-1.5 shadow-lg hover:opacity-90 font-sans">
                ↓ {actScroll.unseen > 0 ? `${actScroll.unseen} new` : 'Latest'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* INSPECTOR (right): memory → file preview → file browser → ticket detail */}
      {memory !== null && !filePreview && (
        <MemoryPanel entries={memory} onAdd={addMemory} onDelete={deleteMemory} onClose={() => { setMemory(null); memOpenRef.current = false }} />
      )}

      {filePreview && (
        <div className="flex flex-col lg:w-[460px] flex-shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--line)] flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--muted)] flex-shrink-0"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
              <h3 className="text-xs font-mono font-semibold text-[var(--ink)] truncate" title={filePreview.path}>{filePreview.path}</h3>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <CopyBtn label="Copy" getData={() => filePreview.content} />
              <button type="button" onClick={() => setFilePreview(null)}
                className="text-[var(--muted)] hover:text-[var(--ink)] text-lg leading-none px-1" title="Close">&times;</button>
            </div>
          </div>
          <div className="flex-1 overflow-auto min-h-0">
            {filePreview.loading
              ? <p className="text-xs text-[var(--muted)] p-4">Loading…</p>
              : <CodeView code={filePreview.content} path={filePreview.path} />}
          </div>
          {filePreview.truncated && (
            <div className="px-4 py-1.5 border-t border-[var(--line)] text-[10px] text-[var(--muted)]">Truncated at 200 KB.</div>
          )}
        </div>
      )}

      {!filePreview && fileList && (
        <div className="flex flex-col lg:w-[300px] flex-shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--line)] flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--ink)]">Files {fileList.length > 0 && <span className="text-[var(--muted)] font-normal">({fileList.length})</span>}</h3>
            <div className="flex items-center gap-1">
              <button type="button" onClick={syncRepo} disabled={syncing}
                className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--accent)] disabled:opacity-50"
                title="Pull the latest committed code from GitHub">
                {syncing ? 'Syncing…' : 'Sync GitHub'}
              </button>
              <button type="button" onClick={() => { setFileList(null); fileListOpenRef.current = false }} className="text-[var(--muted)] hover:text-[var(--ink)] text-lg leading-none px-1" title="Close">&times;</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 py-1">
            {fileList.length === 0
              ? <p className="text-xs text-[var(--muted)] p-4">No files yet — the agents haven’t written any.</p>
              : <>
                {fileList.slice(0, fileLimit).map(f => (
                  <button key={f.path} type="button" onClick={() => openFile(f.path)}
                    className="flex items-center justify-between gap-2 w-full px-4 py-1.5 text-left hover:bg-[var(--panel-hover)]">
                    <span className="text-xs font-mono text-[var(--ink)] truncate" title={f.path}>{f.path}</span>
                    <span className="text-[10px] text-[var(--muted)] flex-shrink-0 tabular-nums">{f.size > 1024 ? `${(f.size / 1024).toFixed(1)}k` : `${f.size}b`}</span>
                  </button>
                ))}
                {fileList.length > fileLimit && (
                  <button type="button" onClick={() => setFileLimit(l => l + 50)}
                    className="block mx-auto my-1 text-[11px] text-[var(--accent)] hover:underline">
                    Show more ({fileList.length - fileLimit} more)
                  </button>
                )}
              </>}
          </div>
        </div>
      )}

      {/* DETAIL: ticket panel (right of the board) */}
      {!filePreview && !fileList && selTicket && (
        <div className="flex flex-col lg:w-[380px] flex-shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--line)] flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[var(--ink)] break-words leading-tight">{selTicket.title}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[11px] px-1.5 py-0.5 rounded font-semibold" style={{
                  background: 'var(--panel-hover)', color: 'var(--muted)',
                }}>{selTicket.status}</span>
                {selTicket.assigneeRole && (
                  <span className="text-[11px] font-bold" style={{ color: ROLE_COLOR[selTicket.assigneeRole] ?? 'var(--muted)' }}>{selTicket.assigneeRole}</span>
                )}
                {selTicket.iterations > 0 && <span className="text-[11px] text-[var(--muted)]">iter {selTicket.iterations}</span>}
                <span className="text-[11px] text-[var(--muted)]">${(selTicket.costSpentUsd ?? 0).toFixed(3)}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <CopyBtn label="JSON" getData={() => JSON.stringify({ ...selTicket, messages: selMsgs }, null, 2)} />
              <button type="button" onClick={() => deleteTicket(selTicket)}
                className="text-[var(--muted)] hover:text-[var(--error)] px-1" title="Delete this ticket">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
              <button type="button" onClick={() => setSelTicket(null)}
                className="text-[var(--muted)] hover:text-[var(--ink)] text-lg leading-none px-1" title="Close">&times;</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
            {selTicket.rawIdea && (
              <div>
                <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">Idea</p>
                <Markdown>{selTicket.rawIdea}</Markdown>
              </div>
            )}
            <div>
              <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">
                Conversation {selMsgs.length > 0 && <span className="opacity-60">({selMsgs.length})</span>}
              </p>
              {selMsgs.length === 0 ? (
                <p className="text-xs text-[var(--muted)] py-2">No agent messages on this ticket yet.</p>
              ) : (
                <div className="space-y-2">
                  {selMsgs.length > msgLimit && (
                    <button type="button" onClick={() => setMsgLimit(l => l + 20)}
                      className="block mx-auto mb-1 text-[11px] text-[var(--accent)] hover:underline">
                      Load previous 20 ({selMsgs.length - msgLimit} older)
                    </button>
                  )}
                  {selMsgs.slice(-msgLimit).map(m => (
                    <div key={m.id} className="rounded-lg border border-[var(--line)] p-2">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[11px] font-bold" style={{ color: ROLE_COLOR[m.author] ?? 'var(--muted)' }}>{m.author}</span>
                        <div className="flex items-center gap-1.5 text-[var(--muted)]">
                          <span className="text-[10px] tabular-nums">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <InlineCopy text={m.body} title="Copy message" />
                        </div>
                      </div>
                      <Markdown compact>{m.body}</Markdown>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showInfo && <AgentsInfoModal onClose={() => setShowInfo(false)} />}
      {showAgentCfg && token && <AgentSettingsModal appId={appId} token={token} onClose={() => setShowAgentCfg(false)} />}

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 font-bold">x</button>
        </div>
      )}
    </div>
  )
}
