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

type Tab = 'directory' | 'developer' | 'client'

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

      {tab === 'directory' && <DirectoryTab />}
      {tab === 'developer' && <DeveloperTab token={token} />}
      {tab === 'client' && <ClientTab token={token} />}
    </div>
  )
}

// ── Directory: browse available developers ───────────────────

function DirectoryTab() {
  const [devs, setDevs] = useState<DevProfile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/services/developers`)
      .then(async (r) => { if (r.ok) setDevs(((await r.json()) as { developers: DevProfile[] }).developers) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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

          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-[var(--muted)]">Quality</p>
              <p className="text-sm font-bold text-[var(--ink)]">{d.qualityScore?.toFixed(1) ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Done</p>
              <p className="text-sm font-bold text-[var(--ink)]">{d.completedEngagements}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Rating</p>
              <p className="text-sm font-bold text-[var(--ink)]">
                {d.avgRating ? `${d.avgRating.toFixed(1)}` : '—'}
              </p>
            </div>
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
    // The GET /services/developers endpoint is public — we'd need to know our own
    // creator_id to find ourselves. Instead, just PUT with no changes to get back
    // the current state (upsert is idempotent with same values).
    // Cleaner: add a GET /services/profile route. For now, just let the user fill in.
    setLoaded(true)
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
