import { useState, useEffect, useCallback } from 'react'
import { API_BASE, authHeaders } from './api'

/**
 * Services tab — dual-role view:
 *   - As a developer: set your rate, toggle availability, see stats
 *   - As a client: see balance, top up, view transactions
 */

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

export function ServicesView({ getToken }: { getToken: () => string | null }) {
  const [tab, setTab] = useState<'developer' | 'client'>('developer')
  const [profile, setProfile] = useState<DevProfile | null>(null)
  const [balance, setBalance] = useState<Balance | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  // Editable fields
  const [rate, setRate] = useState('')
  const [bio, setBio] = useState('')
  const [available, setAvailable] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Deposit
  const [depositAmount, setDepositAmount] = useState('10')
  const [depositing, setDepositing] = useState(false)

  const token = getToken()

  const loadProfile = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/services/balance`, { headers: authHeaders(token) })
      if (res.ok) setBalance(await res.json())
    } catch { /* */ }
    try {
      // Try to load own dev profile by fetching the profile endpoint
      const res = await fetch(`${API_BASE}/services/profile`, {
        method: 'PUT',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        // Send current defaults to upsert — this is a no-op if profile exists
        // Actually, let's just list developers and find ourselves... or use a GET.
        // For now, use GET /services/developers and find by token. But we don't have
        // a dedicated "get my profile" endpoint. Let's just try creating with defaults.
      })
      // Actually the PUT is create/update. Let me use a different approach.
    } catch { /* */ }
    setLoading(false)
  }, [token])

  const loadAll = useCallback(async () => {
    if (!token) { setLoading(false); return }
    try {
      const [balRes, txRes] = await Promise.all([
        fetch(`${API_BASE}/services/balance`, { headers: authHeaders(token) }),
        fetch(`${API_BASE}/services/balance/transactions`, { headers: authHeaders(token) }),
      ])
      if (balRes.ok) setBalance(await balRes.json())
      if (txRes.ok) {
        const data = await txRes.json() as { transactions: Transaction[] }
        setTransactions(data.transactions)
      }
    } catch { /* */ }
    setLoading(false)
  }, [token])

  useEffect(() => { loadAll() }, [loadAll])

  const saveProfile = async () => {
    if (!token) return
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await fetch(`${API_BASE}/services/profile`, {
        method: 'PUT',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptRateCents: Math.round(parseFloat(rate || '1') * 100),
          bioServices: bio || undefined,
          available,
        }),
      })
      if (res.ok) {
        const p = await res.json() as DevProfile
        setProfile(p)
        setRate((p.promptRateCents / 100).toString())
        setBio(p.bioServices ?? '')
        setAvailable(p.available)
        setSaveMsg('Saved')
        setTimeout(() => setSaveMsg(''), 2000)
      } else {
        const err = await res.json().catch(() => ({ error: 'failed' })) as { error: string }
        setSaveMsg(err.error)
      }
    } catch (e) {
      setSaveMsg((e as Error).message)
    }
    setSaving(false)
  }

  const startDeposit = async () => {
    if (!token) return
    const cents = Math.round(parseFloat(depositAmount) * 100)
    if (cents < 1000) { alert('Minimum deposit is $10'); return }
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
        const data = await res.json() as { url: string }
        window.location.href = data.url
      } else {
        const err = await res.json().catch(() => ({ error: 'failed' })) as { error: string }
        alert(err.error)
      }
    } catch (e) {
      alert((e as Error).message)
    }
    setDepositing(false)
  }

  // On return from Stripe, try to confirm the deposit
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session_id')
    if (!sessionId || !token) return
    // Clean the URL
    window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    // Confirm the deposit
    fetch(`${API_BASE}/services/balance/confirm`, {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).then(async (res) => {
      if (res.ok) loadAll()
    }).catch(() => { /* */ })
  }, [token, loadAll])

  if (loading) return <p className="py-12 text-center text-[var(--muted)]">Loading services...</p>

  return (
    <div className="space-y-6">
      <h2 className="display-font text-2xl font-bold text-[var(--ink)]">Services</h2>
      <p className="text-sm text-[var(--muted)]">
        Build apps for clients or hire a developer. Per-prompt billing, 10% platform fee.
      </p>

      {/* Tab switch */}
      <div className="flex items-center gap-0.5 rounded-lg border border-[var(--line-strong)] p-0.5 w-fit">
        {(['developer', 'client'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md capitalize transition-colors ${
              tab === t ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--ink)]'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'developer' && (
        <div className="space-y-4 max-w-xl">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 space-y-4">
            <h3 className="display-font text-lg font-bold text-[var(--ink)]">Developer Profile</h3>
            <p className="text-sm text-[var(--muted)]">
              Set your per-prompt rate and availability. Clients see this when browsing the developer directory.
            </p>

            <label className="block">
              <span className="text-sm font-medium text-[var(--ink)]">Rate per prompt ($)</span>
              <input
                type="number"
                min="0.10"
                max="50"
                step="0.10"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="1.00"
                className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm"
              />
              <span className="text-xs text-[var(--muted)] mt-1 block">Min $0.10, max $50. Client pays this per dev message.</span>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-[var(--ink)]">Services bio</span>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="What kind of apps do you build? What's your specialty?"
                className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm"
              />
            </label>

            <label className="flex items-center gap-2">
              <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
              <span className="text-sm text-[var(--ink)]">Available for new clients</span>
            </label>

            <div className="flex items-center gap-3">
              <button type="button" onClick={saveProfile} disabled={saving}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
              {saveMsg && (
                <span className={`text-xs ${saveMsg === 'Saved' ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>
                  {saveMsg}
                </span>
              )}
            </div>
          </div>

          {profile && (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
              <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">Stats</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-[var(--muted)]">Quality score</span>
                  <p className="font-bold text-[var(--ink)]">{profile.qualityScore?.toFixed(1) ?? '—'}/10</p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">Avg prompt length</span>
                  <p className="font-bold text-[var(--ink)]">{profile.avgPromptLength ?? '—'} chars</p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">Engagements</span>
                  <p className="font-bold text-[var(--ink)]">{profile.completedEngagements}</p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">Rating</span>
                  <p className="font-bold text-[var(--ink)]">
                    {profile.avgRating ? `${profile.avgRating.toFixed(1)}/5 (${profile.ratingCount})` : '—'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'client' && (
        <div className="space-y-4 max-w-xl">
          {/* Balance card */}
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
            <h3 className="display-font text-lg font-bold text-[var(--ink)] mb-2">Balance</h3>
            <div className="display-font text-3xl font-bold text-[var(--ink)]">
              ${((balance?.balanceCents ?? 0) / 100).toFixed(2)}
            </div>
            <div className="text-xs text-[var(--muted)] mt-1">
              Deposited: ${((balance?.totalDepositedCents ?? 0) / 100).toFixed(2)} · Spent: ${((balance?.totalSpentCents ?? 0) / 100).toFixed(2)}
            </div>

            <div className="flex items-center gap-2 mt-4">
              <span className="text-sm text-[var(--ink)]">$</span>
              <input
                type="number"
                min="10"
                step="5"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="w-24 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm"
              />
              <button type="button" onClick={startDeposit} disabled={depositing}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {depositing ? 'Redirecting...' : 'Top Up'}
              </button>
            </div>
            <p className="text-xs text-[var(--muted)] mt-2">Minimum $10. Pays via Stripe. Balance is used when developers work on your projects.</p>
          </div>

          {/* Transaction history */}
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
            <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">Transactions</h3>
            {transactions.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No transactions yet.</p>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between text-sm py-1.5 border-b border-[var(--line)] last:border-0">
                    <div>
                      <span className={`font-semibold ${tx.amountCents > 0 ? 'text-[var(--success)]' : 'text-[var(--ink)]'}`}>
                        {tx.amountCents > 0 ? '+' : ''}${(tx.amountCents / 100).toFixed(2)}
                      </span>
                      <span className="text-[var(--muted)] ml-2">{tx.description ?? tx.type}</span>
                    </div>
                    <span className="text-xs text-[var(--muted)]">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
