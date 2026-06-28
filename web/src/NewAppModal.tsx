// ---------------------------------------------------------------------------
// New app modal — name + template + idea → create the agent-teams project
// ---------------------------------------------------------------------------

import { useState } from 'react'
import { deriveSlug } from './nav'

const TEMPLATES = [
  { id: 'blank', label: 'Blank', desc: 'Empty shell — start from scratch' },
  { id: 'marketplace', label: 'Marketplace', desc: 'Two-sided listings, search, apply' },
  { id: 'realtime', label: 'Real-time', desc: 'Workspaces, boards, live presence' },
  { id: 'social', label: 'Social', desc: 'Profiles, matching, chat' },
  { id: 'organization', label: 'Organization', desc: 'Multi-tenant orgs, roles, members' },
  { id: 'dashboard', label: 'Dashboard', desc: 'Stats, CRUD, list/detail' },
] as const

export function NewAppModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, idea: string, template: string) => Promise<string | null> }) {
  const [name, setName] = useState('')
  const [idea, setIdea] = useState('')
  const [template, setTemplate] = useState('blank')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    const err = await onCreate(name.trim(), idea, template)
    if (err) { setError(err); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="display-font text-2xl font-bold text-[var(--ink)] mb-1">New app</h2>
        <p className="text-sm text-[var(--muted)] mb-5">Pick a template, name it, describe the idea. Your agent team builds it.</p>

        <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Template</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplate(t.id)}
              className={'rounded-xl border px-3 py-2.5 text-left transition-colors ' +
                (template === t.id
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-[var(--line)] hover:border-[var(--line-strong)]')}
            >
              <div className={'text-sm font-semibold ' + (template === t.id ? 'text-[var(--accent)]' : 'text-[var(--ink)]')}>{t.label}</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">{t.desc}</div>
            </button>
          ))}
        </div>

        <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Chess Academy"
          className="block w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm text-[var(--ink)] mb-1"
        />
        {deriveSlug(name) && (
          <p className="text-xs text-[var(--muted)] mb-3 font-mono">
            {deriveSlug(name)}.proappstore.online
          </p>
        )}
        <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1 mt-2">Idea (optional)</label>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          rows={3}
          placeholder="A chess training app with daily puzzles, ELO tracking, and spaced-repetition review."
          className="block w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm text-[var(--ink)]"
        />
        {error && <p className="mt-3 text-sm text-[var(--error)]">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]">Cancel</button>
          <button type="button" onClick={submit} disabled={!name.trim() || busy} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? 'Creating…' : 'Create app'}
          </button>
        </div>
      </div>
    </div>
  )
}
