import { useState, useEffect } from 'react'

interface QualityCheck {
  name: string
  score: number
  grade: string
  issues: { severity: string; message: string }[]
}

interface QualityReport {
  score: number
  grade: string
  totalIssues: number
  checks: QualityCheck[]
  timestamp: string
}

interface Props {
  appId: string
}

const GRADE_COLORS: Record<string, string> = {
  A: 'text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10',
  B: 'text-[var(--accent)] border-[var(--accent)]/30 bg-[var(--accent-soft)]',
  C: 'text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10',
  D: 'text-[var(--error)] border-[var(--error)]/30 bg-[var(--error)]/10',
  F: 'text-[var(--error)] border-[var(--error)]/30 bg-[var(--error)]/10',
}

export function CodeHealth({ appId }: Props) {
  const [report, setReport] = useState<QualityReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`https://${appId}.proappstore.online/.vcqa/report.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled) setReport(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [appId])

  if (loading) {
    return (
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
        <h3 className="display-font text-lg font-bold text-[var(--ink)] mb-1">Code Health</h3>
        <p className="text-sm text-[var(--muted)]">Loading...</p>
      </section>
    )
  }

  if (!report) {
    return (
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
        <h3 className="display-font text-lg font-bold text-[var(--ink)] mb-1">Code Health</h3>
        <p className="text-sm text-[var(--muted)] italic">
          No quality report yet. Deploy the app to generate one.
        </p>
      </section>
    )
  }

  const activeChecks = report.checks.filter(
    (c) => c.score !== null && c.score !== undefined && c.grade !== undefined,
  )

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="display-font text-lg font-bold text-[var(--ink)] mb-0.5">Code Health</h3>
          <p className="text-sm text-[var(--muted)]">
            Powered by <a href="https://vibecodeqa.online" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">vcqa</a>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-[var(--ink)]">{report.score}/100</span>
          <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full border-2 text-lg font-bold ${GRADE_COLORS[report.grade] ?? ''}`}>
            {report.grade}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm text-[var(--muted)] mb-4">
        <span>{report.totalIssues} issues</span>
        <span>{activeChecks.length} checks</span>
        {report.timestamp && (
          <span>Scanned {new Date(report.timestamp).toLocaleDateString()}</span>
        )}
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="text-sm font-semibold text-[var(--accent)] hover:underline"
      >
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {expanded && (
        <div className="mt-4 space-y-1.5">
          {activeChecks.map((c) => (
            <div
              key={c.name}
              className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2"
            >
              <span className="text-sm text-[var(--ink)] capitalize">{c.name.replace(/-/g, ' ')}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--muted)]">{c.score}/100</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${GRADE_COLORS[c.grade] ?? 'text-[var(--muted)]'}`}>
                  {c.grade}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
