import { useState, useEffect, useCallback } from 'react'

/**
 * Live end-to-end test results for the Test tab. The QA agent's Playwright specs
 * run against the live app on every deploy; the CI e2e job publishes a summary to
 * kb.proappstore.online/<app>/.e2e/summary.json (via R2), which this fetches +
 * renders. Mirrors CodeHealth (Control tab) for VCQA.
 */

interface SpecResult { title: string; ok: boolean }
interface E2ESummary {
  ranAt?: string
  passed: number
  failed: number
  flaky: number
  skipped: number
  ok: boolean
  specs: SpecResult[]
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function TestResults({ appId, live = false }: { appId: string; live?: boolean }) {
  const [data, setData] = useState<E2ESummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const r = await fetch(`https://kb.proappstore.online/${appId}/.e2e/summary.json?t=${Date.now()}`, { cache: 'no-store' })
      const d = r.ok ? (await r.json()) as E2ESummary : null
      if (d) setData(d)
      setFetchedAt(Date.now())
    } catch { /* keep last good */ }
    setRefreshing(false)
    setLoading(false)
  }, [appId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => { if (!document.hidden) load() }, 20000)
    const onVisible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [live, load])

  if (loading) return <p className="py-12 text-center text-sm text-[var(--muted)]">Loading test results…</p>

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-3">
        <span className="text-4xl">🧪</span>
        <h2 className="display-font text-xl font-bold text-[var(--ink)]">No test runs yet</h2>
        <p className="text-sm text-[var(--muted)] max-w-lg mx-auto">
          The QA agent writes Playwright end-to-end tests that run against the live app on every
          deploy. Results appear here after the next deploy.
        </p>
        <button type="button" onClick={load} disabled={refreshing}
          className="mt-1 text-xs text-[var(--muted)] hover:text-[var(--ink)] px-2 py-1 rounded border border-[var(--line)] hover:border-[var(--accent)] disabled:opacity-50">
          {refreshing ? 'Checking…' : 'Refresh'}
        </button>
      </div>
    )
  }

  const total = data.passed + data.failed + data.skipped + data.flaky
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide">End-to-end tests</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted)]">
            via Playwright{data.ranAt && ` · ran ${ago(new Date(data.ranAt).getTime())}`}
            {fetchedAt && ` · checked ${ago(fetchedAt)}`}
          </span>
          <button type="button" onClick={load} disabled={refreshing}
            className="text-[11px] text-[var(--muted)] hover:text-[var(--ink)] px-2 py-0.5 rounded border border-[var(--line)] hover:border-[var(--accent)] disabled:opacity-50">
            {refreshing ? 'Checking…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="display-font text-3xl font-bold" style={{ color: data.ok ? 'var(--success, #16a34a)' : 'var(--error, #dc2626)' }}>
          {data.ok ? 'PASS' : 'FAIL'}
        </div>
        <div className="text-sm text-[var(--ink)] flex flex-wrap gap-x-4 gap-y-0.5">
          <span className="text-[var(--success,#16a34a)] font-semibold">{data.passed} passed</span>
          {data.failed > 0 && <span className="text-[var(--error,#dc2626)] font-semibold">{data.failed} failed</span>}
          {data.flaky > 0 && <span className="text-[var(--warning,#ca8a04)]">{data.flaky} flaky</span>}
          {data.skipped > 0 && <span className="text-[var(--muted)]">{data.skipped} skipped</span>}
          <span className="text-[var(--muted)]">· {total} total</span>
        </div>
      </div>

      <div className="grid gap-0.5">
        {data.specs.map((s, i) => (
          <div key={i} className="flex items-start gap-2 py-1 text-sm">
            <span className={`flex-shrink-0 font-bold ${s.ok ? 'text-[var(--success,#16a34a)]' : 'text-[var(--error,#dc2626)]'}`}>
              {s.ok ? '✓' : '✗'}
            </span>
            <span className={s.ok ? 'text-[var(--ink)]' : 'text-[var(--error,#dc2626)] font-medium'}>{s.title}</span>
          </div>
        ))}
        {data.specs.length === 0 && (
          <p className="text-sm text-[var(--muted)]">Run recorded, but no individual specs were reported.</p>
        )}
      </div>
    </div>
  )
}
