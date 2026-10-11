import { useState, useEffect, useCallback } from 'react'
import { apiFetch, ApiError } from './api'
import { CopyOpen } from './AppPublishing'

/**
 * MCP Tools section (Settings → Integrations). Read-only view of the tools this
 * app has registered with the platform MCP server — declared in the app's
 * `mcp.json` and registered on publish (CLI) or after a green agent deploy. An
 * external AI connects to `https://mcp.proappstore.online/mcp/apps/<appId>` and
 * calls them by name. This surfaces what's currently exposed; tools come from the
 * repo's mcp.json or from endpoints created in Data → API (`source: 'console'`).
 */

interface ToolParam { type: string; description?: string; optional?: boolean; default?: unknown; max?: number }
/** The app's own MCP endpoint: only its tools, plus whoami and mcp_audit_log. */
export const appMcpEndpoint = (appId: string) => `https://mcp.proappstore.online/mcp/apps/${appId}`

/** Copy-paste config per client; the local server name is the app id (platform#149). */
export function mcpClientSnippets(appId: string): { client: string; hint: string; snippet: string }[] {
  const url = appMcpEndpoint(appId)
  return [
    { client: 'Claude Code', hint: 'Run in a terminal', snippet: `claude mcp add --transport http ${appId} ${url}` },
    {
      client: 'Claude Desktop', hint: 'claude_desktop_config.json',
      snippet: JSON.stringify({ mcpServers: { [appId]: { command: 'npx', args: ['mcp-remote', url] } } }, null, 2),
    },
    {
      client: 'Cursor', hint: '~/.cursor/mcp.json or .cursor/mcp.json',
      snippet: JSON.stringify({ mcpServers: { [appId]: { url } } }, null, 2),
    },
  ]
}

interface AppTool {
  name: string
  description: string
  operation: 'query' | 'execute' | 'batch'
  sql?: string
  /** A batch tool's statements, run atomically — it has no `sql`. */
  statements?: string[]
  params?: Record<string, ToolParam>
  requires_auth?: boolean
  /** Where the tool came from; absent on older responses, which means code. */
  source?: 'code' | 'console'
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
            Declared in the repo's <code className="text-[var(--ink)]">mcp.json</code>, or created in Data → API. Code tools
            register automatically on publish/deploy. Connect an AI client to this app's own MCP endpoint below. It serves only this app's tools,
            and calls run as the signed-in user.
          </p>
        </div>
        <button type="button" onClick={load}
          className="text-xs text-[var(--muted)] hover:text-[var(--ink)] px-2 py-1 rounded border border-[var(--line)] hover:border-[var(--accent)] flex-shrink-0">
          Refresh
        </button>
      </div>

      <div className="mt-3 rounded-xl border border-[var(--line)] p-3 space-y-3">
        <h4 className="text-xs font-semibold text-[var(--ink)]">Connect an AI client</h4>
        <div className="flex items-center justify-between gap-3">
          <code data-testid="mcp-endpoint" className="text-[11px] font-mono text-[var(--ink)] truncate">{appMcpEndpoint(appId)}</code>
          <CopyOpen url={appMcpEndpoint(appId)} openable={false} />
        </div>
        {mcpClientSnippets(appId).map((c) => (
          <div key={c.client}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-[var(--muted)]"><span className="font-semibold text-[var(--ink)]">{c.client}</span> · {c.hint}</p>
              <CopyOpen url={c.snippet} openable={false} />
            </div>
            <pre data-testid={`mcp-snippet-${c.client}`} className="mt-1 text-[11px] bg-[var(--paper)] border border-[var(--line)] rounded-lg p-2.5 overflow-x-auto text-[var(--ink)]">{c.snippet}</pre>
          </div>
        ))}
        <p className="text-[11px] text-[var(--muted)]">
          First connection opens a ProAppStore sign-in in your browser. Access is per app: connecting to another app asks again.
        </p>
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
                <code className="text-sm font-semibold text-[var(--ink)]">{t.name}</code>
                <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${t.operation === 'query' ? 'text-[var(--muted)] border-[var(--line)]' : 'text-[var(--warning,#ca8a04)] border-[var(--warning,#ca8a04)]'}`}>
                  {t.operation === 'query' ? 'reads' : 'writes'}
                </span>
                {t.statements && <span className="text-[10px] text-[var(--muted)]">atomic, {t.statements.length} statements</span>}
                {t.source === 'console' && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-[var(--accent)] text-[var(--accent)]">console</span>}
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
                <pre className="mt-1 text-[11px] bg-[var(--paper)] border border-[var(--line)] rounded-lg p-2.5 overflow-x-auto text-[var(--ink)] whitespace-pre-wrap">{t.sql ?? t.statements?.join(';\n\n')}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
