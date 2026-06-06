import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from './agents/lib'

interface VcqaIssue {
  severity: string
  message: string
  file?: string
  line?: number
  rule?: string
}

interface VcqaCheck {
  name: string
  score: number
  grade: string
  issues?: VcqaIssue[]
}

interface VcqaReport {
  score: number
  grade: string
  version: string
  timestamp: string
  checks: VcqaCheck[]
}

interface Props {
  appId: string
  live?: boolean
  /** Token getter for creating fix tickets via the agent-teams API. */
  getToken?: () => string | null
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

const gradeColor = (g: string) =>
  g === 'A' || g === 'B' ? 'var(--success, #16a34a)' : g === 'C' ? 'var(--warning, #ca8a04)' : 'var(--error, #dc2626)'

const gradeBg = (g: string) =>
  g === 'A' || g === 'B' ? 'bg-green-100 dark:bg-green-900/30' : g === 'C' ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-red-100 dark:bg-red-900/30'

/** Generate a fix prompt for a VCQA issue. */
function fixPrompt(check: string, issue: VcqaIssue): string {
  const location = issue.file ? ` in ${issue.file}${issue.line ? `:${issue.line}` : ''}` : ''
  return `Fix VCQA ${check} issue${location}: ${issue.message}${issue.rule ? ` (rule: ${issue.rule})` : ''}`
}

/** Generate a bulk fix prompt for all issues in a check. */
function bulkFixPrompt(check: VcqaCheck): string {
  const count = check.issues?.length ?? 0
  const examples = (check.issues ?? []).slice(0, 3).map(i =>
    `- ${i.message}${i.file ? ` (${i.file.split('/').pop()})` : ''}`
  ).join('\n')
  return `Fix all ${count} VCQA "${check.name}" issues to improve the score from ${check.score}/100.\n\nExamples:\n${examples}${count > 3 ? `\n- ...and ${count - 3} more` : ''}`
}

export function CodeHealth({ appId, live = false, getToken }: Props) {
  const [report, setReport] = useState<VcqaReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [badgeError, setBadgeError] = useState(false)
  const [fixing, setFixing] = useState<string | null>(null) // check name being fixed
  const [fixResult, setFixResult] = useState<{ type: 'ok' | 'error'; msg: string; link?: string } | null>(null)
  // Filter: show all checks or only failing ones
  const [filter, setFilter] = useState<'all' | 'failing'>('failing')

  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setRefreshing(true)
    setLoadError(null)
    try {
      const url = `https://${appId}.proappstore.online/.vcqa/report.json?t=${Date.now()}`
      const r = await fetch(url, { cache: 'no-store' })
      if (!r.ok) { setLoadError(`HTTP ${r.status}`); setFetchedAt(Date.now()); setRefreshing(false); setLoading(false); return }
      const text = await r.text()
      // Guard against SPA fallback (host worker returning index.html for missing files)
      if (text.startsWith('<!') || text.startsWith('<html')) { setLoadError('Report not found (got HTML fallback)'); setFetchedAt(Date.now()); setRefreshing(false); setLoading(false); return }
      const data = JSON.parse(text) as VcqaReport
      setReport(data); setBadgeError(false)
      setFetchedAt(Date.now())
    } catch (e) { setLoadError(e instanceof Error ? e.message : 'fetch failed') }
    setRefreshing(false)
    setLoading(false)
  }, [appId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => { if (!document.hidden) load() }, 15000)
    const onVisible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [live, load])

  /** Send a fix to PO chat and show linked result. */
  const sendFix = async (message: string, label: string) => {
    const token = getToken?.()
    if (!token) { setFixResult({ type: 'error', msg: 'Not signed in' }); return }
    setFixResult(null)
    try {
      const r = await api(`/projects/${appId}/chat`, token, {
        method: 'POST',
        body: { message, thread: 'build' },
      }) as { body?: string }
      // Extract ticket number from PO response (e.g. "created ticket #7")
      const match = r.body?.match(/#(\d+)/);
      if (match) {
        setFixResult({ type: 'ok', msg: `Ticket #${match[1]} created`, link: `#/apps/${appId}/build` })
      } else {
        setFixResult({ type: 'ok', msg: `${label} sent to PO` })
      }
      setTimeout(() => setFixResult(null), 8000)
    } catch (e) {
      setFixResult({ type: 'error', msg: (e as Error).message })
    }
  }

  const createFixTicket = async (check: VcqaCheck) => {
    setFixing(check.name)
    await sendFix(bulkFixPrompt(check), `Fix all "${check.name}"`)
    setFixing(null)
  }

  const fixSingleIssue = async (check: string, issue: VcqaIssue) => {
    await sendFix(fixPrompt(check, issue), 'Fix')
  }

  if (loading) return live
    ? <p className="py-12 text-center text-sm text-[var(--muted)]">Loading code health…</p>
    : null

  if (!report) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Code Health</h3>
        <p className="text-sm text-[var(--muted)]">
          No scan data yet. Code health runs automatically on each deploy{live ? ' — checking every 15s.' : '.'}
        </p>
        {loadError && <p className="text-xs text-[var(--error)] mt-1">{loadError}</p>}
        {live && (
          <button type="button" onClick={load} disabled={refreshing}
            className="mt-3 text-[11px] text-[var(--muted)] hover:text-[var(--ink)] px-2 py-0.5 rounded border border-[var(--line)] hover:border-[var(--accent)] disabled:opacity-50">
            {refreshing ? 'Checking…' : 'Refresh'}
          </button>
        )}
      </div>
    )
  }

  const activeChecks = report.checks?.filter(c => c.score !== undefined && c.grade !== 'skip') ?? []
  const failingChecks = activeChecks.filter(c => c.score < 70)
  const passingChecks = activeChecks.filter(c => c.score >= 70)
  const totalIssues = activeChecks.reduce((n, c) => n + (c.issues?.length ?? 0), 0)
  const displayChecks = filter === 'failing' ? failingChecks : activeChecks

  return (
    <div className="space-y-4">
      {/* Score header */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="display-font text-5xl font-bold" style={{ color: gradeColor(report.grade) }}>
              {report.grade}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold text-[var(--ink)]">{report.score}/100</span>
                <VcqaInfo />
              </div>
              <div className="text-xs text-[var(--muted)]">
                {activeChecks.length} checks · {totalIssues} issues · {failingChecks.length} failing
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!badgeError && (
              <img src={`https://${appId}.proappstore.online/.vcqa/badge.svg`} alt="" className="h-5"
                onError={() => setBadgeError(true)} />
            )}
            <span className="text-xs text-[var(--muted)]">
              {report.timestamp && `${new Date(report.timestamp).toLocaleDateString()}`}
              {live && fetchedAt && ` · ${ago(fetchedAt)}`}
            </span>
            {live && (
              <button type="button" onClick={load} disabled={refreshing}
                className="flex items-center gap-1 text-[11px] text-[var(--muted)] hover:text-[var(--ink)] px-2 py-0.5 rounded border border-[var(--line)] hover:border-[var(--accent)] disabled:opacity-50">
                {refreshing ? 'Checking…' : 'Refresh'}
              </button>
            )}
          </div>
        </div>

        {/* Quick stats bar */}
        <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-[var(--line)]">
          {activeChecks.sort((a, b) => a.score - b.score).map(c => (
            <div key={c.name} className="h-full transition-all" title={`${c.name}: ${c.score}/100`}
              style={{ width: `${100 / activeChecks.length}%`, background: gradeColor(c.grade), opacity: c.score < 50 ? 1 : 0.6 }} />
          ))}
        </div>
      </div>

      {/* Fix result banner */}
      {fixResult && (
        <div className={`rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 ${fixResult.type === 'ok' ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--error)]/10 text-[var(--error)]'}`}>
          {fixResult.msg}
          {fixResult.link && (
            <a href={fixResult.link} className="underline font-bold hover:opacity-80">Open in Build →</a>
          )}
        </div>
      )}

      {/* Filter toggle */}
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-[var(--line-strong)] overflow-hidden">
          <button type="button" onClick={() => setFilter('failing')}
            className={`px-3 py-1 text-xs font-semibold transition-colors ${filter === 'failing' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}>
            Failing ({failingChecks.length})
          </button>
          <button type="button" onClick={() => setFilter('all')}
            className={`px-3 py-1 text-xs font-semibold transition-colors ${filter === 'all' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}>
            All ({activeChecks.length})
          </button>
        </div>
        {failingChecks.length > 0 && getToken && (
          <span className="text-xs text-[var(--muted)]">Click "Fix" to send the issues to the Dev agent</span>
        )}
      </div>

      {/* Check list */}
      <div className="space-y-2">
        {displayChecks.map(check => {
          const issues = check.issues ?? []
          const hasIssues = issues.length > 0
          const isOpen = expanded === check.name
          return (
            <div key={check.name} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
              <button type="button"
                onClick={() => hasIssues && setExpanded(isOpen ? null : check.name)}
                className="flex items-center gap-2 px-4 py-2.5 w-full text-left"
                style={{ cursor: hasIssues ? 'pointer' : 'default' }}>
                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold flex-shrink-0 ${gradeBg(check.grade)}`}
                  style={{ color: gradeColor(check.grade) }}>
                  {check.grade}
                </span>
                <span className="text-sm font-medium text-[var(--ink)] flex-1">{check.name}</span>
                {hasIssues && (
                  <span className="text-xs text-[var(--muted)] bg-[var(--panel-hover)] px-1.5 py-0.5 rounded">
                    {issues.length}
                  </span>
                )}
                <div className="w-20 h-2 rounded-full bg-[var(--line)] overflow-hidden flex-shrink-0">
                  <div className="h-full rounded-full transition-all" style={{ width: `${check.score}%`, background: gradeColor(check.grade) }} />
                </div>
                <span className="text-xs text-[var(--muted)] font-mono w-8 text-right flex-shrink-0">{check.score}</span>
                {hasIssues && (
                  <span className="text-xs text-[var(--muted)] flex-shrink-0">{isOpen ? '▾' : '▸'}</span>
                )}
              </button>

              {isOpen && issues.length > 0 && (
                <div className="border-t border-[var(--line)]">
                  {/* Fix all button */}
                  {getToken && check.score < 70 && (
                    <div className="px-4 py-2 bg-[var(--panel-hover)] flex items-center justify-between">
                      <span className="text-xs text-[var(--muted)]">
                        {issues.length} issue{issues.length > 1 ? 's' : ''} dragging this score down
                      </span>
                      <button type="button" onClick={() => createFixTicket(check)} disabled={fixing === check.name}
                        className="rounded-lg bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                        {fixing === check.name ? 'Sending…' : `Fix all ${check.name} issues`}
                      </button>
                    </div>
                  )}
                  {issues.slice(0, 30).map((issue, idx) => (
                    <div key={`${issue.rule}-${issue.file}-${idx}`}
                      className="flex items-start gap-2 px-4 py-2 border-b border-[var(--line)] last:border-0 text-xs group">
                      <span className={`flex-shrink-0 font-bold mt-0.5 ${issue.severity === 'error' ? 'text-[var(--error)]' : 'text-[var(--warning)]'}`}>
                        {issue.severity === 'error' ? '✗' : '~'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-[var(--ink)]">{issue.message}</span>
                        {issue.file && (
                          <span className="text-[var(--muted)] font-mono ml-1.5 text-[10px]">
                            {issue.file.split('/').slice(-2).join('/')}{issue.line ? `:${issue.line}` : ''}
                          </span>
                        )}
                      </div>
                      {issue.rule && <span className="text-[var(--muted)] font-mono flex-shrink-0 text-[10px]">{issue.rule}</span>}
                      {getToken && (
                        <button type="button" onClick={() => fixSingleIssue(check.name, issue)}
                          className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-[10px] font-semibold text-[var(--accent)] hover:underline transition-opacity"
                          title="Send this issue to the Dev agent to fix">
                          Fix
                        </button>
                      )}
                    </div>
                  ))}
                  {issues.length > 30 && (
                    <div className="px-4 py-2 text-xs text-[var(--muted)]">+{issues.length - 30} more</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Passing checks summary (when filtering to failing only) */}
      {filter === 'failing' && passingChecks.length > 0 && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-xs text-[var(--muted)] mb-2">{passingChecks.length} checks passing</p>
          <div className="flex flex-wrap gap-1.5">
            {passingChecks.map(c => (
              <span key={c.name} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                {c.name} {c.score}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function VcqaInfo() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-label="What is VCQA?"
        className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors text-[10px] font-bold">
        i
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-xl border border-[var(--line)] bg-[var(--paper)] shadow-xl p-4 text-xs text-[var(--ink)] space-y-2">
          <p className="font-semibold text-sm">Code Health (VCQA)</p>
          <p className="text-[var(--muted)]">Automated code quality scan powered by <a href="https://vibecodeqa.online" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] font-semibold hover:underline">VibeCodeQA</a>. Runs on every deploy.</p>
          <p className="text-[var(--muted)]">Checks {'>'}20 dimensions: types, security, complexity, accessibility, testing, architecture, performance, and more.</p>
          <div className="border-t border-[var(--line)] pt-2 space-y-1">
            <p className="font-semibold">How to use</p>
            <p className="text-[var(--muted)]">Click <strong>Fix</strong> on any issue to send it to the PO, which creates a ticket for the Dev agent. Click <strong>Fix all</strong> on a check to fix all issues at once.</p>
            <p className="text-[var(--muted)]">Scores update after each deploy. A grade of B+ (80+) is production-ready.</p>
          </div>
          <a href="https://vibecodeqa.online" target="_blank" rel="noopener noreferrer"
            className="block text-center text-[var(--accent)] font-semibold hover:underline text-[11px] pt-1">
            vibecodeqa.online →
          </a>
        </div>
      )}
    </div>
  )
}
