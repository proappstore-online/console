import { useState, useEffect, useCallback, useRef } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
}

type Tab = 'tables' | 'query' | 'schema'

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function dataUrl(appId: string, path: string): string {
  return `https://data-${appId}.proappstore.online${path}`
}

async function fetchTables(token: string, appId: string): Promise<string[]> {
  const res = await fetch(dataUrl(appId, '/tables'), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Failed to load tables (${res.status})`)
  const data = (await res.json()) as { tables: string[] }
  return data.tables ?? []
}

async function runQuery(
  token: string,
  appId: string,
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult> {
  const res = await fetch(dataUrl(appId, '/query'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(body || `Query failed (${res.status})`)
  }
  const data = (await res.json()) as {
    columns?: string[]
    rows?: Record<string, unknown>[]
    results?: Record<string, unknown>[]
    meta?: { changes?: number; rows_read?: number }
  }
  const rows = data.rows ?? data.results ?? []
  const columns = data.columns ?? (rows.length > 0 ? Object.keys(rows[0]!) : [])
  return { columns, rows, rowCount: rows.length }
}

async function runExecute(
  token: string,
  appId: string,
  sql: string,
  params: unknown[] = [],
): Promise<{ changes: number }> {
  const res = await fetch(dataUrl(appId, '/execute'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(body || `Execute failed (${res.status})`)
  }
  const data = (await res.json()) as { meta?: { changes?: number } }
  return { changes: data.meta?.changes ?? 0 }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DANGEROUS_RE = /^\s*(DELETE|DROP|ALTER|TRUNCATE)\b/i

function isDangerous(sql: string): boolean {
  return DANGEROUS_RE.test(sql.trim())
}

function isSelectLike(sql: string): boolean {
  return /^\s*(SELECT|PRAGMA|EXPLAIN)\b/i.test(sql.trim())
}

function formatCellValue(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  appId: string
  getToken: () => string | null
}

export function DbBrowser({ appId, getToken }: Props) {
  const [tab, setTab] = useState<Tab>('tables')
  const [tables, setTables] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const token = getToken()
    if (!token) { setLoadError('Not signed in.'); setLoading(false); return }
    try {
      const t = await fetchTables(token, appId)
      setTables(t)
      setLoadError(null)
    } catch (e) {
      setLoadError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [appId, getToken])

  useEffect(() => {
    setLoading(true)
    reload()
  }, [reload])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'tables', label: 'Tables' },
    { key: 'query', label: 'SQL Query' },
    { key: 'schema', label: 'Schema' },
  ]

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <h3 className="display-font text-lg font-bold text-[var(--ink)] mb-1">Database</h3>
      <p className="text-sm text-[var(--muted)] mb-4">
        Browse your app's D1 database at{' '}
        <code className="text-xs font-mono">data-{appId}.proappstore.online</code>.
      </p>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 border-b border-[var(--line)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-[var(--accent)] text-[var(--ink)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-[var(--muted)]">Loading...</p>}

      {!loading && loadError && (
        <div className="space-y-2">
          <p className="text-sm text-[var(--error)]">Couldn't connect to data worker. {loadError}</p>
          <button
            onClick={() => { setLoading(true); reload() }}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !loadError && tab === 'tables' && (
        <TablesTab
          appId={appId}
          tables={tables}
          selectedTable={selectedTable}
          onSelectTable={setSelectedTable}
          getToken={getToken}
        />
      )}

      {!loading && !loadError && tab === 'query' && (
        <QueryTab appId={appId} getToken={getToken} />
      )}

      {!loading && !loadError && tab === 'schema' && (
        <SchemaTab appId={appId} getToken={getToken} />
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Tables tab — table list + row browser
// ---------------------------------------------------------------------------

function TablesTab({
  appId,
  tables,
  selectedTable,
  onSelectTable,
  getToken,
}: {
  appId: string
  tables: string[]
  selectedTable: string | null
  onSelectTable: (t: string | null) => void
  getToken: () => string | null
}) {
  if (tables.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)] italic py-4">
        No tables found. Run a migration or use <code className="font-mono text-xs">app.db.execute()</code> to create one.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* Table list */}
      <div>
        <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Tables ({tables.length})
        </h4>
        <div className="flex flex-wrap gap-2">
          {tables.map((t) => (
            <button
              key={t}
              onClick={() => onSelectTable(selectedTable === t ? null : t)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-mono transition-colors ${
                selectedTable === t
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] font-semibold'
                  : 'border-[var(--line-strong)] text-[var(--ink)] hover:bg-[var(--panel-hover)]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Row browser */}
      {selectedTable && (
        <RowBrowser appId={appId} table={selectedTable} getToken={getToken} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row browser — paginated table viewer
// ---------------------------------------------------------------------------

function RowBrowser({
  appId,
  table,
  getToken,
}: {
  appId: string
  table: string
  getToken: () => string | null
}) {
  const [result, setResult] = useState<QueryResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const PAGE_SIZE = 100

  const loadRows = useCallback(async (off: number) => {
    const token = getToken()
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const r = await runQuery(
        token,
        appId,
        `SELECT * FROM "${table}" LIMIT ${PAGE_SIZE} OFFSET ${off}`,
      )
      if (off === 0) {
        setResult(r)
      } else {
        setResult((prev) => {
          if (!prev) return r
          return {
            columns: r.columns.length > 0 ? r.columns : prev.columns,
            rows: [...prev.rows, ...r.rows],
            rowCount: prev.rowCount + r.rowCount,
          }
        })
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [appId, table, getToken])

  useEffect(() => {
    setResult(null)
    setOffset(0)
    loadRows(0)
  }, [table, loadRows])

  const loadMore = () => {
    const next = offset + PAGE_SIZE
    setOffset(next)
    loadRows(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
          Rows in <span className="font-mono text-[var(--ink)]">{table}</span>
        </h4>
        {result && (
          <span className="text-xs text-[var(--muted)] tabular-nums">
            {result.rowCount} row{result.rowCount === 1 ? '' : 's'} loaded
          </span>
        )}
      </div>

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}

      {result && result.rows.length === 0 && !loading && (
        <p className="text-sm text-[var(--muted)] italic">Table is empty.</p>
      )}

      {result && result.rows.length > 0 && (
        <ResultsTable columns={result.columns} rows={result.rows} />
      )}

      {loading && <p className="text-sm text-[var(--muted)]">Loading...</p>}

      {result && result.rowCount > 0 && result.rowCount % PAGE_SIZE === 0 && !loading && (
        <button
          onClick={loadMore}
          className="rounded-lg border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--panel-hover)]"
        >
          Load more
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SQL Query tab
// ---------------------------------------------------------------------------

function QueryTab({
  appId,
  getToken,
}: {
  appId: string
  getToken: () => string | null
}) {
  const [sql, setSql] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [execResult, setExecResult] = useState<{ changes: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const dangerous = isDangerous(sql)
  const selectLike = isSelectLike(sql)

  const run = async () => {
    const token = getToken()
    if (!token) return
    const trimmed = sql.trim()
    if (!trimmed) return
    if (dangerous && !confirmed) return

    setRunning(true)
    setResult(null)
    setExecResult(null)
    setError(null)

    try {
      if (selectLike) {
        const r = await runQuery(token, appId, trimmed)
        setResult(r)
      } else {
        const r = await runExecute(token, appId, trimmed)
        setExecResult(r)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
      setConfirmed(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      if (!dangerous || confirmed) run()
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block">
          <span className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
            SQL
          </span>
          <textarea
            ref={textareaRef}
            rows={5}
            value={sql}
            onChange={(e) => { setSql(e.target.value); setConfirmed(false) }}
            onKeyDown={handleKeyDown}
            placeholder="SELECT * FROM users LIMIT 10"
            spellCheck={false}
            className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm font-mono text-[var(--ink)] placeholder:text-[var(--muted)]/60 focus:outline-none focus:border-[var(--ink)]"
          />
        </label>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Cmd+Enter to run. SELECT queries return rows; INSERT/UPDATE/DELETE show affected row count.
        </p>
      </div>

      {/* Danger warning */}
      {dangerous && (
        <div className="rounded-lg border border-[var(--error)]/40 bg-[var(--error)]/5 px-4 py-3">
          <p className="text-sm font-semibold text-[var(--error)] mb-1">
            Destructive statement detected
          </p>
          <p className="text-xs text-[var(--error)]/80 mb-2">
            This query contains DELETE, DROP, ALTER, or TRUNCATE. This action cannot be undone.
          </p>
          <label className="flex items-center gap-2 text-xs text-[var(--error)]">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="rounded"
            />
            I understand this will modify or destroy data
          </label>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={run}
          disabled={running || !sql.trim() || (dangerous && !confirmed)}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {running ? 'Running...' : 'Run'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/5 px-4 py-3">
          <p className="text-xs font-semibold text-[var(--error)] uppercase tracking-wide mb-1">Error</p>
          <pre className="text-sm text-[var(--error)] font-mono whitespace-pre-wrap break-words">{error}</pre>
        </div>
      )}

      {/* SELECT results */}
      {result && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
              Results
            </h4>
            <span className="text-xs text-[var(--muted)] tabular-nums">
              {result.rowCount} row{result.rowCount === 1 ? '' : 's'}
            </span>
          </div>
          {result.rows.length > 0 ? (
            <ResultsTable columns={result.columns} rows={result.rows} />
          ) : (
            <p className="text-sm text-[var(--muted)] italic">Query returned no rows.</p>
          )}
        </div>
      )}

      {/* Execute results */}
      {execResult !== null && (
        <div className="rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/5 px-4 py-3">
          <p className="text-sm text-[var(--success)]">
            Statement executed successfully. <strong>{execResult.changes}</strong> row{execResult.changes === 1 ? '' : 's'} affected.
          </p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Schema tab
// ---------------------------------------------------------------------------

function SchemaTab({
  appId,
  getToken,
}: {
  appId: string
  getToken: () => string | null
}) {
  const [schemas, setSchemas] = useState<{ name: string; sql: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const token = getToken()
    if (!token) { setLoading(false); return }
    runQuery(
      token,
      appId,
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
      .then((r) => {
        if (cancelled) return
        setSchemas(
          r.rows.map((row) => ({
            name: String(row.name ?? ''),
            sql: String(row.sql ?? ''),
          })),
        )
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [appId, getToken])

  if (loading) return <p className="text-sm text-[var(--muted)]">Loading schema...</p>
  if (error) return <p className="text-sm text-[var(--error)]">Couldn't load schema. {error}</p>
  if (schemas.length === 0) {
    return <p className="text-sm text-[var(--muted)] italic">No tables found.</p>
  }

  return (
    <div className="space-y-4">
      <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
        CREATE TABLE statements ({schemas.length})
      </h4>
      {schemas.map((s) => (
        <div key={s.name} className="rounded-lg border border-[var(--line)] bg-[var(--paper)] overflow-hidden">
          <div className="px-3 py-2 border-b border-[var(--line)] bg-[var(--panel)]">
            <span className="text-sm font-semibold font-mono text-[var(--ink)]">{s.name}</span>
          </div>
          <pre className="px-3 py-2 text-xs font-mono text-[var(--ink)] whitespace-pre-wrap break-words overflow-x-auto">
            {s.sql}
          </pre>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared results table
// ---------------------------------------------------------------------------

function ResultsTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--line)] bg-[var(--panel)]">
            {columns.map((col) => (
              <th
                key={col}
                className="px-3 py-2 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--panel-hover)]"
            >
              {columns.map((col) => (
                <td
                  key={col}
                  className={`px-3 py-2 font-mono text-xs whitespace-nowrap max-w-[300px] truncate ${
                    row[col] === null || row[col] === undefined
                      ? 'text-[var(--muted)] italic'
                      : 'text-[var(--ink)]'
                  }`}
                  title={formatCellValue(row[col])}
                >
                  {formatCellValue(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
