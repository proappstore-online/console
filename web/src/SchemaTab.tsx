import { useState, useEffect } from 'react'
import { runQuery } from './dbBrowserApi'

// ---------------------------------------------------------------------------
// Schema tab
// ---------------------------------------------------------------------------

export function SchemaTab({
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
