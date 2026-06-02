import { useState, useRef } from 'react'
import type { QueryResult } from './dbBrowserTypes'
import { runQuery, runExecute } from './dbBrowserApi'
import { isDangerous, isSelectLike } from './dbBrowserHelpers'
import { ResultsTable } from './ResultsTable'

// ---------------------------------------------------------------------------
// SQL Query tab
// ---------------------------------------------------------------------------

export function QueryTab({
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
