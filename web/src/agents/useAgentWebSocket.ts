/**
 * Custom hook: connects to the agent-teams WebSocket for a project and dispatches
 * events to the appropriate state setters. Extracted from AppAgents.tsx so the
 * event-handling logic is isolated, testable, and doesn't bloat the component.
 *
 * Handles: reconnection with backoff, event routing, per-ticket live status
 * (running text, cost, elapsed timer), activity log, chat routing, ticket
 * refresh triggers, and memory/file-synced signals.
 */
import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { Ticket, Project, ChatMessage, ActivityEntry } from './types'

export interface TicketLiveEntry {
  text: string
  role: string
  at: number
  startedAt?: number
  costUsd?: number
  tokensIn?: number
  tokensOut?: number
}

interface UseAgentWebSocketOpts {
  appId: string
  token: string | null
  notStarted: boolean
  // State setters from the parent component
  setProject: Dispatch<SetStateAction<Project | null>>
  setTickets: Dispatch<SetStateAction<Ticket[]>>
  setChat: Dispatch<SetStateAction<ChatMessage[]>>
  setKbChat: Dispatch<SetStateAction<ChatMessage[]>>
  setActivity: Dispatch<SetStateAction<ActivityEntry[]>>
  setAgentWork: Dispatch<SetStateAction<{ role: string; at: number } | null>>
  setTicketLive: Dispatch<SetStateAction<Record<string, TicketLiveEntry>>>
  setSelTicket: Dispatch<SetStateAction<Ticket | null>>
  setFilesVersion: Dispatch<SetStateAction<number>>
  // Callbacks
  syncLive: () => void
  refreshTickets: () => void
  loadMemory: () => void
  loadFileList: () => void
  memOpenRef: { current: boolean }
  fileListOpenRef: { current: boolean }
}

export function useAgentWebSocket(opts: UseAgentWebSocketOpts) {
  const { appId, token, notStarted, syncLive, loadMemory, loadFileList } = opts

  useEffect(() => {
    if (!token || notStarted) return
    let closed = false
    let ws: WebSocket | null = null
    let retry = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined

    const connect = () => {
      if (closed) return
      ws = new WebSocket(`wss://agents.proappstore.online/v1/projects/${appId}/ws?token=${encodeURIComponent(token)}`)
      ws.onopen = () => { retry = 0; syncLive() }
      ws.onmessage = (ev) => {
        let d: Record<string, unknown>
        try { d = JSON.parse(typeof ev.data === 'string' ? ev.data : '') } catch { return }
        handleEvent(d, opts)
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
}

/** Route a single WS event to the appropriate state setter. Exported for testing. */
export function handleEvent(d: Record<string, unknown>, opts: UseAgentWebSocketOpts) {
  const {
    setProject, setTickets, setChat, setKbChat, setActivity,
    setAgentWork, setTicketLive, setSelTicket, setFilesVersion,
    refreshTickets, loadMemory, loadFileList, memOpenRef, fileListOpenRef,
  } = opts

  switch (d.type) {
    case 'play-state':
      setProject(prev => prev ? { ...prev, status: d.status as 'running' | 'paused' } : prev)
      break

    // Agent working signals — per-ticket live status + cost
    case 'agent-run-started':
    case 'agent-heartbeat':
    case 'agent-text':
    case 'agent-tool-call':
    case 'agent-tool-result': {
      const role = String(d.role ?? 'Agent')
      setAgentWork({ role, at: Date.now() })
      if (d.ticketId) {
        const tid = String(d.ticketId)
        const cost = typeof d.costUsd === 'number' ? d.costUsd : undefined
        const tokIn = typeof d.tokensIn === 'number' ? d.tokensIn : undefined
        const tokOut = typeof d.tokensOut === 'number' ? d.tokensOut : undefined

        if (d.type === 'agent-text') {
          setTicketLive(prev => {
            const existing = prev[tid]?.text ?? ''
            const appended = (existing + String(d.text ?? '')).replace(/\n/g, ' ')
            return { ...prev, [tid]: { text: appended.slice(-200), role, at: Date.now(), startedAt: prev[tid]?.startedAt,
              costUsd: cost ?? prev[tid]?.costUsd, tokensIn: tokIn ?? prev[tid]?.tokensIn, tokensOut: tokOut ?? prev[tid]?.tokensOut } }
          })
        } else if (d.type === 'agent-run-started') {
          setTicketLive(prev => ({ ...prev, [tid]: { text: `${role} starting...`, role, at: Date.now(), startedAt: Date.now(),
            costUsd: cost, tokensIn: tokIn, tokensOut: tokOut } }))
        } else {
          setTicketLive(prev => {
            const existing = prev[tid]
            const text = existing?.text || (d.type === 'agent-tool-call' ? `${role}: ${String(d.name ?? 'tool')}()` : `${role} working...`)
            return { ...prev, [tid]: { text, role, at: Date.now(), startedAt: existing?.startedAt,
              costUsd: cost ?? existing?.costUsd, tokensIn: tokIn ?? existing?.tokensIn, tokensOut: tokOut ?? existing?.tokensOut } }
          })
        }
      }
      break
    }

    case 'activity': {
      const e = d.entry as { id: string; ticketId?: string; type: string; detail: string; createdAt: number; meta?: string } | undefined
      if (e) setActivity(prev => prev.some(a => a.id === e.id) ? prev : [...prev.slice(-300), { id: e.id, type: e.type, detail: e.detail, timestamp: e.createdAt, meta: e.meta }])
      if (e && (e.type === 'tool' || e.type === 'transition')) setAgentWork(w => ({ role: w?.role ?? 'Agent', at: Date.now() }))
      if (e?.ticketId) {
        setTicketLive(prev => {
          const existing = prev[e.ticketId!]
          const text = existing?.text || e.detail.slice(-120)
          const role = existing?.role || e.detail.split(':')[0] || 'Agent'
          return { ...prev, [e.ticketId!]: { ...existing, text, role, at: Date.now() } }
        })
      }
      break
    }
    case 'activity-meta':
      if (d.id) setActivity(prev => prev.map(a => a.id === d.id ? { ...a, meta: d.meta as string } : a))
      break

    case 'chat': {
      if (d.role === 'user') break
      const id = String(d.id ?? crypto.randomUUID())
      const setFn = d.thread === 'research' ? setKbChat : setChat
      setFn(prev => prev.some(m => m.id === id) ? prev : [...prev, { id, role: d.role as ChatMessage['role'], text: String(d.body ?? ''), timestamp: Date.now(), toolCall: d.toolCall as ChatMessage['toolCall'] }])
      break
    }

    case 'transition':
    case 'ticket-created':
    case 'ticket-updated':
    case 'ticket-failed':
    case 'message':
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
      setFilesVersion(v => v + 1)
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
