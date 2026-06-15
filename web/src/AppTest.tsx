import { useState, useEffect, useCallback } from 'react'
import { Markdown } from './Markdown'
import { CodeView } from './CodeView'
import { TestResults } from './TestResults'
import { useStickToBottom } from './useStickToBottom'
import { api, mergeServerChat } from './agents/lib'
import { Collapsible, InlineCopy } from './agents/components'
import { useWindowedLimit } from './agents/useWindowedLimit'
import { ROLE_COLOR } from './agents/types'
import type { ChatMessage, ActivityEntry } from './agents/types'

/**
 * Test tab: 3-panel layout matching the Build tab.
 * Left: QA agent chat
 * Right top: spec list + detail preview
 * Right bottom: QA activity log
 */
export function AppTest({ appId, getToken }: { appId: string; getToken: () => string | null }) {
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [previewFile, setPreviewFile] = useState<{ path: string; content: string } | null>(null)
  const { limit: chatLimit, more: chatMore } = useWindowedLimit(30)
  const { limit: actLimit, more: actMore } = useWindowedLimit(50)
  const chatScroll = useStickToBottom(chat.length)
  const actScroll = useStickToBottom(activity.length)
  const token = getToken()

  const loadChat = useCallback(async () => {
    if (!token) { setLoading(false); return }
    try {
      const h = await api(`/projects/${appId}/chat/history?thread=test`, token) as {
        messages: { id: string; role: string; body: string; toolCall?: { name: string; args: string }; createdAt: number }[]
      }
      const next = h.messages.map(m => ({
        id: m.id, role: m.role as ChatMessage['role'], text: m.body, timestamp: m.createdAt, toolCall: m.toolCall,
      }))
      setChat(prev => mergeServerChat(prev, next))
    } catch { /* no history yet */ }
    setLoading(false)
  }, [token, appId])

  const loadActivity = useCallback(async () => {
    if (!token) return
    try {
      const a = await api(`/projects/${appId}/activity`, token) as { activity: ActivityEntry[] }
      // Filter to QA/test-related activity only
      const qa = a.activity
        .filter(e => e.type === 'test' || e.detail.startsWith('QA:') || e.detail.includes('QA ') || e.detail.includes('test'))
        .map(e => ({ ...e, timestamp: e.timestamp || (e as unknown as Record<string, unknown>).createdAt as number || 0 }))
      setActivity(prev => prev.length === qa.length && prev[prev.length - 1]?.id === qa[qa.length - 1]?.id ? prev : qa)
    } catch { /* */ }
  }, [token, appId])

  useEffect(() => { loadChat(); loadActivity() }, [loadChat, loadActivity])
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) { loadChat(); loadActivity() } }, 5000)
    return () => clearInterval(id)
  }, [loadChat, loadActivity])

  const sendMessage = async () => {
    if (!token || !input.trim()) return
    const text = input.trim()
    setInput(''); setSending(true)
    setChat(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text, timestamp: Date.now(), pending: true }])
    try {
      const result = await api(`/projects/${appId}/chat`, token, { method: 'POST', body: { message: text, thread: 'test' } }) as
        { id: string; role: string; body: string; toolCall?: { name: string; args: string }; createdAt: number }
      setChat(prev => prev.some(m => m.id === result.id) ? prev : [
        ...prev, { id: result.id, role: result.role as ChatMessage['role'], text: result.body, timestamp: result.createdAt, toolCall: result.toolCall },
      ])
      loadActivity() // refresh after QA writes files
    } catch (err) {
      setChat(prev => [...prev, { id: crypto.randomUUID(), role: 'system', text: `Error: ${(err as Error).message}`, timestamp: Date.now() }])
    }
    setSending(false)
  }

  const [confirmClear, setConfirmClear] = useState(false)
  const clearChat = async () => {
    if (!token) return
    try { await api(`/projects/${appId}/chat/history?thread=test`, token, { method: 'DELETE' }); setChat([]) } catch { /* */ }
    setConfirmClear(false)
  }

  const loadFile = async (path: string) => {
    if (!token) return
    try {
      const r = await api(`/projects/${appId}/files/content?path=${encodeURIComponent(path)}`, token) as { content: string }
      setPreviewFile({ path, content: r.content })
    } catch { setPreviewFile({ path, content: '(could not load)' }) }
  }

  if (loading) return <p className="py-12 text-center text-sm text-[var(--muted)]">Loading QA agent...</p>

  return (
    <div className="flex flex-col lg:flex-row gap-2 flex-1 min-h-0 overflow-hidden">
      {/* LEFT: QA Chat */}
      <div className="flex flex-col lg:w-[360px] flex-shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden min-h-0">
        <div className="px-3 py-2 border-b border-[var(--line)] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--ink)]">QA Agent</h3>
          <div className="flex items-center gap-1">
            <InlineCopy title="Copy chat" text={JSON.stringify(chat.map(m => ({ role: m.role, text: m.text })), null, 2)} />
            {confirmClear ? (
              <>
                <span className="text-[10px] text-[var(--muted)]">Clear?</span>
                <button type="button" onClick={clearChat} className="text-[10px] text-[var(--error)] font-semibold px-1">Yes</button>
                <button type="button" onClick={() => setConfirmClear(false)} className="text-[10px] text-[var(--muted)] px-1">No</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmClear(true)} title="Clear chat"
                className="text-[10px] text-[var(--muted)] hover:text-[var(--error)] px-1.5 py-0.5 rounded border border-[var(--line)] hover:border-[var(--error)] transition-colors">Clear</button>
            )}
          </div>
        </div>
        <div className="relative flex-1 min-h-0">
          <div ref={chatScroll.ref} onScroll={chatScroll.onScroll} className="absolute inset-0 overflow-y-auto p-4 space-y-3">
            {chat.length === 0 && (
              <p className="text-xs text-[var(--muted)] text-center py-8">
                QA agent — generates test specs from completed tickets and the KB.
                Try "generate tests" or describe a scenario.
              </p>
            )}
            {chat.length > chatLimit && (
              <button type="button" onClick={chatMore} className="block mx-auto mb-1 text-xs text-[var(--accent)] hover:underline">
                Load previous ({chat.length - chatLimit} older)
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
                  <Collapsible maxH={msg.role === 'user' ? 200 : 150}>
                    {msg.role === 'user'
                      ? <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                      : <Markdown compact>{msg.text}</Markdown>}
                  </Collapsible>
                  <div className="flex items-center gap-2 mt-1 text-[10px]">
                    <span className="opacity-50">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {msg.role !== 'system' && <InlineCopy text={msg.text} title="Copy" />}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!chatScroll.stuck && (
            <button type="button" onClick={chatScroll.jumpToBottom}
              className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[var(--accent)] text-white text-xs font-semibold px-3 py-1.5 shadow-lg hover:opacity-90">
              {chatScroll.unseen > 0 ? `${chatScroll.unseen} new` : 'Latest'}
            </button>
          )}
        </div>
        <div className="p-3 border-t border-[var(--line)]">
          <div className="flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder="Ask QA to generate tests, check coverage..."
              disabled={sending} aria-label="Message the QA agent"
              className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm text-[var(--ink)] disabled:opacity-50" />
            <button type="button" onClick={sendMessage} disabled={sending || !input.trim()}
              className="flex items-center justify-center rounded-lg bg-[var(--accent)] w-10 h-10 flex-shrink-0 text-white hover:opacity-90 disabled:opacity-50">
              {sending
                ? <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT: top = specs/results + detail, bottom = activity */}
      <div className="flex-1 flex flex-col gap-2 min-w-0 min-h-0">
        {/* Top: specs + file preview */}
        <div className="flex-[2] min-h-0 flex gap-2">
          <div className="flex-1 min-w-0 overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <TestResults appId={appId} live getToken={getToken} onFileClick={loadFile} />
          </div>
          {/* Right inspector: file preview */}
          {previewFile && (
            <div className="flex flex-col lg:w-[400px] flex-shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden min-h-0">
              <div className="px-3 py-2 border-b border-[var(--line)] flex items-center justify-between">
                <span className="text-xs font-mono text-[var(--ink)] truncate">{previewFile.path}</span>
                <button type="button" onClick={() => setPreviewFile(null)} className="text-xs text-[var(--muted)] hover:text-[var(--ink)]">Close</button>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                <CodeView code={previewFile.content} path={previewFile.path} />
              </div>
            </div>
          )}
        </div>

        {/* Bottom: QA activity log */}
        <div className="flex-[1] min-h-[100px] rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-[var(--ink)]">QA Activity</h3>
            <button type="button" onClick={loadActivity}
              className="text-[10px] text-[var(--muted)] hover:text-[var(--ink)] px-1.5 py-0.5 rounded border border-[var(--line)] hover:border-[var(--accent)]">Refresh</button>
          </div>
          <div className="relative flex-1 min-h-0">
            <div ref={actScroll.ref} onScroll={actScroll.onScroll} className="absolute inset-0 overflow-y-auto space-y-1 text-xs font-mono">
              {activity.length === 0 && (
                <p className="text-[var(--muted)] py-4 text-center font-sans text-xs">QA tool calls, test runs, and spec writes appear here.</p>
              )}
              {activity.length > actLimit && (
                <button type="button" onClick={actMore} className="block mx-auto mb-1 text-[11px] font-sans text-[var(--accent)] hover:underline">
                  Load previous 50 ({activity.length - actLimit} older)
                </button>
              )}
              {activity.slice(-actLimit).map(entry => (
                <div key={entry.id} className="flex gap-2 text-[var(--muted)] leading-snug">
                  <span className="flex-shrink-0 opacity-50 tabular-nums">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  <span className="flex-shrink-0 font-bold" style={{
                    color: entry.type === 'test' ? '#8b5cf6' : entry.type === 'tool' ? '#3b82f6' : entry.type === 'error' ? 'var(--error)' : 'var(--muted)',
                  }}>{entry.type}</span>
                  <span className="text-[var(--ink)] break-words min-w-0">{entry.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
