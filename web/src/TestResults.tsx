/**
 * Test results panel — shows test run history, per-spec trending, success
 * rates, and clickable spec files from the DO's test_runs/test_results tables.
 */
import { useState, useEffect, useCallback } from 'react'
import { api } from './agents/lib'
import { Collapsible } from './agents/components'
import { CodeView } from './CodeView'

interface TestRun {
  id: string; triggeredAt: number; source: string; commitSha: string | null
  status: string; passed: number; failed: number; skipped: number; flaky: number
  durationMs: number | null; coveragePct: number | null
}

interface SpecTrend { pass: number; fail: number; total: number; pct: number }

interface TestHistory {
  runs: TestRun[]
  specTrending: Record<string, SpecTrend>
  stats: { totalRuns: number; passedRuns: number; overallPct: number }
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

function fmtDuration(ms: number | null): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function TestResults({ appId, live = false, getToken }: { appId: string; live?: boolean; getToken?: () => string | null }) {
  const [history, setHistory] = useState<TestHistory | null>(null)
  const [specFiles, setSpecFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [previewFile, setPreviewFile] = useState<{ path: string; content: string } | null>(null)
  const [expandedRun, setExpandedRun] = useState<string | null>(null)
  const [runDetails, setRunDetails] = useState<Record<string, { specFile: string; testName: string; status: string; durationMs: number | null; error: string | null }[]>>({})
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const loadHistory = useCallback(async () => {
    const token = getToken?.()
    if (!token) return
    try {
      const d = await api(`/projects/${appId}/test-history`, token) as TestHistory
      setHistory(d)
    } catch { /* no history yet */ }
    setLoading(false)
  }, [appId, getToken])

  // Load spec files from working tree
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

  useEffect(() => { loadHistory() }, [loadHistory])
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => { if (!document.hidden) loadHistory() }, 15000)
    return () => clearInterval(id)
  }, [live, loadHistory])

  const triggerRun = async () => {
    const token = getToken?.()
    if (!token) return
    setRunning(true); setRunResult(null)
    try {
      const r = await api(`/projects/${appId}/run-tests`, token, { method: 'POST' }) as { ok?: boolean; error?: string; specs?: number }
      setRunResult(r.error ? { ok: false, msg: r.error } : { ok: true, msg: `Started (${r.specs} specs)` })
    } catch (e) { setRunResult({ ok: false, msg: (e as Error).message }) }
    setRunning(false)
  }

  const loadFile = async (path: string) => {
    const token = getToken?.()
    if (!token) return
    try {
      const r = await api(`/projects/${appId}/files/content?path=${encodeURIComponent(path)}`, token) as { content: string }
      setPreviewFile({ path, content: r.content })
    } catch { setPreviewFile({ path, content: '(could not load)' }) }
  }

  if (loading) return <p className="py-8 text-center text-sm text-[var(--muted)]">Loading test history...</p>

  const hasHistory = history && history.runs.length > 0
  const e2eSpecs = specFiles.filter(f => f.startsWith('e2e/'))
  const unitSpecs = specFiles.filter(f => f.startsWith('tests/'))

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      {hasHistory && (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold font-mono ${history.stats.overallPct >= 80 ? 'text-green-600' : history.stats.overallPct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {history.stats.overallPct}%
            </span>
            <span className="text-xs text-[var(--muted)]">pass rate ({history.stats.passedRuns}/{history.stats.totalRuns} runs)</span>
          </div>
          {history.runs[0]?.coveragePct != null && (
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold font-mono text-[var(--accent)]">{history.runs[0].coveragePct.toFixed(0)}%</span>
              <span className="text-xs text-[var(--muted)]">coverage</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            {runResult && <span className={`text-[10px] ${runResult.ok ? 'text-green-600' : 'text-[var(--error)]'}`}>{runResult.msg}</span>}
            <button type="button" onClick={triggerRun} disabled={running || e2eSpecs.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-1.5 text-xs font-semibold text-green-600 hover:bg-green-500/10 disabled:opacity-50 transition-colors">
              {running
                ? <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>}
              Run Tests
            </button>
            <button type="button" onClick={loadHistory} className="text-[10px] text-[var(--muted)] hover:text-[var(--ink)] px-1.5 py-0.5 rounded border border-[var(--line)]">Refresh</button>
          </div>
        </div>
      )}

      {/* Per-spec trending */}
      {hasHistory && Object.keys(history.specTrending).length > 0 && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h3 className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Spec health (last 20 runs)</h3>
          <div className="space-y-1">
            {Object.entries(history.specTrending).sort((a, b) => a[1].pct - b[1].pct).map(([spec, t]) => (
              <div key={spec} className="flex items-center gap-2 text-xs">
                <button type="button" onClick={() => loadFile(spec)} className="font-mono text-[var(--accent)] hover:underline truncate min-w-0 text-left" style={{ maxWidth: '200px' }}>
                  {spec.split('/').pop()}
                </button>
                <div className="flex-1 h-2 rounded-full bg-[var(--panel-hover)] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${t.pct}%`, background: t.pct >= 80 ? '#16a34a' : t.pct >= 50 ? '#ca8a04' : '#dc2626' }} />
                </div>
                <span className={`font-mono font-bold text-[10px] w-8 text-right ${t.pct >= 80 ? 'text-green-600' : t.pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{t.pct}%</span>
                <span className="text-[10px] text-[var(--muted)] w-14 text-right">{t.pass}/{t.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Run history */}
      {hasHistory && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h3 className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Run history ({history.runs.length})</h3>
          <div className="space-y-1">
            {history.runs.slice(0, 20).map(run => (
              <div key={run.id}>
                <button type="button" onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                  className="w-full text-left flex items-center gap-2 py-1 px-2 rounded hover:bg-[var(--panel-hover)] text-xs transition-colors">
                  <span className={`font-bold w-8 ${run.status === 'passed' ? 'text-green-600' : run.status === 'failed' ? 'text-red-600' : 'text-amber-600'}`}>
                    {run.status === 'passed' ? 'PASS' : run.status === 'failed' ? 'FAIL' : run.status.toUpperCase()}
                  </span>
                  <span className="text-[var(--muted)] font-mono">{fmtDuration(run.durationMs)}</span>
                  <span className="text-[var(--muted)]">{ago(run.triggeredAt)}</span>
                  <span className="text-[var(--muted)] ml-auto">{run.passed}✓ {run.failed > 0 ? `${run.failed}✗` : ''} {run.skipped > 0 ? `${run.skipped}⊘` : ''}</span>
                  {run.commitSha && <span className="font-mono text-[var(--muted)] opacity-50">{run.commitSha.slice(0, 7)}</span>}
                  <span className="text-[9px] text-[var(--muted)]">{run.source}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spec files list */}
      {specFiles.length > 0 && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide">Spec files ({specFiles.length})</h3>
            {!hasHistory && (
              <button type="button" onClick={triggerRun} disabled={running || e2eSpecs.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/5 px-2.5 py-1 text-[10px] font-semibold text-green-600 hover:bg-green-500/10 disabled:opacity-50">
                {running ? 'Running...' : 'Run Tests'}
              </button>
            )}
          </div>
          {e2eSpecs.length > 0 && (
            <div className="mb-2">
              <p className="text-[9px] text-[var(--muted)] uppercase tracking-wide mb-0.5">E2E (Playwright)</p>
              {e2eSpecs.map(f => (
                <button key={f} type="button" onClick={() => loadFile(f)}
                  className={`w-full text-left flex items-center gap-2 text-xs py-0.5 px-1.5 rounded hover:bg-[var(--panel-hover)] ${previewFile?.path === f ? 'bg-[var(--accent)]/5' : ''}`}>
                  <span className="text-purple-500">▸</span>
                  <span className="font-mono text-[var(--ink)] truncate">{f.replace('e2e/specs/', '')}</span>
                  {history?.specTrending[f] && (
                    <span className={`ml-auto text-[9px] font-mono ${history.specTrending[f].pct >= 80 ? 'text-green-600' : 'text-red-600'}`}>{history.specTrending[f].pct}%</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {unitSpecs.length > 0 && (
            <div>
              <p className="text-[9px] text-[var(--muted)] uppercase tracking-wide mb-0.5">Unit / Integration (vitest)</p>
              {unitSpecs.map(f => (
                <button key={f} type="button" onClick={() => loadFile(f)}
                  className={`w-full text-left flex items-center gap-2 text-xs py-0.5 px-1.5 rounded hover:bg-[var(--panel-hover)] ${previewFile?.path === f ? 'bg-[var(--accent)]/5' : ''}`}>
                  <span className="text-green-500">▸</span>
                  <span className="font-mono text-[var(--ink)] truncate">{f.replace('tests/', '')}</span>
                  {history?.specTrending[f] && (
                    <span className={`ml-auto text-[9px] font-mono ${history.specTrending[f].pct >= 80 ? 'text-green-600' : 'text-red-600'}`}>{history.specTrending[f].pct}%</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!hasHistory && specFiles.length === 0 && (
        <div className="py-8 text-center space-y-2">
          <p className="text-sm font-semibold text-[var(--ink)]">No test specs yet</p>
          <p className="text-xs text-[var(--muted)]">Ask the QA agent in the chat to generate Playwright or vitest specs.</p>
        </div>
      )}

      {/* File preview */}
      {previewFile && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-[var(--panel-hover)] border-b border-[var(--line)]">
            <span className="text-xs font-mono text-[var(--ink)] truncate">{previewFile.path}</span>
            <button type="button" onClick={() => setPreviewFile(null)} className="text-xs text-[var(--muted)] hover:text-[var(--ink)]">Close</button>
          </div>
          <Collapsible maxH={400}>
            <CodeView code={previewFile.content} path={previewFile.path} />
          </Collapsible>
        </div>
      )}
    </div>
  )
}
