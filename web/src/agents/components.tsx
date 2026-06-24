// Self-contained presentational pieces for the agent-teams console view:
// the icon copy controls, the info modal, the per-app settings modal, and the
// memory panel. Extracted from AppAgents so that file stays focused on the
// main workspace orchestration.
import { useState, useEffect, useRef } from 'react'
import { api } from './lib'
import { ROLE_INFO, ROLE_COLOR, MODEL_SUGGESTIONS, type RoleCfg } from './types'

// The one copy control used everywhere — icon-only, consistent. Inherits
// currentColor so it reads correctly in headers (muted) and on the accent chat
// bubble (white). Shows a checkmark on copy. `getData` is lazy so it captures
// the latest state at click time.
export function CopyButton({ getData, title }: { getData: () => string; title: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" title={title}
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(getData()); setDone(true); setTimeout(() => setDone(false), 1200) }}
      className="inline-flex items-center opacity-50 hover:opacity-100 transition-opacity">
      {done
        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
    </button>
  )
}

// Wrappers keep call-sites tidy; all render the same icon-only CopyButton.
export function CopyBtn({ getData, label }: { getData: () => string; label: string }) {
  return <CopyButton getData={getData} title={`Copy ${label} as JSON`} />
}
export function InlineCopy({ text, title = 'Copy' }: { text: string; title?: string }) {
  return <CopyButton getData={() => text} title={title} />
}
export function ScreenCopyBtn({ getData }: { getData: () => string }) {
  return <CopyButton getData={getData} title="Copy the entire screen (all tiles) as JSON" />
}

// Explains the agent team + roles + board flow. Opened from the (i) in the chat header.
export function AgentsInfoModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] shadow-[var(--shadow-card)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)] sticky top-0 bg-[var(--panel-solid)]">
          <h3 className="text-base font-bold text-[var(--ink)]">How your agent team works</h3>
          <button type="button" onClick={onClose} className="text-[var(--muted)] hover:text-[var(--ink)] text-xl leading-none">&times;</button>
        </div>
        <div className="px-5 py-4 space-y-5 text-sm text-[var(--ink)]">
          <p className="text-[var(--muted)]">
            You describe what you want in <strong className="text-[var(--ink)]">Chat</strong>. The team takes it from there —
            refining, building, reviewing, and deploying — while you watch the board. Press <strong className="text-[var(--ink)]">Play</strong> to
            let them work autonomously, <strong className="text-[var(--ink)]">Pause</strong> to stop.
          </p>

          <div>
            <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">The roles</h4>
            <div className="space-y-2">
              {ROLE_INFO.map(r => (
                <div key={r.role} className="flex gap-3 rounded-xl border border-[var(--line)] p-3">
                  <span className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0" style={{ background: ROLE_COLOR[r.role] ?? 'var(--muted)' }} />
                  <div>
                    <p className="font-semibold" style={{ color: ROLE_COLOR[r.role] ?? 'var(--ink)' }}>{r.title}</p>
                    <p className="text-[var(--muted)] mt-0.5">{r.blurb}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">The board</h4>
            <p className="text-[var(--muted)]">
              Tickets flow left to right: <strong className="text-[var(--ink)]">Inbox → BA → Dev → QA → Done</strong>.
              A ticket in <strong className="text-[var(--ink)]">Blocked</strong> means an agent needs your input — answer in chat,
              or press Play to retry. Click any ticket to see its full spec and the agents’ conversation.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Cost</h4>
            <p className="text-[var(--muted)]">
              Agents run on <strong className="text-[var(--ink)]">your own API key</strong> (add it in Profile). The board shows
              spend vs. your monthly cap; the team auto-pauses when the cap is reached.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Per-app agent configuration: model, runtime, and output token cap for each
// role (BA/Dev/QA). Backed by GET/PUT /projects/:slug/roles. Settings are
// per-project (each app's team can use different models) — not account-wide.
export function AgentSettingsModal({ appId, token, onClose }: { appId: string; token: string; onClose: () => void }) {
  const [roles, setRoles] = useState<RoleCfg[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api(`/projects/${appId}/roles`, token)
      .then((r) => setRoles((r as { roles: RoleCfg[] }).roles))
      .catch((e: Error) => setError(e.message))
  }, [appId, token])

  const patch = (role: string, change: Partial<RoleCfg>) =>
    setRoles(prev => prev?.map(r => r.role === role ? { ...r, ...change } : r) ?? prev)

  const save = async () => {
    if (!roles) return
    setSaving(true); setError(null)
    try {
      await api(`/projects/${appId}/roles`, token, { method: 'PUT', body: { roles } })
      setSaved(true); setTimeout(() => setSaved(false), 1500)
    } catch (e) { setError((e as Error).message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] shadow-[var(--shadow-card)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)] sticky top-0 bg-[var(--panel-solid)]">
          <div>
            <h3 className="text-base font-bold text-[var(--ink)]">Agent settings</h3>
            <p className="text-xs text-[var(--muted)]">Model &amp; token limit per role, for this app.</p>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--muted)] hover:text-[var(--ink)] text-xl leading-none">&times;</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {!roles && !error && <p className="text-sm text-[var(--muted)]">Loading…</p>}
          {roles?.map(r => (
            <div key={r.role} className="rounded-xl border border-[var(--line)] p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full" style={{ background: ROLE_COLOR[r.role] ?? 'var(--muted)' }} />
                <span className="text-sm font-bold" style={{ color: ROLE_COLOR[r.role] ?? 'var(--ink)' }}>{r.role}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="text-xs text-[var(--muted)]">
                  Provider
                  <select value={r.runtime} onChange={e => patch(r.role, { runtime: e.target.value as RoleCfg['runtime'] })}
                    className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)]">
                    <option value="cf-native">Anthropic</option>
                    <option value="openai-responses">OpenAI</option>
                  </select>
                </label>
                <label className="text-xs text-[var(--muted)]">
                  Model
                  <input list={`models-${r.role}`} value={r.model} onChange={e => patch(r.role, { model: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)]" />
                  <datalist id={`models-${r.role}`}>
                    {(MODEL_SUGGESTIONS[r.runtime] ?? []).map(m => <option key={m} value={m} />)}
                  </datalist>
                </label>
                <label className="text-xs text-[var(--muted)]">
                  Max tokens
                  <input type="number" min={1024} max={64000} step={1024} value={r.maxTokens ?? 16384}
                    onChange={e => patch(r.role, { maxTokens: Number(e.target.value) || undefined })}
                    className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)]" />
                </label>
              </div>
              <label className="text-xs text-[var(--muted)] block mt-2">
                Persona (soul) — identity, principles, tone
                <textarea value={r.persona ?? ''} rows={3}
                  onChange={e => patch(r.role, { persona: e.target.value })}
                  placeholder="e.g. You are the Developer. Directive: ship working code. Vibe: pragmatic, fast."
                  className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1.5 text-xs text-[var(--ink)]" />
              </label>
            </div>
          ))}
          {error && <p className="text-sm text-[var(--error)]">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--line)] sticky bottom-0 bg-[var(--panel-solid)]">
          {saved && <span className="text-xs text-[var(--success)]">Saved</span>}
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]">Close</button>
          <button type="button" onClick={save} disabled={saving || !roles}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// The team's durable memory — decisions/facts every agent treats as ground truth.
