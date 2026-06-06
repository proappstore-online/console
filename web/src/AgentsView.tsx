import { useState, useEffect, useCallback } from 'react'
import { api } from './agents/lib'
import { ROLE_COLOR, MODEL_SUGGESTIONS, type RoleCfg } from './agents/types'
import { ReadPanel, EditPanel, BudgetCard } from './AgentsViewPanels'

/**
 * The "Team" tab — see and tune EVERY agent on a project. Reads the resolved
 * catalog from GET /v1/projects/:slug/agents (identity, base system prompt,
 * skills, model/runtime, and whether each is a default or a per-project
 * override). Build roles (Architect/BA/Dev/QA) are editable inline via
 * PUT /roles; the chat agents (PO) are read-only for now (see the roadmap note
 * on each card). This is the UI behind "see all prompts / skills / identities".
 */

interface AgentDescriptor {
  id: string
  label: string
  summary: string
  surface: 'chat' | 'build'
  thread?: 'build' | 'research'
  identity: string
  identitySource: 'default' | 'custom'
  systemPrompt: string
  systemPromptSource: 'default' | 'custom' | 'templated'
  tools: string[]
  model: string
  runtime: string
  maxTokens?: number
  editable: { fields: string[]; via: string }
}

/** Spine tools a role may be granted (kept in sync with the backend registry). */
const SPINE_TOOLS = ['write_file', 'batch_write_files', 'read_file', 'list_files', 'search_files', 'delete_file', 'read_docs']

const RUNTIME_LABEL: Record<string, string> = { 'cf-native': 'Anthropic', 'openai-responses': 'OpenAI' }

function Badge({ kind }: { kind: 'default' | 'custom' | 'templated' }) {
  const map = {
    default: { label: 'default', cls: 'text-[var(--muted)] border-[var(--line)]' },
    custom: { label: 'customized', cls: 'text-[var(--accent)] border-[var(--accent)]' },
    templated: { label: 'per-message', cls: 'text-[var(--muted)] border-[var(--line)]' },
  }[kind]
  return <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${map.cls}`}>{map.label}</span>
}

interface ProjectCost { costCapMonthlyUsd?: number; costSpentMonthlyUsd?: number }

export function AgentsView({ appId, appName, getToken }: { appId: string; appName: string | null; getToken: () => string | null }) {
  const [agents, setAgents] = useState<AgentDescriptor[] | null>(null)
  const [roles, setRoles] = useState<RoleCfg[] | null>(null)
  const [cost, setCost] = useState<ProjectCost | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<RoleCfg | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setError(null)
    try {
      const [a, r, p] = await Promise.all([
        api(`/projects/${appId}/agents`, token) as Promise<{ agents: AgentDescriptor[] }>,
        api(`/projects/${appId}/roles`, token) as Promise<{ roles: RoleCfg[] }>,
        api(`/projects/${appId}`, token).catch(() => null) as Promise<ProjectCost | null>,
      ])
      setAgents(a.agents)
      setRoles(r.roles)
      setCost(p)
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [appId, getToken])

  useEffect(() => { load() }, [load])

  const startEdit = (id: string) => {
    const rc = roles?.find((r) => r.role === id)
    if (!rc) return
    setEditing(id)
    setDraft({ ...rc })
  }
  const cancelEdit = () => { setEditing(null); setDraft(null) }

  const save = async () => {
    const token = getToken()
    if (!token || !draft || !roles) return
    setSaving(true); setError(null)
    try {
      const next = roles.map((r) => (r.role === draft.role ? draft : r))
      await api(`/projects/${appId}/roles`, token, { method: 'PUT', body: { roles: next } })
      cancelEdit()
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
    setSaving(false)
  }

  const toggleTool = (tool: string) =>
    setDraft((d) => d ? { ...d, spineTools: d.spineTools.includes(tool) ? d.spineTools.filter((t) => t !== tool) : [...d.spineTools, tool] } : d)

  if (loading) return <p className="py-12 text-center text-sm text-[var(--muted)]">Loading the team…</p>

  if (error && !agents) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-3">
        <span className="text-4xl">🤖</span>
        <h2 className="display-font text-xl font-bold text-[var(--ink)]">No agent team yet</h2>
        <p className="text-sm text-[var(--muted)] max-w-lg mx-auto">
          This app doesn't have an agent team provisioned yet. Start one from the Build tab, then come back to
          see and tune every agent's identity, prompt, skills, and model.
        </p>
        <p className="text-xs text-[var(--muted)]">({error})</p>
        <button type="button" onClick={load} className="text-xs text-[var(--muted)] hover:text-[var(--ink)] px-2 py-1 rounded border border-[var(--line)] hover:border-[var(--accent)]">Retry</button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide">Agent team</h3>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            Every agent that builds {appName ?? appId}. See each one's identity, prompt, skills, and model — and
            tune the build roles. The platform gives you the framework; you tune the textual parts.
          </p>
        </div>
        <button type="button" onClick={load}
          className="text-xs text-[var(--muted)] hover:text-[var(--ink)] px-2 py-1 rounded border border-[var(--line)] hover:border-[var(--accent)]">
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}

      {cost && <BudgetCard appId={appId} getToken={getToken} cost={cost} onSaved={load} setError={setError} />}

      <div className="space-y-3">
        {agents?.map((agent) => {
          const isEditing = editing === agent.id
          const canEdit = agent.editable.via.startsWith('PUT') && !agent.editable.via.includes('roadmap')
          const color = ROLE_COLOR[agent.id] ?? ROLE_COLOR[agent.id.toLowerCase()] ?? 'var(--muted)'
          return (
            <div key={agent.id} className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: color }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold" style={{ color }}>{agent.label}</span>
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-[var(--line)] text-[var(--muted)]">
                        {agent.surface === 'chat' ? `${agent.thread ?? ''} chat`.trim() : 'build'}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--muted)] mt-0.5">{agent.summary}</p>
                  </div>
                </div>
                {canEdit && !isEditing && (
                  <button type="button" onClick={() => startEdit(agent.id)}
                    className="text-xs font-semibold text-[var(--accent)] hover:underline flex-shrink-0">Edit</button>
                )}
              </div>

              {isEditing && draft ? (
                <EditPanel draft={draft} setDraft={setDraft} toggleTool={toggleTool} onSave={save} onCancel={cancelEdit} saving={saving} />
              ) : (
                <ReadPanel agent={agent} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
