import { useState, useEffect } from 'react'

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
  const [expanded, setExpanded] = useState<string | null>(null)
  const [badgeError, setBadgeError] = useState(false)

  useEffect(() => {
    fetch(`https://${appId}.proappstore.online/.vcqa/report.json`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setReport(data as VcqaReport | null))
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

  const activeChecks = report.checks?.filter(c => c.score !== undefined && c.grade !== 'skip') ?? []
  const totalIssues = activeChecks.reduce((n, c) => n + (c.issues?.length ?? 0), 0)

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
        <div className="display-font text-4xl font-bold" style={{ color: gradeColor(report.grade) }}>
          {report.grade}
        </div>
        <div>
          <div className="text-2xl font-bold text-[var(--ink)]">{report.score}/100</div>
          <div className="text-xs text-[var(--muted)]">{activeChecks.length} checks · {totalIssues} issues</div>
        </div>
        {!badgeError && (
          <div className="ml-auto">
            <img
              src={`https://${appId}.proappstore.online/.vcqa/badge.svg`}
              alt={`vcqa ${report.grade} ${report.score}`}
              className="h-5"
              onError={() => setBadgeError(true)}
            />
          </div>
        )}
      </div>

      {activeChecks.length > 0 && (
        <div className="grid gap-0.5">
          {activeChecks.map(check => {
            const issues = check.issues ?? []
            const hasIssues = issues.length > 0
            const isOpen = expanded === check.name
            return (
              <div key={check.name}>
                <button
                  onClick={() => hasIssues && setExpanded(isOpen ? null : check.name)}
                  className="flex items-center gap-2 py-1.5 w-full text-left min-h-[36px]"
                  style={{ cursor: hasIssues ? 'pointer' : 'default', background: 'none', border: 'none', fontFamily: 'inherit', color: 'inherit' }}
                >
                  <span
                    className="inline-block w-6 text-center text-xs font-bold rounded flex-shrink-0"
                    style={{ color: gradeColor(check.grade), background: `color-mix(in srgb, ${gradeColor(check.grade)} 15%, transparent)` }}
                  >
                    {check.grade}
                  </span>
                  <span className="text-sm text-[var(--ink)] flex-1">{check.name}</span>
                  {hasIssues && (
                    <span className="text-xs text-[var(--muted)]">{issues.length} issue{issues.length > 1 ? 's' : ''}</span>
                  )}
                  <span className="text-xs text-[var(--muted)] font-mono w-6 text-right flex-shrink-0">{check.score}</span>
                  <div className="w-16 h-1.5 rounded bg-[var(--line)] overflow-hidden flex-shrink-0">
                    <div className="h-full rounded" style={{ width: `${check.score}%`, background: gradeColor(check.grade) }} />
                  </div>
                  {hasIssues && (
                    <span className="text-xs text-[var(--muted)] flex-shrink-0">{isOpen ? '▾' : '▸'}</span>
                  )}
                </button>
                {isOpen && issues.length > 0 && (
                  <div className="ml-8 mb-2 rounded-lg border border-[var(--line)] bg-[var(--paper)] overflow-hidden">
                    {issues.slice(0, 20).map((issue, i) => (
                      <div key={i} className="flex items-start gap-2 px-3 py-1.5 border-b border-[var(--line)] last:border-0 text-xs">
                        <span className={`flex-shrink-0 font-semibold ${issue.severity === 'error' ? 'text-[var(--error,#dc2626)]' : 'text-[var(--warning,#ca8a04)]'}`}>
                          {issue.severity === 'error' ? '!' : '~'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="text-[var(--ink)]">{issue.message}</span>
                          {issue.file && (
                            <span className="text-[var(--muted)] font-mono ml-1.5">
                              {issue.file.split('/').slice(-2).join('/')}{issue.line ? `:${issue.line}` : ''}
                            </span>
                          )}
                        </div>
                        {issue.rule && <span className="text-[var(--muted)] font-mono flex-shrink-0">{issue.rule}</span>}
                      </div>
                    ))}
                    {issues.length > 20 && (
                      <div className="px-3 py-1.5 text-xs text-[var(--muted)]">+{issues.length - 20} more issues</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