export function MemoryPanel({ entries, onAdd, onDelete, onClose }: {
  entries: { id: string; category: string; key: string; value: string }[]
  onAdd: (key: string, value: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [k, setK] = useState('')
  const [v, setV] = useState('')
  const submit = () => { if (k.trim() && v.trim()) { onAdd(k.trim(), v.trim()); setK(''); setV('') } }
  return (
    <div className="flex flex-col lg:w-[340px] flex-shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--line)] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--ink)]">Memory {entries.length > 0 && <span className="text-[var(--muted)] font-normal">({entries.length})</span>}</h3>
          <p className="text-[10px] text-[var(--muted)]">Decisions &amp; facts the whole team uses</p>
        </div>
        <button type="button" onClick={onClose} className="text-[var(--muted)] hover:text-[var(--ink)] text-lg leading-none px-1" title="Close">&times;</button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2">
        {entries.length === 0 && <p className="text-xs text-[var(--muted)] py-2">No memory yet. The PO records decisions here as you make them — or add one below.</p>}
        {entries.map(e => (
          <div key={e.id} className="group rounded-lg border border-[var(--line)] p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--ink)] break-words">{e.key}</p>
                <p className="text-xs text-[var(--muted)] break-words">{e.value}</p>
              </div>
              <button type="button" onClick={() => onDelete(e.id)} title="Forget"
                className="text-[var(--muted)] hover:text-[var(--error)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-[var(--line)] space-y-2">
        <input value={k} onChange={e => setK(e.target.value)} placeholder="key (e.g. auth)"
          aria-label="Memory key"
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-xs text-[var(--ink)]" />
        <div className="flex gap-2">
          <input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} placeholder="value (e.g. GitHub OAuth)"
            aria-label="Memory value"
            className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-xs text-[var(--ink)]" />
          <button type="button" onClick={submit} disabled={!k.trim() || !v.trim()}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">Add</button>
        </div>
      </div>
    </div>
  )
}

/** Collapsible wrapper — truncates long content with a fade and toggle. */
export function Collapsible({ children, maxH = 120 }: { children: React.ReactNode; maxH?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [needs, setNeeds] = useState(false)
  const [open, setOpen] = useState(false)
  // Measure after paint (not on every children change — just on mount + maxH).
  // ResizeObserver catches dynamic content changes without depending on children identity.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setNeeds(el.scrollHeight > maxH + 20)
    check()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(check)
      ro.observe(el)
      return () => ro.disconnect()
    }
  }, [maxH])
  return (
    <div className="relative">
      <div ref={ref} style={!open && needs ? { maxHeight: maxH, overflow: 'hidden', maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)' } : undefined}>
        {children}
      </div>
      {needs && (
        <button type="button" onClick={() => setOpen(o => !o)}
          className="text-[10px] font-semibold text-[var(--accent)] hover:underline mt-0.5 block">
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
