// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DANGEROUS_RE = /^\s*(DELETE|DROP|ALTER|TRUNCATE)\b/i

export function isDangerous(sql: string): boolean {
  return DANGEROUS_RE.test(sql.trim())
}

export function isSelectLike(sql: string): boolean {
  return /^\s*(SELECT|PRAGMA|EXPLAIN)\b/i.test(sql.trim())
}

export function formatCellValue(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
