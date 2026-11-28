import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from './agents/lib'
import { ROLE_COLOR } from './agents/types'
import { ResponsiveTable } from './ResponsiveTable'

interface RoleBreakdown {
  role: string
  total: number
  tokensIn: number
  tokensOut: number
}

interface TicketBreakdown {
  ticketId: string
  title: string
  total: number
  byRole: RoleBreakdown[]
}

interface LedgerEntry {
  ticketId: string
  role: string
  costUsd: number
  tokensIn: number
  tokensOut: number
  model: string
  createdAt: number
}

interface CostDetail {
  totalUsd: number
  byRole: RoleBreakdown[]
  byTicket: TicketBreakdown[]
  ledger: LedgerEntry[]
}

export function AppSpending({ appId, getToken }: { appId: string; getToken: () => string | null }) {
  const [data, setData] = useState<CostDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const d = await api(`/projects/${appId}/cost/detail`, token) as CostDetail
      // Normalize: a partial/empty response ({} for a new project) would
      // white-screen the render, which reads byTicket/byRole/ledger/totalUsd.
      setData({ totalUsd: 0, byRole: [], byTicket: [], ledger: [], ...(d as Partial<CostDetail>) })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cost data')
    } finally {
      setLoading(false)
    }
  }, [appId, getToken])

  useEffect(() => { load() }, [load])

  if (loading) return <p className="text-[var(--muted)] py-12 text-center">Loading spending data...</p>
  if (error) return <p className="text-[var(--error)] py-12 text-center">{error}</p>
  if (!data) return <p className="text-[var(--muted)] py-12 text-center">No spending data yet.</p>

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const fmtTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
  const fmtTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
  }

  const maxTicketCost = Math.max(...data.byTicket.map(t => t.total), 0.001)

  return (
    <div className="max-w-4xl space-y-4">
      {/* Header: total project cost */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl font-bold text-[var(--ink)] font-mono">${data.totalUsd.toFixed(2)}</span>
          <span className="text-sm text-[var(--muted)]">total project spend</span>
          <PricingInfo />
        </div>

        {/* By-role summary bar */}
        {data.byRole.length > 0 && (
          <div className="space-y-2">
            <div className="flex h-3 rounded-full overflow-hidden bg-[var(--panel-hover)]">
              {data.byRole.map(r => (
                <div key={r.role} title={`${r.role}: $${r.total.toFixed(4)}`}
                  style={{ width: `${(r.total / data.totalUsd) * 100}%`, background: ROLE_COLOR[r.role] ?? 'var(--accent)', minWidth: r.total > 0 ? '4px' : 0 }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {data.byRole.map(r => (
                <div key={r.role} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: ROLE_COLOR[r.role] ?? 'var(--accent)' }} />
                  <span className="font-semibold text-[var(--ink)]">{r.role}</span>
                  <span className="font-mono text-[var(--muted)]">${r.total.toFixed(4)}</span>
                  <span className="text-[var(--muted)]">{fmtTokens(r.tokensIn)} in / {fmtTokens(r.tokensOut)} out</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Per-ticket breakdown */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <h3 className="text-sm font-semibold text-[var(--ink)] mb-3">Cost by ticket</h3>
        {data.byTicket.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No ticket costs recorded yet.</p>
        ) : (
          <div className="space-y-1">
            {data.byTicket.map(t => {
              const isOpen = expanded.has(t.ticketId)
              return (
                <div key={t.ticketId}>
                  <button type="button" onClick={() => toggleExpand(t.ticketId)}
                    className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-[var(--panel-hover)] transition-colors text-left group">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      className={`text-[var(--muted)] transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}>
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                    <span className="text-xs text-[var(--ink)] truncate flex-1">{t.title}</span>
                    <span className="font-mono text-xs font-semibold text-[var(--accent)] flex-shrink-0">${t.total.toFixed(4)}</span>
                    <div className="w-24 h-1.5 rounded-full bg-[var(--panel-hover)] flex-shrink-0 overflow-hidden">
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(t.total / maxTicketCost) * 100}%` }} />
                    </div>
                  </button>
                  {isOpen && (
                    <div className="ml-7 mb-2 space-y-0.5">
                      {t.byRole.map(r => (
                        <div key={r.role} className="flex items-center gap-2 text-[11px] py-0.5 px-2">
                          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: ROLE_COLOR[r.role] ?? 'var(--accent)' }} />
                          <span className="font-semibold text-[var(--ink)] w-8">{r.role}</span>
                          <span className="font-mono text-[var(--accent)]">${r.total.toFixed(4)}</span>
                          <span className="text-[var(--muted)]">{fmtTokens(r.tokensIn)} in / {fmtTokens(r.tokensOut)} out</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent ledger entries */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <h3 className="text-sm font-semibold text-[var(--ink)] mb-3">Recent activity ({data.ledger.length} entries)</h3>
        {data.ledger.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No cost entries yet.</p>
        ) : (
          <ResponsiveTable caption="Recent cost entries" rows={data.ledger} rowKey={(l, i) => `${l.createdAt}-${l.role}-${i}`}
            className="text-xs" headClassName="text-[var(--muted)]" rowProps={() => ({ className: 'hover:bg-[var(--panel-hover)]' })}
            columns={[
              { key: 'time', header: 'Time', className: 'whitespace-nowrap text-[var(--muted)]', cell: (l) => fmtTime(l.createdAt) },
              { key: 'role', header: 'Role', cell: (l) => <span className="font-semibold" style={{ color: ROLE_COLOR[l.role] ?? 'var(--ink)' }}>{l.role}</span> },
              { key: 'model', header: 'Model', className: 'font-mono text-[var(--muted)]', cell: (l) => l.model },
              { key: 'cost', header: 'Cost', className: 'text-right font-mono font-semibold text-[var(--accent)]', cell: (l) => `$${l.costUsd.toFixed(4)}` },
              { key: 'in', header: 'Tokens in', className: 'text-right font-mono text-[var(--muted)]', cell: (l) => fmtTokens(l.tokensIn) },
              { key: 'out', header: 'Tokens out', className: 'text-right font-mono text-[var(--muted)]', cell: (l) => fmtTokens(l.tokensOut) },
            ]} />
        )}
      </div>
    </div>
  )
}

const PRICES = [
  { model: 'claude-opus-4', input: '$15', output: '$75' },
  { model: 'claude-sonnet-4', input: '$3', output: '$15' },
  { model: 'claude-haiku-4.5', input: '$0.80', output: '$4' },
  { model: 'gpt-4o', input: '$2.50', output: '$10' },
]

function PricingInfo() {
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
      <button type="button" onClick={() => setOpen(o => !o)} aria-label="How pricing works"
        className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors text-[10px] font-bold">
        i
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--line)] bg-[var(--paper)] shadow-xl p-4 text-xs text-[var(--ink)] space-y-2">
          <p className="font-semibold text-sm">How agent costs work</p>
          <p className="text-[var(--muted)]">Agents use your <strong>BYO API key</strong> (Anthropic or OpenAI). You pay the provider directly — ProAppStore charges nothing on top.</p>
          <ResponsiveTable caption="Model prices per 1M tokens" rows={PRICES} rowKey={(p) => p.model} className="text-[11px]" headClassName="text-[var(--muted)]"
            columns={[
              { key: 'model', header: 'Model', cell: (p) => p.model },
              { key: 'input', header: 'Input', className: 'text-right font-mono', cell: (p) => p.input },
              { key: 'output', header: 'Output', className: 'text-right font-mono', cell: (p) => p.output },
            ]} />
          <p className="text-[var(--muted)]">Prices per 1M tokens. A typical Dev run uses 50-200k input + 5-15k output tokens.</p>
          <div className="border-t border-[var(--line)] pt-2 space-y-1">
            <p className="font-semibold">Cost tips</p>
            <p className="text-[var(--muted)]">Use <strong>Haiku</strong> for BA + QA (cheap, formulaic tasks). Use <strong>Sonnet</strong> for Dev (best quality/cost ratio). Reserve <strong>Opus</strong> for complex architecture work.</p>
            <p className="text-[var(--muted)]">Change models in the config button <span className="font-mono text-[var(--accent)]">[···]</span> on the board header.</p>
          </div>
        </div>
      )}
    </div>
  )
}
