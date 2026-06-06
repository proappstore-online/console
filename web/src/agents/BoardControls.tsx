/**
 * Board header controls: unified config popover (models, timeout, budget),
 * real-time cost badge, and elapsed timer. Extracted from AppAgents.tsx.
 */
import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { api } from './lib'
import { apiFetch } from '../api'
import { ROLE_COLOR, MODEL_SUGGESTIONS, type Project, type RoleCfg } from './types'
import type { TicketLiveEntry } from './useAgentWebSocket'

/** Runtime → key-vault provider id (must match byo-key.ts on the backend). */
const RUNTIME_TO_PROVIDER: Record<string, string> = {
  'cf-native': 'anthropic',
  'openai-responses': 'openai',
}

// ── ProjectCostBadge ──────────────────────────────────────────────────

export function ProjectCostBadge({ project, ticketLive }: {
  project: Project;
  ticketLive: Record<string, TicketLiveEntry>;
}) {
  const vals = Object.values(ticketLive)
  const liveDelta = vals.reduce((s, t) => s + (t.costUsd ?? 0), 0)
  const liveTokIn = vals.reduce((s, t) => s + (t.tokensIn ?? 0), 0)
  const liveTokOut = vals.reduce((s, t) => s + (t.tokensOut ?? 0), 0)
  const total = (project.costSpentMonthlyUsd ?? 0) + liveDelta
  const cap = project.costCapMonthlyUsd ?? 50
  const fmtTok = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n)

  const prevRef = useRef(total)
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (Math.abs(total - prevRef.current) > 0.0001) {
      prevRef.current = total
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 1200)
      return () => clearTimeout(t)
    }
  }, [total])

  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded-md transition-all duration-300 flex items-center gap-2 ${
      flash
        ? 'bg-[var(--accent)] text-white scale-105'
        : 'text-[var(--muted)]'
    }`} title={`Monthly: $${total.toFixed(4)} of $${cap} cap\nLive tokens: ${liveTokIn.toLocaleString()} in / ${liveTokOut.toLocaleString()} out`}>
      <span>${total.toFixed(2)}<span className="opacity-50">/${cap.toFixed(0)}</span></span>
      {(liveTokIn > 0 || liveTokOut > 0) && <span className="opacity-60">{fmtTok(liveTokIn)}+{fmtTok(liveTokOut)}</span>}
    </span>
  )
}

// ── ElapsedTimer ──────────────────────────────────────────────────────

export function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000))
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return <span className="text-[var(--muted)] tabular-nums">{m}:{s.toString().padStart(2, '0')}</span>
}

// ── BoardConfig ───────────────────────────────────────────────────────

export function BoardConfig({ appId, project, roles, getToken, onUpdateProject, onUpdateRoles }: {
  appId: string; project: Project; roles: RoleCfg[]; getToken: () => string | null;
  onUpdateProject: Dispatch<SetStateAction<Project | null>>;
  onUpdateRoles: Dispatch<SetStateAction<RoleCfg[]>>;
}) {
  const [open, setOpen] = useState(false)
  // Which providers the user has API keys for (loaded on popover open).
  const [configuredProviders, setConfiguredProviders] = useState<Set<string> | null>(null)
  useEffect(() => {
    if (!open) return
    const token = getToken()
    if (!token) return
    apiFetch<{ keys: { provider: string }[] }>('/keys/status', { token })
      .then(d => setConfiguredProviders(new Set(d.keys.map(k => k.provider))))
      .catch(() => {}) // fail silently — show all models as fallback
  }, [open, getToken])

  const buildRoles = roles.filter(r => ['BA', 'Dev', 'QA'].includes(r.role))
  const short = (m: string) => m.replace('claude-', '').replace('openai-', '')
  const devModel = buildRoles.find(r => r.role === 'Dev')?.model ?? '?'
  const allSame = buildRoles.length > 0 && buildRoles.every(r => r.model === devModel)
  const timeout = project.maxRunMinutes ?? 10
  const cap = project.costCapMonthlyUsd ?? 50

  const saveRole = async (role: string, runtime: string, model: string) => {
    const token = getToken()
    if (!token) return
    const snapshot = [...roles]
    const next = roles.map(r => r.role === role ? { ...r, runtime: runtime as RoleCfg['runtime'], model } : r)
    onUpdateRoles(() => next)
    try { await api(`/projects/${appId}/roles`, token, { method: 'PUT', body: { roles: next } }) }
    catch { onUpdateRoles(() => snapshot) }
  }

  const setAll = async (runtime: string, model: string) => {
    const token = getToken()
    if (!token) return
    const snapshot = [...roles]
    const next = roles.map(r => ['BA', 'Dev', 'QA'].includes(r.role) ? { ...r, runtime: runtime as RoleCfg['runtime'], model } : r)
    onUpdateRoles(() => next)
    try { await api(`/projects/${appId}/roles`, token, { method: 'PUT', body: { roles: next } }) }
    catch { onUpdateRoles(() => snapshot) }
  }

  const saveBudget = async (body: { maxRunMinutes?: number; costCapMonthlyUsd?: number }) => {
    const token = getToken()
    if (!token) return
    if (body.maxRunMinutes) onUpdateProject(prev => prev ? { ...prev, maxRunMinutes: body.maxRunMinutes! } : prev)
    if (body.costCapMonthlyUsd) onUpdateProject(prev => prev ? { ...prev, costCapMonthlyUsd: body.costCapMonthlyUsd! } : prev)
    try { await api(`/projects/${appId}/budget`, token, { method: 'PUT', body }) } catch { /* rollback handled by next refresh */ }
  }

  const label = allSame ? short(devModel) : buildRoles.map(r => `${r.role[0]}:${short(r.model).split('-')[0]}`).join(' ')

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`text-[11px] font-mono px-1.5 py-0.5 rounded border transition-colors cursor-pointer flex items-center gap-1.5 ${
          open ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--line)] text-[var(--muted)] hover:border-[var(--accent)]'
        }`}
        title="Agent config: models, timeout, budget">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
        {label} {timeout}m ${cap}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-xl p-3 min-w-[290px] space-y-3"
          onMouseLeave={() => setOpen(false)}>
          <div>
            <p className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5">Model per role</p>
            {buildRoles.map(r => (
              <div key={r.role} className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-bold w-7" style={{ color: ROLE_COLOR[r.role] }}>{r.role}</span>
                <select value={`${r.runtime}|${r.model}`}
                  onChange={e => { const [rt, m] = e.target.value.split('|'); saveRole(r.role, rt!, m!) }}
                  aria-label={`Model for ${r.role}`}
                  className="flex-1 text-[11px] text-[var(--ink)] bg-transparent border border-[var(--line)] rounded px-1.5 py-1 cursor-pointer hover:border-[var(--accent)]">
                  {Object.entries(MODEL_SUGGESTIONS).map(([rt, models]) => {
                    const provider = RUNTIME_TO_PROVIDER[rt] ?? rt
                    const hasKey = !configuredProviders || configuredProviders.has(provider)
                    return (
                      <optgroup key={rt} label={`${provider.charAt(0).toUpperCase() + provider.slice(1)}${hasKey ? '' : ' (no key)'}`}>
                        {models.map(m => <option key={`${rt}|${m}`} value={`${rt}|${m}`} disabled={!hasKey}>{m}{hasKey ? '' : ' (no key)'}</option>)}
                      </optgroup>
                    )
                  })}
                </select>
              </div>
            ))}
            <div className="flex gap-1.5 mt-1.5">
              <button type="button" onClick={() => setAll('cf-native', 'claude-haiku-4-5')}
                className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-600 font-semibold hover:bg-green-500/20">Cheap</button>
              <button type="button" onClick={() => setAll('cf-native', 'claude-sonnet-4-6')}
                className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 font-semibold hover:bg-blue-500/20">Balanced</button>
              <button type="button" onClick={() => setAll('cf-native', 'claude-opus-4-8')}
                className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 font-semibold hover:bg-purple-500/20">Smart</button>
            </div>
          </div>
          <div className="border-t border-[var(--line)] pt-2 grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide block mb-1">Run timeout</label>
              <select value={timeout} onChange={e => saveBudget({ maxRunMinutes: Number(e.target.value) })}
                aria-label="Agent run timeout"
                className="w-full text-[11px] text-[var(--ink)] bg-transparent border border-[var(--line)] rounded px-1.5 py-1 cursor-pointer hover:border-[var(--accent)]">
                {[5, 10, 15, 20, 30, 45, 60].map(m => <option key={m} value={m}>{m} min</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide block mb-1">Monthly cap</label>
              <select value={cap} onChange={e => saveBudget({ costCapMonthlyUsd: Number(e.target.value) })}
                aria-label="Monthly cost cap"
                className="w-full text-[11px] text-[var(--ink)] bg-transparent border border-[var(--line)] rounded px-1.5 py-1 cursor-pointer hover:border-[var(--accent)]">
                {[10, 25, 50, 100, 200, 500, 1000].map(v => <option key={v} value={v}>${v}</option>)}
              </select>
            </div>
          </div>
          <div className="border-t border-[var(--line)] pt-2">
            <p className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5">Max output tokens</p>
            <div className="grid grid-cols-3 gap-1.5">
              {buildRoles.map(r => (
                <div key={r.role}>
                  <span className="text-[10px] font-bold block mb-0.5" style={{ color: ROLE_COLOR[r.role] }}>{r.role}</span>
                  <select value={r.maxTokens ?? 8192}
                    onChange={e => {
                      const token = getToken(); if (!token) return;
                      const snapshot = [...roles];
                      const next = roles.map(x => x.role === r.role ? { ...x, maxTokens: Number(e.target.value) } : x);
                      onUpdateRoles(() => next);
                      api(`/projects/${appId}/roles`, token, { method: 'PUT', body: { roles: next } }).catch(() => onUpdateRoles(() => snapshot));
                    }}
                    aria-label={`Max tokens for ${r.role}`}
                    className="w-full text-[10px] text-[var(--ink)] bg-transparent border border-[var(--line)] rounded px-1 py-0.5 cursor-pointer hover:border-[var(--accent)]">
                    {[2048, 4096, 8192, 16384, 32768].map(v => <option key={v} value={v}>{(v/1024).toFixed(0)}k</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
