// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function relativeTime(iso: string | number): string {
  const then = typeof iso === 'number' ? iso : new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const seconds = Math.round(diffMs / 1000)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const abs = Math.abs(seconds)
  if (abs < 60) return rtf.format(-seconds, 'second')
  const minutes = Math.round(seconds / 60)
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour')
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 30) return rtf.format(-days, 'day')
  const months = Math.round(days / 30)
  if (Math.abs(months) < 12) return rtf.format(-months, 'month')
  const years = Math.round(days / 365)
  return rtf.format(-years, 'year')
}

export function shortId(id: string): string {
  // Submission IDs are UUIDv4 — show first 8 chars as a hash-like label.
  return id.length > 8 ? id.slice(0, 8) : id
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1).trimEnd() + '…'
}
