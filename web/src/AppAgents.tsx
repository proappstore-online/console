import { useState, useEffect, useCallback, useRef } from 'react'
import { Markdown } from './Markdown'
import { KbPreview } from './KbPreview'
import { CodeView } from './CodeView'
import { useStickToBottom } from './useStickToBottom'
import { api, fileRefsFromActivity, prettyForDisplay, mergeServerChat } from './agents/lib'
import { CopyBtn, InlineCopy, ScreenCopyBtn, AgentsInfoModal, MemoryPanel } from './agents/components'
import { COLUMNS, LIST_SECTIONS, ROLE_COLOR } from './agents/types'
import { useWindowedLimit } from './agents/useWindowedLimit'
import type { Ticket, Project, ChatMessage, ActivityEntry } from './agents/types'

// ── Component ───────────────────────────────────────────────
// The agent team for ONE app. The agent-teams project slug IS the app id, so
// this is scoped by appId — no localStorage, no separate project picker.

export function AppAgents({ appId, appName, getToken, tab }: { appId: string; appName?: string | null; getToken: () => string | null; tab: 'research' | 'build' }) {
  const [project, setProject] = useState<Project | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [kbChat, setKbChat] = useState<ChatMessage[]>([]) // 'research' thread (Architect)
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [inputByThread, setInputByThread] = useState<{ research: string; build: string }>({ research: '', build: '' })
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notStarted, setNotStarted] = useState(false)
  const [idea, setIdea] = useState('')
  const [starting, setStarting] = useState(false)
  const [selTicket, setSelTicket] = useState<Ticket | null>(null)
  const [selMsgs, setSelMsgs] = useState<{ id: string; author: string; body: string; createdAt: number }[]>([])
  const [showInfo, setShowInfo] = useState(false)
  // File preview (right inspector). Takes priority over the ticket panel.
  const [filePreview, setFilePreview] = useState<{ path: string; content: string; loading: boolean; truncated?: boolean } | null>(null)
  // Preview view mode: 'pretty' (rendered Markdown / pretty JSON / highlighted) or 'raw' source.
  const [previewRaw, setPreviewRaw] = useState(false)
  const [fileList, setFileList] = useState<{ path: string; size: number }[] | null>(null)
  const fileListOpenRef = useRef(false)
  // Mirrors the selected ticket id so an out-of-order /messages response can be
  // dropped if the user already switched tickets (avoids showing ticket A's
  // messages under ticket B). Same staleness guard pattern as KbPreview.loadDoc.
  const selTicketIdRef = useRef<string | null>(null)
  // Project memory (decisions/facts the team treats as ground truth).
  const [memory, setMemory] = useState<{ id: string; category: string; key: string; value: string }[] | null>(null)
  const memOpenRef = useRef(false)
  // Windowed rendering — these lists can grow without bound, so render the tail
  // and let the user pull in older items with a "load previous" button.
  const { limit: chatLimit, more: chatMore } = useWindowedLimit(20)
  const { limit: actLimit, more: actMore } = useWindowedLimit(50)
  const { limit: msgLimit, more: msgMore, reset: msgReset } = useWindowedLimit(20)
  const { limit: fileLimit, more: fileMore } = useWindowedLimit(50)
  // Live "an agent is working right now" signal — set by run/heartbeat/tool WS
  // events, auto-cleared by a staleness check (see effect below). null = idle.
  const [agentWork, setAgentWork] = useState<{ role: string; at: number } | null>(null)
  // Per-ticket live status line — shows what the agent is doing right now on each ticket.
  // Keyed by ticketId. Updated by agent-text, agent-tool-call, activity WS events.
  // Auto-cleared after 30s of no updates (agent finished or idle).
  const [ticketLive, setTicketLive] = useState<Record<string, { text: string; role: string; at: number }>>({})
  // Bumped on every `files-synced` event so the live KB preview (Research tab)
  // refetches as the Architect writes — without holding the file list in memory here.
  const [filesVersion, setFilesVersion] = useState(0)
  // Board view: Kanban (wide) or List (compact / small screens). Remembered in
  // local prefs; first-run default follows the viewport so phones open in List.
  const [boardView, setBoardView] = useState<'kanban' | 'list'>(() => {
    const saved = localStorage.getItem('pas:agents:boardView')
    if (saved === 'kanban' || saved === 'list') return saved
    return typeof window !== 'undefined' && window.innerWidth < 1024 ? 'list' : 'kanban'
  })
  useEffect(() => { localStorage.setItem('pas:agents:boardView', boardView) }, [boardView])
  // List view caps "Recently done" to the latest few, with "load more".
  const [doneShown, setDoneShown] = useState(3)
  const token = getToken()

  // Two separate chat threads with two separate agents: Research → the Architect
  // (Knowledge Base), Build → the PO (backlog). The visible tab picks which one
  // the chat panel reads + sends to.
  const activeThread: 'research' | 'build' = tab === 'research' ? 'research' : 'build'
  const chatMessages = activeThread === 'research' ? kbChat : chat
  const setActiveChat = activeThread === 'research' ? setKbChat : setChat
  // Per-thread draft so a half-typed message doesn't follow you across tabs.
  const input = inputByThread[activeThread]
  const setInput = (v: string) => setInputByThread(prev => ({ ...prev, [activeThread]: v }))

  // Best-practice chat scroll: auto-stick to bottom only when already there,
  // otherwise surface a "N new" pill instead of yanking the view.
  const chatScroll = useStickToBottom(chatMessages.length)
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
    // No token (signed out / session not restored yet) — don't hang on the
    // "Loading agents…" spinner forever; clear it so the UI can react.
    if (!token) { if (!silent) setLoading(false); return }
    if (!silent) setLoading(true)
    try {
      const data = await api(`/projects/${appId}`, token) as Project
      setProject(data)
      setNotStarted(false)
      const t = await api(`/projects/${appId}/tickets`, token) as { tickets: Ticket[] }
      setTickets(t.tickets)
      // Load both chat threads (build = PO, research = Architect/KB).
      await Promise.all((['build', 'research'] as const).map(async (thread) => {
        try {
          const h = await api(`/projects/${appId}/chat/history?thread=${thread}`, token) as { messages: { id: string; role: string; body: string; toolCall?: { name: string; args: string }; createdAt: number }[] }
          const next = h.messages.map(m => ({ id: m.id, role: m.role as ChatMessage['role'], text: m.body, timestamp: m.createdAt, toolCall: m.toolCall }))
          ;(thread === 'research' ? setKbChat : setChat)(prev => mergeServerChat(prev, next))
        } catch { /* no history yet */ }
      }))
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

  // Clear the active chat thread (build = PO, research = KB). Tickets untouched.
  const clearChat = async () => {
    if (!token) return
    if (!confirm('Clear this chat thread? Tickets, the board, and the other chat are not affected.')) return
    try { await api(`/projects/${appId}/chat/history?thread=${activeThread}`, token, { method: 'DELETE' }); setActiveChat([]) }
    catch (err) { setError((err as Error).message) }
  }

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
    // Refresh BOTH threads so the other tab's chat is current when you switch.
    await Promise.all((['build', 'research'] as const).map(async (thread) => {
      const setFn = thread === 'research' ? setKbChat : setChat
      try {
        const h = await api(`/projects/${appId}/chat/history?thread=${thread}`, token) as { messages: { id: string; role: string; body: string; toolCall?: { name: string; args: string }; createdAt: number }[] }
        const next = h.messages.map(m => ({ id: m.id, role: m.role as ChatMessage['role'], text: m.body, timestamp: m.createdAt, toolCall: m.toolCall }))
        setFn(prev => {
          const merged = mergeServerChat(prev, next)
          // Skip the swap when nothing changed, so polling doesn't re-render/re-scroll.
          return (merged.length === prev.length && merged[merged.length - 1]?.id === prev[prev.length - 1]?.id) ? prev : merged
        })
      } catch { /* ignore */ }
    }))
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
      // Drop a stale response if the user switched tickets while this was in flight.
      if (selTicketIdRef.current !== ticketId) return
      setSelMsgs(r.messages ?? [])
    } catch { /* ignore */ }
  }, [token, appId])

  // Open a ticket's detail panel (right of the board): full ticket + its messages.
  const openTicket = useCallback(async (t: Ticket) => {
    setFilePreview(null) // ticket takes the inspector
    setSelTicket(t)
    selTicketIdRef.current = t.id // sync immediately so loadMsgs' guard is correct
    setSelMsgs([])
    msgReset()
    await loadMsgs(t.id)
  }, [loadMsgs])

  // Keep the staleness ref in sync with the selected ticket from ALL paths
  // (close button, WS deletion, live-refresh swap) — not just openTicket.
  useEffect(() => { selTicketIdRef.current = selTicket?.id ?? null }, [selTicket])

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
  // For file-writing tools we render each file's content with REAL newlines —
  // dumping the raw args JSON keeps content strings escaped (\n), so a 200-line
  // file shows as one unreadable line.
  const openToolResult = useCallback((entry: ActivityEntry) => {
    if (!entry.meta) return
    let content = entry.meta
    try {
      const m = JSON.parse(entry.meta) as { args?: unknown; ok?: boolean; result?: string }
      const a = (m.args ?? {}) as { path?: string; content?: string; message?: string; files?: { path?: string; content?: string }[] }
      const parts: string[] = []
      if (Array.isArray(a.files)) {
        // batch_write_files: render each file as `// path` + real content
        if (a.message) parts.push(`// commit: ${a.message}`)
        for (const f of a.files) parts.push(`// ${f.path ?? '(file)'}\n${f.content ?? ''}`)
      } else if (typeof a.content === 'string') {
        // write_file
        parts.push(`// ${a.path ?? '(file)'}${a.message ? ` — ${a.message}` : ''}\n${a.content}`)
      } else if (m.args !== undefined && Object.keys(m.args as object).length) {
        parts.push(`// args\n${JSON.stringify(m.args, null, 2)}`)
      }
      if (m.ok === false) parts.push('// ⚠ tool reported an error')
      if (m.result !== undefined) parts.push(`// output\n${m.result || '(no output)'}`)
      content = parts.join('\n\n')
    } catch {
      // Meta is capped at 20KB for the audit log, so a large batch write is
      // truncated and won't parse. Be honest + point at the live file links.
      content = `⚠ This tool's captured output exceeded the 20KB audit cap and was truncated, so it can't be parsed cleanly.\nClick the [file] links in the activity row to view the full, live version.\n\n${entry.meta}`
    }
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
          // Live "agent working" signals → drive the working/idle indicator + per-ticket status.
          case 'agent-run-started':
          case 'agent-heartbeat':
          case 'agent-text':
          case 'agent-tool-call':
          case 'agent-tool-result': {
            const role = String(d.role ?? 'Agent')
            setAgentWork({ role, at: Date.now() })
            // Debug: log agent events to verify WS delivery
            if (d.type === 'agent-text' || d.type === 'agent-tool-call') {
              console.log(`[ticket-live] ${d.type} tid=${d.ticketId} role=${d.role} text=${String(d.text ?? d.name ?? '').slice(0, 50)}`)
            }
            // Per-ticket live status line — accumulate text deltas into a rolling buffer
            if (d.ticketId) {
              const tid = String(d.ticketId)
              if (d.type === 'agent-text') {
                // Append delta to existing text (agent streams token by token)
                setTicketLive(prev => {
                  const existing = prev[tid]?.text ?? ''
                  const appended = (existing + String(d.text ?? '')).replace(/\n/g, ' ')
                  return { ...prev, [tid]: { text: appended.slice(-200), role, at: Date.now() } }
                })
              } else {
                // Tool calls and transitions replace the text entirely
                const line = d.type === 'agent-tool-call' ? `${role}: ${d.name}()`
                  : d.type === 'agent-tool-result' ? `${role}: ${d.ok ? '✓' : '✗'} tool done`
                  : d.type === 'agent-run-started' ? `${role} starting...`
                  : `${role} working...`
                setTicketLive(prev => ({ ...prev, [tid]: { text: line, role, at: Date.now() } }))
              }
            }
            break
          }
          case 'activity': {
            const e = d.entry as { id: string; ticketId?: string; type: string; detail: string; createdAt: number; meta?: string } | undefined
            if (e) setActivity(prev => prev.some(a => a.id === e.id) ? prev : [...prev.slice(-300), { id: e.id, type: e.type, detail: e.detail, timestamp: e.createdAt, meta: e.meta }])
            // A tool/transition row arriving also means an agent is active — keep the indicator alive.
            if (e && (e.type === 'tool' || e.type === 'transition')) setAgentWork(w => ({ role: w?.role ?? 'Agent', at: Date.now() }))
            // Per-ticket live status from activity
            if (e?.ticketId && (e.type === 'tool' || e.type === 'transition')) {
              setTicketLive(prev => ({ ...prev, [e.ticketId!]: { text: e.detail.slice(-120), role: e.detail.split(':')[0] ?? 'Agent', at: Date.now() } }))
            }
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
            const setFn = d.thread === 'research' ? setKbChat : setChat // route to the right thread
            setFn(prev => prev.some(m => m.id === id) ? prev : [...prev, { id, role: d.role as ChatMessage['role'], text: String(d.body ?? ''), timestamp: Date.now(), toolCall: d.toolCall as ChatMessage['toolCall'] }])
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
            setFilesVersion(v => v + 1) // drive the live KB preview (Research tab)
            if (fileListOpenRef.current) loadFileList()
            break
          case 'chat-cleared':
            (d.thread === 'research' ? setKbChat : setChat)([])
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

  // Clear stale indicators after silence. No explicit run-finished event —
  // staleness is the signal. Global: 20s. Per-ticket: 30s.
  useEffect(() => {
    const t = setInterval(() => {
      setAgentWork(w => (w && Date.now() - w.at > 20000 ? null : w))
      // Keep ticket live text for 2 minutes (was 30s — too short, agents
      // finish and the text disappears before the user reads it). The text
      // persists as the "last thing the agent said" until the next run or timeout.
      setTicketLive(prev => {
        const now = Date.now()
        const next: typeof prev = {}
        let changed = false
        for (const [k, v] of Object.entries(prev)) {
          if (now - v.at < 120000) next[k] = v
          else changed = true
        }
        return changed ? next : prev
      })
    }, 4000)
    return () => clearInterval(t)
  }, [])

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

  // Brainstorm-first: founder triggers the one-time Architect KB build when ready.
  const [buildingKb, setBuildingKb] = useState(false)
  const buildKB = async () => {
    if (!token) return
    setBuildingKb(true)
    try {
      await api(`/projects/${appId}/research`, token, { method: 'POST' })
      loadProject(true)
    } catch (err) { setError((err as Error).message) }
    finally { setBuildingKb(false) }
  }
  // KB is a conversation, not a ticket: it's "started" once the Research thread
  // has any messages (the founder or the Architect has spoken).
  const kbStarted = kbChat.length > 0

  const sendMessage = async () => {
    if (!token || !input.trim()) return
    const text = input.trim()
    const thread = activeThread
    const apply = thread === 'research' ? setKbChat : setChat
    setInput('')
    setSending(true)
    // Show it immediately (optimistic). `pending` keeps it on screen through any
    // racing server refetch until the server echoes it.
    apply(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text, timestamp: Date.now(), pending: true }])
    try {
      const result = await api(`/projects/${appId}/chat`, token, { method: 'POST', body: { message: text, thread } }) as { id: string; role: string; body: string; toolCall?: { name: string; args: string }; createdAt: number }
      // Append the agent reply (dedupe in case the WS push already delivered it).
      apply(prev => prev.some(m => m.id === result.id) ? prev : [...prev, { id: result.id, role: result.role as ChatMessage['role'], text: result.body, timestamp: result.createdAt, toolCall: result.toolCall }])
      // The research (KB) agent may have written KB files; refresh the preview.
      if (thread === 'research') setFilesVersion(v => v + 1)
      // The PO may have filed a ticket → refresh the board/activity (build only).
      else { refreshTickets(); loadActivity() }
    } catch (err) {
      apply(prev => [...prev, { id: crypto.randomUUID(), role: 'system', text: `Error: ${(err as Error).message}`, timestamp: Date.now() }])
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

  // The board shows build work only — the KB is a conversation, never a ticket.
  const buildTickets = tickets.filter(t => t.kind !== 'research')
  // One ticket card, shared by the Kanban columns and the List sections.
  const ticketCard = (ticket: Ticket) => (
    <div key={ticket.id} role="button" tabIndex={0} onClick={() => openTicket(ticket)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTicket(ticket) } }}
      className={`w-full text-left rounded-lg border p-2 text-xs transition-colors cursor-pointer ${
        selTicket?.id === ticket.id ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--line)] hover:border-[var(--accent)]'
      }`} title={ticket.rawIdea}>
      <div className="flex items-center gap-1 mb-0.5">
        <span className="font-mono font-bold text-[var(--accent)]" style={{ fontSize: '10px' }}>#{ticket.seq}</span>
        <InlineCopy text={`#${ticket.seq}`} title={`Copy ticket #${ticket.seq} to quote in chat`} />
      </div>
      <p className="font-medium text-[var(--ink)] line-clamp-2 leading-tight">{ticket.title}</p>
      {ticketLive[ticket.id] ? (
        <div className="mt-1 flex items-start gap-1">
          <span className="relative flex h-1.5 w-1.5 flex-shrink-0 mt-0.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: ROLE_COLOR[ticketLive[ticket.id].role] ?? 'var(--accent)' }}></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: ROLE_COLOR[ticketLive[ticket.id].role] ?? 'var(--accent)' }}></span>
          </span>
          <p className="text-[10px] text-[var(--muted)] leading-tight line-clamp-2 break-words" title={ticketLive[ticket.id].text}>
            {ticketLive[ticket.id].text}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-1 mt-1">
          {ticket.assigneeRole && (
            <span className="font-bold" style={{ color: ROLE_COLOR[ticket.assigneeRole] ?? 'var(--muted)', fontSize: '10px' }}>{ticket.assigneeRole}</span>
          )}
          {ticket.iterations > 0 && <span className="text-[var(--muted)]" style={{ fontSize: '10px' }}>i:{ticket.iterations}</span>}
          {ticket.stuckReason && <span className="text-[var(--error)]" style={{ fontSize: '10px' }}>blocked</span>}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex flex-col lg:flex-row gap-2 flex-1 min-h-0 overflow-hidden">
      {/* Chat panel — one per tab, bound to its own thread/agent: Research → the
          Architect (KB), Build → the PO (backlog). Rendered for both tabs. */}
      {(tab === 'research' || tab === 'build') && (
      <div className="flex flex-col lg:w-[360px] flex-shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden min-h-0">
        <div className="px-3 py-2 border-b border-[var(--line)] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-bold text-[var(--ink)]">{activeThread === 'research' ? 'KB chat · Architect' : 'Chat · PO'}</h3>
            <button type="button" onClick={() => setShowInfo(true)}
              className="text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
              title="How the agent team works">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            </button>
          </div>
          <div className="flex items-center gap-1">
            <CopyBtn label="ID" getData={() => JSON.stringify({ projectId: project?.id, slug: appId, name: project?.name })} />
            <InlineCopy title="Copy chat as JSON" text={JSON.stringify(chatMessages.map(m => ({ role: m.role, text: m.text, time: new Date(m.timestamp).toISOString(), ...(m.toolCall ? { tool: m.toolCall } : {}) })), null, 2)} />
            <button type="button" onClick={clearChat} title="Clear chat history"
              className="text-[10px] text-[var(--muted)] hover:text-[var(--error)] px-1.5 py-0.5 rounded border border-[var(--line)] hover:border-[var(--error)] transition-colors">Clear</button>
          </div>
        </div>
        <div className="relative flex-1 min-h-0">
          <div ref={chatScroll.ref} onScroll={chatScroll.onScroll} className="absolute inset-0 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <p className="text-xs text-[var(--muted)] text-center py-8">
                {activeThread === 'research'
                  ? 'Brainstorm what this app is with the Architect. It researches and writes the Knowledge Base (KNOWLEDGE.md + docs/) — it does not build features.'
                  : 'Describe what you want built, ask questions, give feedback. The PO turns it into tickets the team builds.'}
              </p>
            )}
            {chatMessages.length > chatLimit && (
              <button type="button" onClick={chatMore}
                className="block mx-auto mb-1 text-xs text-[var(--accent)] hover:underline">
                Load previous 20 ({chatMessages.length - chatLimit} older)
              </button>
            )}
            {chatMessages.slice(-chatLimit).map(msg => (
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
                    {msg.role !== 'system' && activeThread === 'build' && (
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
              placeholder={activeThread === 'research' ? 'Brainstorm the app / shape the KB…' : 'Describe what you want built…'}
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
      )}

      {/* RESEARCH: live Knowledge Base preview (Architect's KNOWLEDGE.md + docs/) */}
      {tab === 'research' && (
        <KbPreview
          appId={appId}
          token={token}
          version={filesVersion}
          kbStarted={kbStarted}
          building={buildingKb}
          onBuildKb={buildKB}
          working={agentWork}
        />
      )}

      {/* BUILD: Kanban + Activity */}
      {tab === 'build' && (
      <div className="flex-1 flex flex-col gap-2 min-w-0 min-h-0">
        <div className="flex-[2] min-h-0 flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
          <div className="flex items-center justify-between mb-2 flex-shrink-0 gap-2 flex-wrap">
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
              {/* Live working/idle indicator — so the founder knows whether an agent
                  is actively running vs the team being idle/done. */}
              {project && (agentWork && agentWork.role !== 'Architect' ? (
                <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400" title={`${agentWork.role} is running right now`}>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  {agentWork.role} working…
                </span>
              ) : project.status === 'running' ? (
                <span className="text-xs text-[var(--muted)]" title="Agents are on and waiting for work">Idle — waiting for work</span>
              ) : null)}
            </div>
            <div className="flex items-center gap-2">
              {/* Kanban ↔ List view — remembered in local prefs; List is the
                  small-screen default. */}
              <div className="flex items-center rounded-lg border border-[var(--line-strong)] overflow-hidden" role="tablist" aria-label="Board view">
                <button type="button" role="tab" aria-selected={boardView === 'kanban'} onClick={() => setBoardView('kanban')}
                  className={`px-2 py-1 text-[11px] font-semibold transition-colors ${boardView === 'kanban' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}
                  title="Kanban board">Board</button>
                <button type="button" role="tab" aria-selected={boardView === 'list'} onClick={() => setBoardView('list')}
                  className={`px-2 py-1 text-[11px] font-semibold transition-colors ${boardView === 'list' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}
                  title="List view">List</button>
              </div>
              <button type="button" onClick={() => { window.location.hash = `#/apps/${appId}/settings` }}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--accent)] transition-colors"
                title="Configure the agents (identity, prompt, skills, model) in Settings">
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
          {/* Scrolls internally so the page itself never scrolls. */}
          <div className="flex-1 min-h-0 overflow-y-auto -mr-1 pr-1">
            {boardView === 'kanban' ? (
              <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
                {COLUMNS.map(col => {
                  const colTickets = buildTickets.filter(t => (col.keys as string[]).includes(t.status))
                  return (
                    <div key={col.label}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                        <span className="text-[11px] font-semibold text-[var(--ink)]">{col.label}</span>
                        {colTickets.length > 0 && <span className="text-[11px] text-[var(--muted)]">{colTickets.length}</span>}
                      </div>
                      <div className="space-y-1.5 min-h-[60px]">
                        {colTickets.map(ticketCard)}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-3">
                {LIST_SECTIONS.map(sec => {
                  const isDone = (sec.keys as string[]).includes('done')
                  const matched = buildTickets
                    .filter(t => (sec.keys as string[]).includes(t.status))
                    .sort((a, b) => b.updatedAt - a.updatedAt)
                  if (matched.length === 0) return null
                  const shown = isDone ? matched.slice(0, doneShown) : matched
                  return (
                    <div key={sec.label}>
                      <div className="flex items-center gap-1.5 mb-1.5 sticky top-0 z-[1] bg-[var(--panel)] py-0.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: sec.color }} />
                        <span className="text-[11px] font-semibold text-[var(--ink)]">{sec.label}</span>
                        <span className="text-[11px] text-[var(--muted)]">{matched.length}</span>
                      </div>
                      <div className="space-y-1.5">
                        {shown.map(ticketCard)}
                      </div>
                      {isDone && matched.length > doneShown && (
                        <button type="button" onClick={() => setDoneShown(n => n + 10)}
                          className="mt-1.5 text-[11px] font-semibold text-[var(--accent)] hover:underline">
                          Load {Math.min(10, matched.length - doneShown)} more ({matched.length - doneShown} older)
                        </button>
                      )}
                    </div>
                  )
                })}
                {buildTickets.length === 0 && (
                  <p className="text-xs text-[var(--muted)] text-center py-8">No tickets yet — chat with the PO to build the backlog.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex-[1] min-h-[120px] rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3 flex flex-col">
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
              <button type="button" onClick={() => openFile('KNOWLEDGE.md')}
                className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--accent)] transition-colors"
                title="The project Knowledge Base the Architect wrote (the team's source of truth)">
                KB
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
                <button type="button" onClick={actMore}
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
                    {refs.length > 0 ? (
                      // File read/write tool → link each file to its LIVE working-tree
                      // content (full + syntax-highlighted), which is never truncated
                      // unlike the captured meta. `raw ↗` still inspects the meta.
                      <span className="text-[var(--ink)] break-words min-w-0">
                        {entry.detail.replace(/:\s.*$/, '')}
                        <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
                          {refs.map(p => (
                            <button key={p} type="button" onClick={() => openFile(p)}
                              className="text-[var(--accent)] hover:underline" title={`Preview ${p} (live)`}>[{p.split('/').pop()}]</button>
                          ))}
                          {entry.meta && (
                            <button type="button" onClick={() => openToolResult(entry)}
                              className="opacity-50 hover:opacity-100 hover:underline" title="Inspect the raw tool call (captured args/output)">raw ↗</button>
                          )}
                        </span>
                      </span>
                    ) : entry.meta ? (
                      // Non-file tool with captured output → click to inspect.
                      <button type="button" onClick={() => openToolResult(entry)}
                        className="text-left text-[var(--ink)] break-words min-w-0 hover:text-[var(--accent)] hover:underline"
                        title="View this tool's output">
                        {entry.detail} <span className="opacity-50">↗</span>
                      </button>
                    ) : (
                      <span className="text-[var(--ink)] break-words min-w-0">{entry.detail}</span>
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
      )}

      {/* INSPECTOR (right, Build only): memory → file preview → file browser → ticket detail */}
      {tab === 'build' && memory !== null && !filePreview && (
        <MemoryPanel entries={memory} onAdd={addMemory} onDelete={deleteMemory} onClose={() => { setMemory(null); memOpenRef.current = false }} />
      )}

      {tab === 'build' && filePreview && (
        <div className="flex flex-col lg:w-[460px] flex-shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden min-h-0">
          <div className="px-4 py-2.5 border-b border-[var(--line)] flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--muted)] flex-shrink-0"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
              <h3 className="text-xs font-mono font-semibold text-[var(--ink)] truncate" title={filePreview.path}>{filePreview.path}</h3>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Pretty (rendered markdown / pretty JSON / highlighted) vs Raw source */}
              <div className="flex rounded-md border border-[var(--line)] overflow-hidden text-[10px] font-medium">
                {(['pretty', 'raw'] as const).map((mode) => (
                  <button key={mode} type="button" onClick={() => setPreviewRaw(mode === 'raw')}
                    className={`px-2 py-0.5 transition-colors ${(mode === 'raw') === previewRaw ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}>
                    {mode === 'pretty' ? 'Pretty' : 'Raw'}
                  </button>
                ))}
              </div>
              <CopyBtn label="Copy" getData={() => previewRaw ? filePreview.content : prettyForDisplay(filePreview.path, filePreview.content)} />
              <button type="button" onClick={() => setFilePreview(null)}
                className="text-[var(--muted)] hover:text-[var(--ink)] text-lg leading-none px-1" title="Close">&times;</button>
            </div>
          </div>
          <div className="flex-1 overflow-auto min-h-0">
            {filePreview.loading
              ? <p className="text-xs text-[var(--muted)] p-4">Loading…</p>
              : (!previewRaw && /\.(md|markdown)$/i.test(filePreview.path))
                ? <div className="p-4 text-sm"><Markdown>{filePreview.content}</Markdown></div>
                : <CodeView code={previewRaw ? filePreview.content : prettyForDisplay(filePreview.path, filePreview.content)} path={filePreview.path} />}
          </div>
          {filePreview.truncated && (
            <div className="px-4 py-1.5 border-t border-[var(--line)] text-[10px] text-[var(--muted)]">Truncated at 200 KB.</div>
          )}
        </div>
      )}

      {tab === 'build' && !filePreview && fileList && (
        <div className="flex flex-col lg:w-[300px] flex-shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden min-h-0">
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
                  <button type="button" onClick={fileMore}
                    className="block mx-auto my-1 text-[11px] text-[var(--accent)] hover:underline">
                    Show more ({fileList.length - fileLimit} more)
                  </button>
                )}
              </>}
          </div>
        </div>
      )}

      {/* DETAIL: ticket panel (right of the board) */}
      {tab === 'build' && !filePreview && !fileList && selTicket && (
        <div className="flex flex-col lg:w-[380px] flex-shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden min-h-0">
          <div className="px-4 py-3 border-b border-[var(--line)] flex items-start justify-between gap-2 flex-shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-1 mb-0.5">
                <span className="font-mono font-bold text-[var(--accent)] text-[11px]">#{selTicket.seq}</span>
                <InlineCopy text={`#${selTicket.seq}`} title={`Copy ticket #${selTicket.seq} to quote in chat`} />
              </div>
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
            {selTicket.stuckReason && (
              <div className="rounded-lg border border-[var(--error)]/40 bg-[var(--error)]/5 p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--error)' }}>
                  {selTicket.status === 'failed' || selTicket.status === 'cancelled' ? 'Failed' : 'Needs attention'}
                </p>
                <p className="text-xs text-[var(--ink)] whitespace-pre-wrap break-words">{selTicket.stuckReason}</p>
              </div>
            )}
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
                    <button type="button" onClick={msgMore}
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

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 font-bold">x</button>
        </div>
      )}
    </div>
  )
}
