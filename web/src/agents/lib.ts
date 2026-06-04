// Non-component helpers for the agent-teams console view.
import { AGENT_BASE, requestJson } from '../api'
import type { ChatMessage } from './types'

/**
 * Reconcile a server chat snapshot with current local state WITHOUT making a
 * just-sent message blink out. The server snapshot is authoritative for confirmed
 * messages; we append any optimistic `pending` user message the snapshot hasn't
 * caught up to yet, and drop it once the server echoes it (matched by role+text)
 * so it doesn't double up with the server-assigned copy.
 *
 * Without this, a refetch racing a just-sent message replaces the list with a
 * stale snapshot that lacks the message → it disappears, then a later poll/WS
 * re-adds it → it reappears. Merging keeps it on screen the whole time.
 * (Non-pending client-only messages — the welcome line, transient errors — are
 * intentionally NOT preserved here, matching the prior full-replace behavior.)
 */
export function mergeServerChat(prev: ChatMessage[], server: ChatMessage[]): ChatMessage[] {
  // Each server-echoed user message retires AT MOST ONE pending optimistic
  // message (consume the match), so two identical-text sends (e.g. "ok"/"ok")
  // don't both vanish when only the first echo has arrived.
  const claimed = new Set<number>()
  const pending = prev.filter((m) => {
    if (!m.pending) return false
    const idx = server.findIndex((s, i) => !claimed.has(i) && s.role === 'user' && s.text === m.text)
    if (idx === -1) return true // not echoed yet → keep showing the optimistic copy
    claimed.add(idx)
    return false // echoed → drop the optimistic duplicate
  })
  return pending.length ? [...server, ...pending] : server
}

/** Typed fetch against the agent-teams API (AGENT_BASE). Throws ApiError on
 *  non-2xx (its message is the body's `error` field or text). */
export function api(path: string, token: string, opts?: { method?: string; body?: unknown }) {
  return requestJson<unknown>(`${AGENT_BASE}${path}`, {
    token,
    method: opts?.method ?? 'GET',
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  })
}

// Pretty-print a file's content for the previewer. Minified .json (common for
// agent-written files) otherwise renders as one unreadable line — parse and
// re-stringify with indentation. Non-JSON or invalid JSON is returned as-is.
export function prettyForDisplay(path: string, content: string): string {
  if (/\.json$/i.test(path)) {
    try { return JSON.stringify(JSON.parse(content), null, 2) } catch { /* leave as-is */ }
  }
  return content
}

// Extract previewable file paths from an enriched tool-activity detail line, e.g.
// "Dev: read_file src/index.ts" or "Dev: batch_write_files (3): a.ts, b.ts, c.ts".
export function fileRefsFromActivity(detail: string): string[] {
  const single = detail.match(/(?:read_file|write_file)\s+(\S+)/)
  if (single) return [single[1]!]
  const batch = detail.match(/batch_write_files\s*\(\d+\):\s*(.+)$/)
  if (batch) return batch[1]!.split(',').map(s => s.trim()).filter(p => p && p !== '…' && p !== '...')
  return []
}
