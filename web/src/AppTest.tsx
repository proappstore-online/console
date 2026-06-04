import { useState, useEffect, useCallback } from 'react'
import { Markdown } from './Markdown'
import { TestResults } from './TestResults'
import { useStickToBottom } from './useStickToBottom'
import { api, mergeServerChat } from './agents/lib'
import { CopyBtn, InlineCopy } from './agents/components'
import { useWindowedLimit } from './agents/useWindowedLimit'
import { ROLE_COLOR } from './agents/types'
import type { ChatMessage } from './agents/types'

/**
 * Test tab: QA agent chat + CI test results.
 * The QA agent reads done tickets, the KB, and code to generate test scenarios.
 * Below the chat, TestResults shows the latest CI Playwright run.
 */
export function AppTest({ appId, getToken }: { appId: string; getToken: () => string | null }) {
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const { limit: chatLimit, more: chatMore } = useWindowedLimit(30)
  const chatScroll = useStickToBottom(chat.length)
  const token = getToken()

  // Load chat history for the test thread
  const loadChat = useCallback(async () => {
    if (!token) { setLoading(false); return }
    try {
      const h = await api(`/projects/${appId}/chat/history?thread=test`, token) as {
        messages: { id: string; role: string; body: string; toolCall?: { name: string; args: string }; createdAt: number }[]
      }
      const next = h.messages.map(m => ({
        id: m.id,
        role: m.role as ChatMessage['role'],
        text: m.body,
        timestamp: m.createdAt,
        toolCall: m.toolCall,
      }))
      setChat(prev => mergeServerChat(prev, next))
    } catch { /* no history yet */ }
    setLoading(false)
  }, [token, appId])

  useEffect(() => { loadChat() }, [loadChat])

  // Poll for new messages (QA agent may respond via the pipeline)
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) loadChat() }, 5000)
    const onVisible = () => { if (!document.hidden) loadChat() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [loadChat])

  const sendMessage = async () => {
    if (!token || !input.trim()) return
    const text = input.trim()
    setInput('')
    setSending(true)
    setChat(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text, timestamp: Date.now(), pending: true }])
    try {
      const result = await api(`/projects/${appId}/chat`, token, {
        method: 'POST',
        body: { message: text, thread: 'test' },
      }) as { id: string; role: string; body: string; toolCall?: { name: string; args: string }; createdAt: number }
      setChat(prev => prev.some(m => m.id === result.id) ? prev : [
        ...prev,
        { id: result.id, role: result.role as ChatMessage['role'], text: result.body, timestamp: result.createdAt, toolCall: result.toolCall },
      ])
    } catch (err) {
      setChat(prev => [...prev, { id: crypto.randomUUID(), role: 'system', text: `Error: ${(err as Error).message}`, timestamp: Date.now() }])
    }
    setSending(false)
  }

  const clearChat = async () => {
    if (!token) return
    if (!confirm('Clear QA chat history?')) return
    try { await api(`/projects/${appId}/chat/history?thread=test`, token, { method: 'DELETE' }); setChat([]) }
    catch { /* ignore */ }
  }

  if (loading) return <p className="py-12 text-center text-sm text-[var(--muted)]">Loading QA agent...</p>

  return (
    <div className="flex flex-col lg:flex-row gap-2 flex-1 min-h-0 overflow-hidden">
      {/* QA Chat */}
      <div className="flex flex-col lg:w-[400px] flex-shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--line)] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--ink)]">QA Agent</h3>
          <div className="flex items-center gap-1">
            <InlineCopy title="Copy chat" text={JSON.stringify(chat.map(m => ({ role: m.role, text: m.text })), null, 2)} />
            <button type="button" onClick={clearChat} title="Clear chat"
              className="text-[10px] text-[var(--muted)] hover:text-[var(--error)] px-1.5 py-0.5 rounded border border-[var(--line)] hover:border-[var(--error)] transition-colors">Clear</button>
          </div>
        </div>
        <div className="relative flex-1 min-h-0">
          <div ref={chatScroll.ref} onScroll={chatScroll.onScroll} className="absolute inset-0 overflow-y-auto p-4 space-y-3">
            {chat.length === 0 && (
              <p className="text-xs text-[var(--muted)] text-center py-8">
                I'm the QA agent. I generate test scenarios from your completed tickets and the Knowledge Base.
                Try "generate tests", "status", or describe a specific scenario.
              </p>
            )}
            {chat.length > chatLimit && (
              <button type="button" onClick={chatMore}
                className="block mx-auto mb-1 text-xs text-[var(--accent)] hover:underline">
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
                  {msg.role === 'user'
                    ? <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                    : <Markdown compact>{msg.text}</Markdown>}
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
              className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-[var(--accent)] text-white text-xs font-semibold px-3 py-1.5 shadow-lg hover:opacity-90">
              {chatScroll.unseen > 0 ? `${chatScroll.unseen} new` : 'Latest'}
            </button>
          )}
        </div>
        <div className="p-3 border-t border-[var(--line)]">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder="Ask QA to generate tests, check coverage..."
              disabled={sending}
              className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm text-[var(--ink)] disabled:opacity-50"
            />
            <button type="button" onClick={sendMessage} disabled={sending || !input.trim()}
              className="flex items-center justify-center rounded-lg bg-[var(--accent)] w-10 h-10 flex-shrink-0 text-white hover:opacity-90 disabled:opacity-50">
              {sending
                ? <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
            </button>
          </div>
        </div>
      </div>

      {/* Test results (CI) */}
      <div className="flex-1 min-w-0 overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <TestResults appId={appId} live />
      </div>
    </div>
  )
}
