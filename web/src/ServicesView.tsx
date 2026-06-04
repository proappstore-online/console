import { useState, useEffect, useCallback } from 'react'
import { API_BASE, authHeaders } from './api'

interface DevProfile {
  creatorId: string
  promptRateCents: number
  bioServices: string | null
  available: boolean
  qualityScore: number | null
  avgPromptLength: number | null
  completedEngagements: number
  avgRating: number | null
  ratingCount: number
  appCount?: number
  login?: string
  avatarUrl?: string
}

interface Balance {
  balanceCents: number
  totalDepositedCents: number
  totalSpentCents: number
}

interface Transaction {
  id: string
  type: string
  amountCents: number
  description: string | null
  createdAt: number
}

type Tab = 'directory' | 'developer' | 'client' | 'engagements' | 'requests'

export function ServicesView({ getToken }: { getToken: () => string | null }) {
  const [tab, setTab] = useState<Tab>('directory')
  const token = getToken()

  return (
    <div className="space-y-6">
      <h2 className="display-font text-2xl font-bold text-[var(--ink)]">Services</h2>
      <p className="text-sm text-[var(--muted)]">
        Hire a developer to build your app, or offer your skills. Per-prompt billing, 10% platform fee.
      </p>

      <div className="flex items-center gap-0.5 rounded-lg border border-[var(--line-strong)] p-0.5 w-fit">
        {([
          { key: 'directory' as Tab, label: 'Developers' },
          { key: 'engagements' as Tab, label: 'Engagements' },
          { key: 'requests' as Tab, label: 'Requests' },
          { key: 'developer' as Tab, label: 'My Profile' },
          { key: 'client' as Tab, label: 'Balance' },
        ]).map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
              tab === t.key ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--ink)]'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'directory' && <DirectoryTab token={token} />}
      {tab === 'engagements' && <EngagementsTab token={token} />}
      {tab === 'requests' && <RequestsTab token={token} />}
      {tab === 'developer' && <DeveloperTab token={token} />}
      {tab === 'client' && <ClientTab token={token} />}
    </div>
  )
}

// ── Directory: browse available developers ───────────────────

