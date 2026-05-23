import { useState, useEffect } from 'react'

interface VcqaCheck {
  name: string
  score: number
  grade: string
}

interface VcqaReport {
  score: number
  grade: string
  totalIssues: number
  checks: VcqaCheck[]
  timestamp: string
}

interface Props {
  appId: string
}

const gradeColor = (g: string) => {
  if (g === 'A') return 'var(--success, #16a34a)'
  if (g === 'B') return 'var(--success, #16a34a)'
  if (g === 'C') return 'var(--warning, #ca8a04)'
  return 'var(--error, #dc2626)'
}

export function CodeHealth({ appId }: Props) {
  const [report, setReport] = useState<VcqaReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`https://${appId}.proappstore.online/.vcqa/report.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setReport(data as VcqaReport | null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [appId])

  if (loading) return null
  if (!report) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Code Health</h3>
        <p className="text-sm text-[var(--muted)]">No scan data yet. Code health runs automatically on each deploy.</p>
      </div>
    )
  }

  const activeChecks = report.checks?.filter((c) => c.score !== undefined && c.grade !== 'skip') ?? []

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide">Code Health</h3>
        <span className="text-xs text-[var(--muted)]">
          via <a href="https://vibecodeqa.online" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)]">vcqa</a>
          {report.timestamp && ` · ${new Date(report.timestamp).toLocaleDateString()}`}
        </span>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div
          className="display-font text-4xl font-bold"
          style={{ color: gradeColor(report.grade) }}
        >
          {report.grade}
        </div>
        <div>
          <div className="text-2xl font-bold text-[var(--ink)]">{report.score}/100</div>
          <div className="text-xs text-[var(--muted)]">{activeChecks.length} checks passed</div>
        </div>
        <div className="ml-auto">
          <img
            src={`https://${appId}.proappstore.online/.vcqa/badge.svg`}
            alt={`vcqa ${report.grade} ${report.score}`}
            className="h-5"
          />
        </div>
      </div>

      {activeChecks.length > 0 && (
        <div className="grid gap-1.5">
          {activeChecks.map((check) => (
            <div key={check.name} className="flex items-center gap-2 py-1">
              <span
                className="inline-block w-6 text-center text-xs font-bold rounded"
                style={{
                  color: gradeColor(check.grade),
                  background: `color-mix(in srgb, ${gradeColor(check.grade)} 15%, transparent)`,
                }}
              >
                {check.grade}
              </span>
              <span className="text-sm text-[var(--ink)] flex-1">{check.name}</span>
              <span className="text-xs text-[var(--muted)] font-mono">{check.score}</span>
              <div className="w-16 h-1.5 rounded bg-[var(--line)] overflow-hidden">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${check.score}%`,
                    background: gradeColor(check.grade),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
