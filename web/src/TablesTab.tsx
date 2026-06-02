import { useState, useEffect, useCallback } from 'react'
import type { QueryResult } from './dbBrowserTypes'
import { runQuery } from './dbBrowserApi'
import { ResultsTable } from './ResultsTable'

// ---------------------------------------------------------------------------
// Tables tab — table list + row browser
// ---------------------------------------------------------------------------

export function TablesTab({
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