function DirectoryTab({ token }: { token: string | null }) {
  const [devs, setDevs] = useState<DevProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [hiring, setHiring] = useState<string | null>(null)
  const [hireDesc, setHireDesc] = useState('')

  useEffect(() => {
    fetch(`${API_BASE}/services/developers`)
      .then(async (r) => { if (r.ok) setDevs(((await r.json()) as { developers: DevProfile[] }).developers) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const hire = async (devId: string) => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/services/engagements`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ developerId: devId, description: hireDesc || undefined }),
      })
      if (res.ok) {
        setHiring(null)
        setHireDesc('')
        alert('Engagement created! Check the Engagements tab.')
      } else {
        const err = await res.json().catch(() => ({ error: 'failed' })) as { error: string }
        alert(err.error)
      }
    } catch (e) { alert((e as Error).message) }
  }

  if (loading) return <p className="py-8 text-center text-sm text-[var(--muted)]">Loading developers...</p>

  if (devs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--line-strong)] p-12 text-center max-w-xl">
        <p className="text-[var(--muted)]">
          No developers available yet. Be the first — switch to "My Profile" and set your rate.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl">
      {devs.map((d) => (
        <div key={d.creatorId} className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 hover:border-[var(--accent)] transition-colors">
          <div className="flex items-center gap-3 mb-3">
            {d.avatarUrl ? (
              <img src={d.avatarUrl} alt="" className="w-10 h-10 rounded-full ring-1 ring-[var(--line-strong)]" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-sm font-bold">
                {(d.login ?? d.creatorId).charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-semibold text-[var(--ink)] truncate">{d.login ?? d.creatorId}</p>
              <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                <span className="font-bold text-[var(--accent)]">${(d.promptRateCents / 100).toFixed(2)}/prompt</span>
                {d.available && <span className="text-[var(--success)]">Available</span>}
              </div>
            </div>
          </div>

          {d.bioServices && (
            <p className="text-xs text-[var(--muted)] line-clamp-2 mb-3">{d.bioServices}</p>
          )}

          <div className="grid grid-cols-4 gap-2 text-center mb-3">
            <div>
              <p className="text-xs text-[var(--muted)]">Apps</p>
              <p className="text-sm font-bold text-[var(--ink)]">{d.appCount ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Quality</p>
              <p className="text-sm font-bold text-[var(--ink)]">{d.qualityScore?.toFixed(1) ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Jobs</p>
              <p className="text-sm font-bold text-[var(--ink)]">{d.completedEngagements}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Rating</p>
              <p className="text-sm font-bold text-[var(--ink)]">{d.avgRating ? `${d.avgRating.toFixed(1)}` : '—'}</p>
            </div>
          </div>

          {hiring === d.creatorId ? (
            <div className="space-y-2">
              <textarea rows={2} value={hireDesc} onChange={(e) => setHireDesc(e.target.value)}
                placeholder="Describe what you want built (optional)"
                className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1.5 text-xs" />
              <div className="flex gap-2">
                <button type="button" onClick={() => hire(d.creatorId)}
                  className="flex-1 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">Confirm</button>
                <button type="button" onClick={() => setHiring(null)}
                  className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--ink)]">Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setHiring(d.creatorId)}
              className="w-full rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
              Hire — ${(d.promptRateCents / 100).toFixed(2)}/prompt
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Engagements: list + service chat ─────────────────────────

interface Engagement {
  id: string
  clientId: string
  clientLogin: string | null
  developerId: string
  devLogin: string | null
  status: string
  promptRateCents: number
  promptsCount: number
  totalChargedCents: number
  role: 'client' | 'developer'
  createdAt: number
}

interface ServiceMessage {
  id: string
  senderRole: string
  body: string
  charged: boolean
  chargeCents: number
  createdAt: number
}

function EngagementsTab({ token }: { token: string | null }) {
  const [engs, setEngs] = useState<Engagement[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Engagement | null>(null)
  const [messages, setMessages] = useState<ServiceMessage[]>([])
  const [msgInput, setMsgInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return }
    try {
      const res = await fetch(`${API_BASE}/services/engagements`, { headers: authHeaders(token) })
      if (res.ok) setEngs(((await res.json()) as { engagements: Engagement[] }).engagements)
    } catch { /* */ }
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  const openChat = async (eng: Engagement) => {
    if (!token) return
    setSelected(eng)
    setLoadingMsgs(true)
    try {
      const res = await fetch(`${API_BASE}/services/engagements/${eng.id}/messages`, { headers: authHeaders(token) })
      if (res.ok) setMessages(((await res.json()) as { messages: ServiceMessage[] }).messages)
    } catch { /* */ }
    setLoadingMsgs(false)
  }

  // Poll messages when chat is open
  useEffect(() => {
    if (!selected || !token) return
    const poll = setInterval(async () => {
      if (document.hidden) return
      try {
        const res = await fetch(`${API_BASE}/services/engagements/${selected.id}/messages`, { headers: authHeaders(token) })
        if (res.ok) {
          const data = (await res.json()) as { messages: ServiceMessage[] }
          setMessages((prev) => data.messages.length !== prev.length ? data.messages : prev)
        }
      } catch { /* */ }
    }, 5000)
    return () => clearInterval(poll)
  }, [selected, token])

  const sendMsg = async () => {
    if (!token || !selected || !msgInput.trim()) return
    setSending(true)
    try {
      const res = await fetch(`${API_BASE}/services/engagements/${selected.id}/messages`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: msgInput.trim() }),
      })
      if (res.ok) {
        const msg = await res.json() as ServiceMessage
        setMessages((prev) => [...prev, msg])
        setMsgInput('')
        load() // refresh totals
      } else {
        const err = await res.json().catch(() => ({ error: 'failed' })) as { error: string }
        alert(err.error)
      }
    } catch (e) { alert((e as Error).message) }
    setSending(false)
  }

  const updateStatus = async (engId: string, status: string) => {
    if (!token) return
    await fetch(`${API_BASE}/services/engagements/${engId}`, {
      method: 'PATCH',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
    if (selected?.id === engId) setSelected(null)
  }

  if (loading) return <p className="py-8 text-center text-sm text-[var(--muted)]">Loading engagements...</p>

  if (selected) {
    return (
      <div className="max-w-2xl space-y-4">
        <button type="button" onClick={() => setSelected(null)}
          className="text-sm text-[var(--accent)] hover:underline">&larr; Back to engagements</button>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-bold text-[var(--ink)]">
                {selected.role === 'client' ? selected.devLogin ?? 'Developer' : selected.clientLogin ?? 'Client'}
              </h3>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                selected.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : selected.status === 'delivered' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
              }`}>{selected.status}</span>
            </div>
            <div className="text-right text-xs text-[var(--muted)]">
              <p>${(selected.promptRateCents / 100).toFixed(2)}/prompt · {selected.promptsCount} prompts</p>
              <p className="font-semibold">${(selected.totalChargedCents / 100).toFixed(2)} total</p>
            </div>
          </div>

          {selected.status === 'active' && (
            <div className="flex gap-2 mt-3">
              {selected.role === 'developer' && (
                <button type="button" onClick={() => updateStatus(selected.id, 'delivered')}
                  className="rounded-lg bg-[var(--success)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">Mark Delivered</button>
              )}
              <button type="button" onClick={() => { if (confirm('Cancel this engagement?')) updateStatus(selected.id, 'cancelled') }}
                className="rounded-lg border border-[var(--error)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--error)] hover:bg-[var(--error)]/10">Cancel</button>
            </div>
          )}
        </div>

        {/* Chat */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--line)]">
            <h3 className="text-sm font-bold text-[var(--ink)]">Service Chat</h3>
          </div>
          <div className="max-h-[400px] overflow-y-auto p-4 space-y-3">
            {loadingMsgs && <p className="text-xs text-[var(--muted)] text-center">Loading...</p>}
            {!loadingMsgs && messages.length === 0 && (
              <p className="text-xs text-[var(--muted)] text-center py-4">No messages yet. Start the conversation.</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.senderRole === (selected.role === 'client' ? 'client' : 'developer') ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 ${
                  m.senderRole === 'system' ? 'bg-[var(--panel-hover)] text-[var(--muted)] text-xs italic'
                  : m.senderRole === (selected.role === 'client' ? 'client' : 'developer') ? 'bg-[var(--accent)] text-white'
                  : 'border border-[var(--line)] bg-[var(--panel)]'
                }`}>
                  <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] opacity-60">
                    <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {m.charged && <span className="font-semibold">${(m.chargeCents / 100).toFixed(2)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {selected.status === 'active' && (
            <div className="p-3 border-t border-[var(--line)]">
              <div className="flex gap-2">
                <input value={msgInput} onChange={(e) => setMsgInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg() } }}
                  placeholder={selected.role === 'developer' ? `Send (charges client $${(selected.promptRateCents / 100).toFixed(2)})` : 'Send a message (free)'}
                  disabled={sending}
                  className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm disabled:opacity-50" />
                <button type="button" onClick={sendMsg} disabled={sending || !msgInput.trim()}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                  {sending ? '...' : 'Send'}
                </button>
              </div>
              {selected.role === 'developer' && (
                <p className="text-[10px] text-[var(--muted)] mt-1">Each message you send charges the client ${(selected.promptRateCents / 100).toFixed(2)}. You earn 90%.</p>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-3">
      {engs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--line-strong)] p-12 text-center">
          <p className="text-[var(--muted)]">No engagements yet. Hire a developer from the directory or post a build request.</p>
        </div>
      ) : engs.map((e) => (
        <button key={e.id} type="button" onClick={() => openChat(e)}
          className="w-full text-left rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 hover:border-[var(--accent)] transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold text-[var(--ink)]">
                {e.role === 'client' ? e.devLogin ?? 'Developer' : e.clientLogin ?? 'Client'}
              </span>
              <span className="text-xs text-[var(--muted)] ml-2">({e.role})</span>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              e.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : e.status === 'delivered' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            }`}>{e.status}</span>
          </div>
          <div className="text-xs text-[var(--muted)] mt-1">
            {e.promptsCount} prompts · ${(e.totalChargedCents / 100).toFixed(2)} · ${(e.promptRateCents / 100).toFixed(2)}/prompt
          </div>
        </button>
      ))}
    </div>
  )
}

