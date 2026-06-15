import { useState } from 'react'
import { api } from './agents/lib'
import { MODEL_SUGGESTIONS, type RoleCfg } from './agents/types'

interface AgentDescriptor {
  id: string; label: string; summary: string; surface: 'chat' | 'build';
  thread?: 'build' | 'research'; identity: string; identitySource: 'default' | 'custom';
  systemPrompt: string; systemPromptSource: 'default' | 'custom' | 'templated';
  tools: string[]; model: string; runtime: string; maxTokens?: number;
  editable: { fields: string[]; via: string };
}

const SPINE_TOOLS = ['write_file', 'batch_write_files', 'read_file', 'list_files', 'search_files', 'delete_file', 'read_docs']
const RUNTIME_LABEL: Record<string, string> = { 'cf-native': 'Anthropic', 'openai-responses': 'OpenAI' }

interface ProjectCost { costCapMonthlyUsd?: number; costSpentMonthlyUsd?: number }

function Badge({ kind }: { kind: 'default' | 'custom' | 'templated' }) {
  const map = {
    default: { label: 'default', cls: 'text-[var(--muted)] border-[var(--line)]' },
    custom: { label: 'customized', cls: 'text-[var(--accent)] border-[var(--accent)]' },
    templated: { label: 'per-message', cls: 'text-[var(--muted)] border-[var(--line)]' },
  }[kind]
  return <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${map.cls}`}>{map.label}</span>
}

export function ReadPanel({ agent }: { agent: AgentDescriptor }) {
  const [showPrompt, setShowPrompt] = useState(false)
  return (
    <div className="space-y-3">
      {/* Meta row */}
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-[var(--muted)]">
        <span><span className="text-[var(--ink)] font-medium">{agent.model}</span> · {RUNTIME_LABEL[agent.runtime] ?? agent.runtime}</span>
        {agent.maxTokens != null && <span>{agent.maxTokens.toLocaleString()} max tokens</span>}
      </div>

      {/* Identity */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Identity</span>
          <Badge kind={agent.identitySource} />
        </div>
        <pre className="text-xs text-[var(--ink)] whitespace-pre-wrap font-sans bg-[var(--paper)] rounded-lg border border-[var(--line)] p-2.5">{agent.identity}</pre>
      </div>

      {/* Skills */}
      <div>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Skills</span>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {agent.tools.length === 0 && <span className="text-xs text-[var(--muted)]">none</span>}
          {agent.tools.map((t) => (
            <span key={t} className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[var(--paper)] border border-[var(--line)] text-[var(--ink)]">{t}</span>
          ))}
        </div>
      </div>

      {/* System prompt (collapsible) */}
      <div>
        <button type="button" onClick={() => setShowPrompt((s) => !s)}
          className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)] hover:text-[var(--ink)]">
          <span>{showPrompt ? '▾' : '▸'} System prompt</span>
          <Badge kind={agent.systemPromptSource} />
        </button>
        {showPrompt && (
          <pre className="mt-1 text-xs text-[var(--ink)] whitespace-pre-wrap font-sans bg-[var(--paper)] rounded-lg border border-[var(--line)] p-2.5 max-h-72 overflow-y-auto">{agent.systemPrompt}</pre>
        )}
      </div>

      {!agent.editable.via.startsWith('PUT') || agent.editable.via.includes('roadmap') ? (
        <p className="text-[11px] text-[var(--muted)] italic">Tuning this agent's identity is coming soon.</p>
      ) : null}
    </div>
  )
}

export function EditPanel({ draft, setDraft, toggleTool, onSave, onCancel, saving }: {
  draft: RoleCfg
  setDraft: (fn: (d: RoleCfg | null) => RoleCfg | null) => void
  toggleTool: (t: string) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  const patch = (change: Partial<RoleCfg>) => setDraft((d) => d ? { ...d, ...change } : d)
  const inputCls = 'mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)]'
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="text-xs text-[var(--muted)]">
          Provider
          <select value={draft.runtime} onChange={(e) => patch({ runtime: e.target.value as RoleCfg['runtime'] })} className={inputCls}>
            <option value="cf-native">Anthropic</option>
            <option value="openai-responses">OpenAI</option>
          </select>
        </label>
        <label className="text-xs text-[var(--muted)]">
          Model
          <input list={`models-${draft.role}`} value={draft.model} onChange={(e) => patch({ model: e.target.value })} className={inputCls} />
          <datalist id={`models-${draft.role}`}>
            {(MODEL_SUGGESTIONS[draft.runtime] ?? []).map((m) => <option key={m} value={m} />)}
          </datalist>
        </label>
        <label className="text-xs text-[var(--muted)]">
          Max tokens
          <input type="number" min={1024} max={64000} step={1024} value={draft.maxTokens ?? 16384}
            onChange={(e) => patch({ maxTokens: Number(e.target.value) || undefined })} className={inputCls} />
        </label>
      </div>

      <label className="text-xs text-[var(--muted)] block">
        Identity (persona) — the agent's soul: directive, boundaries, tone
        <textarea value={draft.persona ?? ''} rows={4} onChange={(e) => patch({ persona: e.target.value || undefined })}
          placeholder="e.g. You are the Developer. Directive: ship small, correct diffs. Vibe: pragmatic, fast."
          className={inputCls + ' text-xs'} />
      </label>

      <label className="text-xs text-[var(--muted)] block">
        System prompt override — replaces the role's default job description (leave empty to use the default)
        <textarea value={draft.systemPromptOverride ?? ''} rows={4} onChange={(e) => patch({ systemPromptOverride: e.target.value || undefined })}
          placeholder="Empty = use the platform default prompt for this role."
          className={inputCls + ' text-xs font-mono'} />
      </label>

      <div className="text-xs text-[var(--muted)]">
        Skills
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-1.5">
          {SPINE_TOOLS.map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--ink)] cursor-pointer">
              <input type="checkbox" checked={draft.spineTools.includes(t)} onChange={() => toggleTool(t)} />
              {t}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]">Cancel</button>
        <button type="button" onClick={onSave} disabled={saving}
          className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// Monthly budget for the team — the cost cap that auto-pauses the loop when the
// month's spend reaches it. Reads cap + spend from GET /projects/:slug; saves via
// PUT /projects/:slug/budget.
export function BudgetCard({ appId, getToken, cost, onSaved, setError }: {
  appId: string
  getToken: () => string | null
  cost: ProjectCost
  onSaved: () => Promise<void>
  setError: (s: string | null) => void
}) {
  const [cap, setCap] = useState<number>(cost.costCapMonthlyUsd ?? 50)
  const [saving, setSaving] = useState(false)
  const spent = cost.costSpentMonthlyUsd ?? 0
  const pct = cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0

  const save = async () => {
    const token = getToken()
    if (!token) return
    if (!(cap >= 1 && cap <= 1000)) { setError('Budget must be between $1 and $1000'); return }
    setSaving(true); setError(null)
    try {
      await api(`/projects/${appId}/budget`, token, { method: 'PUT', body: { costCapMonthlyUsd: cap } })
      await onSaved()
    } catch (e) {
      setError((e as Error).message)
    }
    setSaving(false)
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Monthly budget</h4>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            ${spent.toFixed(2)} spent of ${(cost.costCapMonthlyUsd ?? cap).toFixed(0)} this month. The loop auto-pauses when the cap is reached.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-[11px] text-[var(--muted)]">
            Cap (USD/mo)
            <input type="number" min={1} max={1000} step={5} value={cap}
              onChange={(e) => setCap(Number(e.target.value) || 0)}
              className="mt-1 w-24 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1 text-sm text-[var(--ink)]" />
          </label>
          <button type="button" onClick={save} disabled={saving}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-[var(--paper)] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? 'var(--error,#dc2626)' : 'var(--accent)' }} />
      </div>
    </div>
  )
}
