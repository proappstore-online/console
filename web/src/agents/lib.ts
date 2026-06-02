// Non-component helpers for the agent-teams console view.
import { AGENT_BASE as AGENT_API } from '../api'

export async function api(path: string, token: string, opts?: { method?: string; body?: unknown }) {
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