// ── Build Requests ───────────────────────────────────────────

interface BuildRequest {
  id: string
  clientLogin: string
  title: string
  description: string
  budgetCents: number | null
  createdAt: number
}

function RequestsTab({ token }: { token: string | null }) {
  const [requests, setRequests] = useState<BuildRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [budget, setBudget] = useState('')
  const [posting, setPosting] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/services/requests`)
      if (res.ok) setRequests(((await res.json()) as { requests: BuildRequest[] }).requests)
    } catch { /* */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const post = async () => {
    if (!token || !title.trim() || !desc.trim()) return
    setPosting(true)
    try {
      const res = await fetch(`${API_BASE}/services/requests`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: desc.trim(),
          budgetCents: budget ? Math.round(parseFloat(budget) * 100) : undefined,
        }),
      })
      if (res.ok) { setShowNew(false); setTitle(''); setDesc(''); setBudget(''); load() }
      else { const err = await res.json().catch(() => ({ error: 'failed' })) as { error: string }; alert(err.error) }
    } catch (e) { alert((e as Error).message) }
    setPosting(false)
  }

  const accept = async (reqId: string) => {
    if (!token) return
    const res = await fetch(`${API_BASE}/services/requests/${reqId}/accept`, {
      method: 'POST',
      headers: authHeaders(token),
    })
    if (res.ok) { alert('Accepted! Check the Engagements tab.'); load() }
    else { const err = await res.json().catch(() => ({ error: 'failed' })) as { error: string }; alert(err.error) }
  }

  if (loading) return <p className="py-8 text-center text-sm text-[var(--muted)]">Loading requests...</p>

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="display-font text-lg font-bold text-[var(--ink)]">Build Requests</h3>
        <button type="button" onClick={() => setShowNew(!showNew)}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
          {showNew ? 'Cancel' : '+ Post Request'}
        </button>
      </div>

      {showNew && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-3">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What do you want built?"
            className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm" />
          <textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)}
            placeholder="Describe the app in detail — features, target users, any tech preferences..."
            className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--muted)]">Budget (optional): $</span>
            <input type="number" min="10" step="10" value={budget} onChange={(e) => setBudget(e.target.value)}
              placeholder="—"
              className="w-24 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm" />
          </div>
          <button type="button" onClick={post} disabled={posting || !title.trim() || !desc.trim()}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {posting ? 'Posting...' : 'Post Request'}
          </button>
        </div>
      )}

      {requests.length === 0 && !showNew && (
        <div className="rounded-2xl border border-dashed border-[var(--line-strong)] p-12 text-center">
          <p className="text-[var(--muted)]">No open build requests. Post one to find a developer, or browse the directory.</p>
        </div>
      )}

      {requests.map((r) => (
        <div key={r.id} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-[var(--ink)]">{r.title}</p>
              <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2">{r.description}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-[var(--muted)]">
                <span>by {r.clientLogin}</span>
                {r.budgetCents && <span className="font-semibold">Budget: ${(r.budgetCents / 100).toFixed(0)}</span>}
                <span>{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            <button type="button" onClick={() => accept(r.id)}
              className="flex-shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
              Accept
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Developer: own profile editor ────────────────────────────

function DeveloperTab({ token }: { token: string | null }) {
  const [profile, setProfile] = useState<DevProfile | null>(null)
  const [rate, setRate] = useState('1.00')
  const [bio, setBio] = useState('')
  const [available, setAvailable] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [loaded, setLoaded] = useState(false)

  // Load existing profile on mount
  useEffect(() => {
    if (!token) { setLoaded(true); return }
    fetch(`${API_BASE}/services/profile`, { headers: authHeaders(token) })
      .then(async (res) => {
        if (!res.ok) return
        const data = await res.json() as DevProfile & { exists: boolean }
        if (data.exists) {
          setProfile(data)
          setRate((data.promptRateCents / 100).toFixed(2))
          setBio(data.bioServices ?? '')
          setAvailable(data.available)
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [token])

  const save = async () => {
    if (!token) return
    setSaving(true)
    setSaveMsg('')
    try {
      const cents = Math.max(10, Math.min(5000, Math.round(parseFloat(rate || '1') * 100)))
      const res = await fetch(`${API_BASE}/services/profile`, {
        method: 'PUT',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptRateCents: cents, bioServices: bio || undefined, available }),
      })
      if (res.ok) {
        const p = await res.json() as DevProfile
        setProfile(p)
        setRate((p.promptRateCents / 100).toFixed(2))
        setBio(p.bioServices ?? '')
        setAvailable(p.available)
        setSaveMsg('Saved')
        setTimeout(() => setSaveMsg(''), 2000)
      } else {
        const err = await res.json().catch(() => ({ error: 'failed' })) as { error: string }
        setSaveMsg(err.error)
      }
    } catch (e) { setSaveMsg((e as Error).message) }
    setSaving(false)
  }

  if (!loaded) return <p className="py-8 text-center text-sm text-[var(--muted)]">Loading...</p>

  return (
    <div className="space-y-4 max-w-xl">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 space-y-4">
        <h3 className="display-font text-lg font-bold text-[var(--ink)]">Developer Profile</h3>
        <p className="text-sm text-[var(--muted)]">
          Set your per-prompt rate and availability. Clients see this in the developer directory.
        </p>

        <label className="block">
          <span className="text-sm font-medium text-[var(--ink)]">Rate per prompt ($)</span>
          <input type="number" min="0.10" max="50" step="0.10" value={rate}
            onChange={(e) => setRate(e.target.value)} placeholder="1.00"
            className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm" />
          <span className="text-xs text-[var(--muted)] mt-1 block">$0.10–$50. Client pays this per dev message. You earn 90%.</span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-[var(--ink)]">Services bio</span>
          <textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)}
            placeholder="What kind of apps do you build? Your specialty, stack, experience."
            className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm" />
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)}
            className="rounded border-[var(--line-strong)]" />
          <span className="text-sm text-[var(--ink)]">Available for new clients</span>
        </label>

        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={saving}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
          {saveMsg && (
            <span className={`text-xs ${saveMsg === 'Saved' ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>{saveMsg}</span>
          )}
        </div>
      </div>

      {profile && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
          <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">Your Stats</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Quality score" value={profile.qualityScore?.toFixed(1) ?? '—'} suffix="/10" />
            <Stat label="Avg prompt" value={profile.avgPromptLength ? `${profile.avgPromptLength}` : '—'} suffix=" chars" />
            <Stat label="Engagements" value={String(profile.completedEngagements)} />
            <Stat label="Rating" value={profile.avgRating ? `${profile.avgRating.toFixed(1)}/5` : '—'} suffix={profile.ratingCount ? ` (${profile.ratingCount})` : ''} />
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div>
      <span className="text-[var(--muted)] text-xs">{label}</span>
      <p className="font-bold text-[var(--ink)]">{value}{suffix}</p>
    </div>
  )
}

