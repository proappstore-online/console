import type { QueryResult } from './dbBrowserTypes'

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

export function dataUrl(appId: string, path: string): string {
  return `https://data-${appId}.proappstore.online${path}`
}

export async function fetchTables(token: string, appId: string): Promise<string[]> {
  const res = await fetch(dataUrl(appId, '/tables'), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Failed to load tables (${res.status})`)
  const data = await res.json() as unknown
  const tables = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.tables)
      ? data.tables
      : null
  if (!tables) throw new Error('Tables response was not an array')
  return tables.filter((name): name is string => typeof name === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export async function runQuery(
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

export async function runExecute(
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
