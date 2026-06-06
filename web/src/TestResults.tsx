import { useState, useEffect, useCallback } from 'react'
import { api } from './agents/lib'
import { Collapsible } from './agents/components'

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

export function TestResults({ appId, live = false, getToken }: { appId: string; live?: boolean; getToken?: () => string | null }) {
  const [data, setData] = useState<E2ESummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [specFiles, setSpecFiles] = useState<string[]>([])

  // Load spec files from the working tree
  useEffect(() => {
    const token = getToken?.()
    if (!token) return
    api(`/projects/${appId}/files`, token).then((d: any) => {
      const specs = ((d?.files as { path: string }[]) ?? [])
        .filter(f => f.path.startsWith('e2e/specs/') || f.path.startsWith('tests/'))
        .map(f => f.path)
      setSpecFiles(specs)
    }).catch(() => {})
  }, [appId, getToken])

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
      <div className="space-y-4">
        <SpecFilesList appId={appId} specFiles={specFiles} getToken={getToken} />
        {specFiles.length === 0 && (
          <div className="max-w-2xl mx-auto py-8 text-center space-y-3">
            <h2 className="display-font text-lg font-bold text-[var(--ink)]">No test specs yet</h2>
            <p className="text-sm text-[var(--muted)] max-w-lg mx-auto">
              Ask the QA agent in the chat above to generate Playwright specs. They'll be saved to e2e/specs/ and run on deploy.
            </p>
          </div>
        )}
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
        {data.specs.map((s) => (
          <div key={s.title} className="flex items-start gap-2 py-1 text-sm">
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

/** Clickable spec file list with Run Tests button and file preview. */
function SpecFilesList({ appId, specFiles, getToken }: { appId: string; specFiles: string[]; getToken?: () => string | null }) {
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [previewFile, setPreviewFile] = useState<{ path: string; content: string } | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  if (specFiles.length === 0) return null

  const triggerRun = async () => {
    const token = getToken?.()
    if (!token) return
    setRunning(true)
    setRunResult(null)
    try {
      const r = await api(`/projects/${appId}/run-tests`, token, { method: 'POST' }) as { ok?: boolean; error?: string; specs?: number; runUrl?: string }
      if (r.error) setRunResult({ ok: false, msg: r.error })
      else setRunResult({ ok: true, msg: `Test run started (${r.specs} specs)${r.runUrl ? ` — ${r.runUrl}` : ''}` })
    } catch (e) { setRunResult({ ok: false, msg: (e as Error).message }) }
    setRunning(false)
  }

  const loadFile = async (path: string) => {
    const token = getToken?.()
    if (!token) return
    setLoadingPreview(true)
    try {
      const r = await api(`/projects/${appId}/files/content?path=${encodeURIComponent(path)}`, token) as { content: string }
      setPreviewFile({ path, content: r.content })
    } catch { setPreviewFile({ path, content: '(could not load file)' }) }
    setLoadingPreview(false)
  }

  const e2eSpecs = specFiles.filter(f => f.startsWith('e2e/'))
  const unitTests = specFiles.filter(f => f.startsWith('tests/'))

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide">
          Test specs ({specFiles.length})
        </h3>
        <div className="flex items-center gap-2">
          {runResult && (
            <span className={`text-[10px] ${runResult.ok ? 'text-green-600' : 'text-[var(--error)]'}`}>
              {runResult.msg.slice(0, 80)}
            </span>
          )}
          <button type="button" onClick={triggerRun} disabled={running || e2eSpecs.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-1.5 text-xs font-semibold text-green-600 hover:bg-green-500/10 disabled:opacity-50 transition-colors"
            title={e2eSpecs.length === 0 ? 'No e2e specs to run — generate them first' : `Run ${e2eSpecs.length} Playwright spec(s) against the live app`}>
            {running ? (
              <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>
            )}
            {running ? 'Running...' : 'Run Tests'}
          </button>
        </div>
      </div>

      {/* E2E specs */}
      {e2eSpecs.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">E2E (Playwright)</p>
          <div className="space-y-0.5">
            {e2eSpecs.map(f => (
              <button key={f} type="button" onClick={() => loadFile(f)}
                className={`w-full text-left flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-[var(--panel-hover)] transition-colors ${previewFile?.path === f ? 'bg-[var(--accent)]/5 border border-[var(--accent)]/20' : ''}`}>
                <span className="text-purple-500 flex-shrink-0">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9l6 6M15 9l-6 6"/></svg>
                </span>
                <span className="font-mono text-[var(--ink)] truncate">{f.replace('e2e/specs/', '')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Unit/integration tests */}
      {unitTests.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">Unit / Integration (vitest)</p>
          <div className="space-y-0.5">
            {unitTests.map(f => (
              <button key={f} type="button" onClick={() => loadFile(f)}
                className={`w-full text-left flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-[var(--panel-hover)] transition-colors ${previewFile?.path === f ? 'bg-[var(--accent)]/5 border border-[var(--accent)]/20' : ''}`}>
                <span className="text-green-500 flex-shrink-0">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </span>
                <span className="font-mono text-[var(--ink)] truncate">{f.replace('tests/', '')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* File preview */}
      {loadingPreview && <p className="text-xs text-[var(--muted)]">Loading...</p>}
      {previewFile && !loadingPreview && (
        <div className="border border-[var(--line)] rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--panel-hover)] border-b border-[var(--line)]">
            <span className="text-[11px] font-mono text-[var(--ink)] truncate">{previewFile.path}</span>
            <button type="button" onClick={() => setPreviewFile(null)} className="text-[var(--muted)] hover:text-[var(--ink)] text-xs">Close</button>
          </div>
          <Collapsible maxH={300}>
            <pre className="text-[11px] font-mono p-3 overflow-x-auto text-[var(--ink)] whitespace-pre-wrap">{previewFile.content}</pre>
          </Collapsible>
        </div>
      )}
    </div>
  )
}
