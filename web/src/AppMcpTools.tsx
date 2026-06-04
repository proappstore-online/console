import { useState, useEffect, useCallback } from 'react'
import { apiFetch, ApiError } from './api'

/**
 * MCP Tools section (Settings → Integrations). Read-only view of the tools this
 * app has registered with the platform MCP server — declared in the app's
 * `mcp.json` and registered on publish (CLI) or after a green agent deploy. An
 * external AI can call them as `<app>/<tool>` via mcp.proappstore.online. This
 * surfaces what's currently exposed; editing happens in the repo's mcp.json.
 */

interface ToolParam { type: string; description?: string; optional?: boolean; default?: unknown; max?: number }
interface AppTool {
  name: string
  description: string
  operation: 'query' | 'execute'
  sql: string
  params?: Record<string, ToolParam>
  requires_auth?: boolean
  updated_at?: number
}

export function AppMcpTools({ appId, getToken }: { appId: string; getToken: () => string | null }) {
  const [tools, setTools] = useState<AppTool[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [openSql, setOpenSql] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setError(null)
    try {
      const r = await apiFetch<{ tools: AppTool[] }>(`/apps/${appId}/tools`, { token })
      setTools(r.tools ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message)
      setTools([])
    }
    setLoading(false)
  }, [appId, getToken])

  useEffect(() => { load() }, [load])

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide">MCP tools</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Tools this app exposes to AI via <code className="text-[var(--ink)]">mcp.proappstore.online</code>, callable as{' '}
            <code className="text-[var(--ink)]">{appId}/&lt;tool&gt;</code>. Declared in the repo's{' '}
            <code className="text-[var(--ink)]">mcp.json</code>; registered automatically on publish/deploy.
          </p>
        </div>
        <button type="button" onClick={load}
          className="text-xs text-[var(--muted)] hover:text-[var(--ink)] px-2 py-1 rounded border border-[var(--line)] hover:border-[var(--accent)] flex-shrink-0">
          Refresh
        </button>
      </div>

      {loading && <p className="text-sm text-[var(--muted)] py-3">Loading…</p>}
      {error && <p className="text-sm text-[var(--error)] py-2">{error}</p>}

      {!loading && tools && tools.length === 0 && (
        <div className="text-sm text-[var(--muted)] py-3 space-y-2">
          <p>No tools registered yet. Add an <code className="text-[var(--ink)]">mcp.json</code> at the repo root (one parameterized SQL op per tool) and it registers on the next publish/deploy. The Dev agent writes one automatically for apps with a database.</p>
          <pre className="text-[11px] bg-[var(--paper)] border border-[var(--line)] rounded-lg p-2.5 overflow-x-auto text-[var(--ink)]">{`{ "tools": [{
  "name": "list_items",
  "description": "List the user's items",
  "operation": "query",
  "sql": "SELECT id, title FROM items WHERE user_id = :__user_id LIMIT :limit",
  "params": { "limit": { "type": "integer", "default": 50, "max": 200, "optional": true } },
  "requires_auth": true
}] }`}</pre>
        </div>
      )}

      {!loading && tools && tools.length > 0 && (
        <div className="space-y-2 mt-2">
          {tools.map((t) => (
            <div key={t.name} className="rounded-xl border border-[var(--line)] p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-sm font-semibold text-[var(--ink)]">{appId}/{t.name}</code>
                <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${t.operation === 'execute' ? 'text-[var(--warning,#ca8a04)] border-[var(--warning,#ca8a04)]' : 'text-[var(--muted)] border-[var(--line)]'}`}>
                  {t.operation === 'execute' ? 'writes' : 'reads'}
                </span>
                {t.requires_auth && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-[var(--line)] text-[var(--muted)]">🔒 auth</span>}
              </div>
              <p className="text-xs text-[var(--muted)] mt-1">{t.description}</p>
              {t.params && Object.keys(t.params).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {Object.entries(t.params).map(([k, p]) => (
                    <span key={k} className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[var(--paper)] border border-[var(--line)] text-[var(--ink)]">
                      {k}: {p.type}{p.optional || p.default !== undefined ? '?' : ''}
                    </span>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setOpenSql((s) => ({ ...s, [t.name]: !s[t.name] }))}
                className="text-[11px] text-[var(--muted)] hover:text-[var(--ink)] mt-1.5">
                {openSql[t.name] ? '▾ hide SQL' : '▸ show SQL'}
              </button>
              {openSql[t.name] && (
                <pre className="mt-1 text-[11px] bg-[var(--paper)] border border-[var(--line)] rounded-lg p-2.5 overflow-x-auto text-[var(--ink)] whitespace-pre-wrap">{t.sql}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