// ── Client: balance + top-up + transactions ──────────────────

function ClientTab({ token }: { token: string | null }) {
  const [balance, setBalance] = useState<Balance | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [depositAmount, setDepositAmount] = useState('10')
  const [depositing, setDepositing] = useState(false)

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return }
    try {
      const [balRes, txRes] = await Promise.all([
        fetch(`${API_BASE}/services/balance`, { headers: authHeaders(token) }),
        fetch(`${API_BASE}/services/balance/transactions`, { headers: authHeaders(token) }),
      ])
      if (balRes.ok) setBalance(await balRes.json())
      if (txRes.ok) setTransactions(((await txRes.json()) as { transactions: Transaction[] }).transactions)
    } catch { /* */ }
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  // Confirm deposit on return from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session_id')
    if (!sessionId || !token) return
    window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    fetch(`${API_BASE}/services/balance/confirm`, {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).then((res) => { if (res.ok) load() }).catch(() => {})
  }, [token, load])

  const deposit = async () => {
    if (!token) return
    const cents = Math.round(parseFloat(depositAmount) * 100)
    if (cents < 1000) return
    setDepositing(true)
    try {
      const res = await fetch(`${API_BASE}/services/balance/deposit`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: cents,
          successUrl: window.location.href,
          cancelUrl: window.location.href,
        }),
      })
      if (res.ok) {
        window.location.href = ((await res.json()) as { url: string }).url
      }
    } catch { /* */ }
    setDepositing(false)
  }

  if (loading) return <p className="py-8 text-center text-sm text-[var(--muted)]">Loading balance...</p>

  return (
    <div className="space-y-4 max-w-xl">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
        <h3 className="display-font text-lg font-bold text-[var(--ink)] mb-1">Balance</h3>
        <div className="display-font text-3xl font-bold text-[var(--ink)]">
          ${((balance?.balanceCents ?? 0) / 100).toFixed(2)}
        </div>
        <div className="text-xs text-[var(--muted)] mt-1">
          Deposited: ${((balance?.totalDepositedCents ?? 0) / 100).toFixed(2)} · Spent: ${((balance?.totalSpentCents ?? 0) / 100).toFixed(2)}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <span className="text-sm text-[var(--ink)]">$</span>
          <input type="number" min="10" step="5" value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            className="w-24 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm" />
          <button type="button" onClick={deposit} disabled={depositing || parseFloat(depositAmount) < 10}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {depositing ? 'Redirecting...' : 'Top Up'}
          </button>
        </div>
        <p className="text-xs text-[var(--muted)] mt-2">Min $10 via Stripe. Used when a developer works on your project.</p>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">Transactions</h3>
        {transactions.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No transactions yet. Top up to get started.</p>
        ) : (
          <div className="space-y-1">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between text-sm py-1.5 border-b border-[var(--line)] last:border-0">
                <div>
                  <span className={`font-semibold ${tx.amountCents > 0 ? 'text-[var(--success)]' : 'text-[var(--ink)]'}`}>
                    {tx.amountCents > 0 ? '+' : ''}${(tx.amountCents / 100).toFixed(2)}
                  </span>
                  <span className="text-[var(--muted)] ml-2">{tx.description ?? tx.type}</span>
                </div>
                <span className="text-xs text-[var(--muted)]">{new Date(tx.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
