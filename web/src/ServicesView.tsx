import { useState, useEffect, useRef } from 'react'
import { API_BASE, authHeaders } from './api'
import type { DevProfile } from './servicesTypes'
import { DirectoryTab } from './ServicesDirectory'
import { EngagementsTab } from './ServicesEngagements'
import { RequestsTab } from './ServicesRequests'

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

// ── Developer: own profile editor ────────────────────────────

function DeveloperTab({ token }: { token: string | null }) {
  const [profile, setProfile] = useState<DevProfile | null>(null)
  const [rate, setRate] = useState('1.00')
  const [bio, setBio] = useState('')
  const [available, setAvailable] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) { setLoaded(true); return }
    fetch(`${API_BASE}/services/profile`, { headers: authHeaders(token) })
      .then(async (res) => {
        if (!res.ok) { setLoadError('Failed to load profile'); return }
        const data = await res.json() as DevProfile & { exists: boolean }
        if (data.exists) {
          setProfile(data)
          setRate((data.promptRateCents / 100).toFixed(2))
          setBio(data.bioServices ?? '')
          setAvailable(data.available)
        }
      })
      .catch(() => setLoadError('Network error'))
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
  if (loadError) return <p className="py-8 text-center text-sm text-[var(--error)]">{loadError}</p>

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
  const [balance, setBalance] = useState<{ balanceCents: number; totalDepositedCents: number; totalSpentCents: number } | null>(null)
  const [transactions, setTransactions] = useState<{ id: string; type: string; amountCents: number; description: string | null; createdAt: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [depositAmount, setDepositAmount] = useState('10')
  const [depositing, setDepositing] = useState(false)

  useEffect(() => {
    if (!token) { setLoading(false); return }
    Promise.all([
      fetch(`${API_BASE}/services/balance`, { headers: authHeaders(token) }).then(r => r.ok ? r.json() : null),
      fetch(`${API_BASE}/services/balance/transactions`, { headers: authHeaders(token) }).then(r => r.ok ? r.json() : null),
    ]).then(([bal, tx]) => {
      if (bal) setBalance(bal as typeof balance)
      if (tx) setTransactions((tx as { transactions: typeof transactions }).transactions)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [token])

  // Confirm deposit on return from Stripe. The session_id is in the query
  // string (before the hash) because the backend constructs the URL that way.
  const confirmedRef = useRef(false)
  useEffect(() => {
    if (confirmedRef.current) return
    const sessionId = new URLSearchParams(window.location.search).get('session_id')
    if (!sessionId || !token) return
    confirmedRef.current = true
    // Strip the query param, keep the hash
    const clean = window.location.pathname + window.location.hash
    window.history.replaceState({}, '', clean)
    fetch(`${API_BASE}/services/balance/confirm`, {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).then((res) => {
      if (res.ok) window.location.reload()
    }).catch(() => {})
  }, [token])

  const [depositError, setDepositError] = useState<string | null>(null)

  const deposit = async () => {
    if (!token) return
    const cents = Math.round(parseFloat(depositAmount) * 100)
    if (cents < 1000) return
    setDepositing(true)
    setDepositError(null)
    try {
      const res = await fetch(`${API_BASE}/services/balance/deposit`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: cents, successUrl: window.location.href, cancelUrl: window.location.href }),
      })
      if (res.ok) window.location.href = ((await res.json()) as { url: string }).url
      else {
        const err = await res.json().catch(() => ({ error: 'Deposit failed' })) as { error: string }
        setDepositError(err.error)
      }
    } catch (e) { setDepositError((e as Error).message) }
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
            aria-label="Deposit amount"
            className="w-24 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm" />
          <button type="button" onClick={deposit} disabled={depositing || parseFloat(depositAmount) < 10}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {depositing ? 'Redirecting...' : 'Top Up'}
          </button>
        </div>
        {depositError && <p className="text-xs text-[var(--error)] mt-2">{depositError}</p>}
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
