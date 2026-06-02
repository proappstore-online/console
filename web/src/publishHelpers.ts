// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
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

export function validateAppId(value: string): string | null {
  if (!value) return 'App id is required.'
  if (value.length > 58) return 'Max 58 characters.'
  if (!/^[a-z0-9-]+$/.test(value)) return 'Lowercase letters, digits, and hyphens only.'
  if (value.startsWith('-') || value.endsWith('-')) return 'Cannot start or end with a hyphen.'
  return null
}
