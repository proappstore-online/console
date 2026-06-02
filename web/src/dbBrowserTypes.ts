// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
}

export type Tab = 'tables' | 'query' | 'schema'
