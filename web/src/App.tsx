import { useState, useEffect, useCallback } from 'react'
import { initPro } from '@proappstore/sdk'
import type { User, Subscription } from '@proappstore/sdk'
import { PublishView } from './PublishView'
import { AppDetail } from './AppDetail'
import { AdminView } from './AdminView'
import { fetchOwnerSummary, formatNumber, type OwnerSummary } from './usage'

const pro = initPro({ appId: 'console' })

type View = 'dashboard' | 'app-detail' | 'publish' | 'subscription' | 'admin' | 'settings'

interface AppEntry {
  id: string
  name: string
  /** ISO timestamp string, derived from the backend's created_at (epoch ms). */
  createdAt: string
  category?: string | null
  description?: string | null
  hasSubmission?: boolean
  submissionStatus?: string | null
}

const API_BASE = 'https://api.proappstore.online/v1'

interface AppApiRow {
  id: string
  creator_id: string
  created_at: number
  d1_database_id: string
  name: string
  category: string | null
  description: string | null
  icon: string | null
  icon_bg: string | null
  pro_features: string[] | null
  has_submission: boolean
  submission_status: string | null
}

/**
 * Fetch the signed-in user's apps from the platform API. Source of truth is
 * the `apps` table (every successful `pas create` / `pas publish` /
 * `/v1/submissions/:id/approve` INSERTs a row). Falls back to an empty list
 * on auth or network errors so the UI degrades gracefully.
 */
async function fetchApps(token: string | null): Promise<AppEntry[]> {
  if (!token) return []
  const res = await fetch(`${API_BASE}/apps`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return []
  const data = (await res.json()) as { apps: AppApiRow[] }
  return (data.apps ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    createdAt: new Date(a.created_at).toISOString(),
    category: a.category,
    description: a.description,
    hasSubmission: a.has_submission,
    submissionStatus: a.submission_status,
  }))
}

async function deleteAppApi(token: string | null, id: string): Promise<boolean> {
  if (!token) return false
  const res = await fetch(`${API_BASE}/apps/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.ok
}

/**
 * Probe whether the signed-in user is a platform admin. Backed by
 * `GET /v1/me/is-admin` which checks ADMIN_GITHUB_IDS — same membership
 * the approve/reject gates use, so this is authoritative (not a heuristic).
 * Falls back to `false` on any error so a flaky network never accidentally
 * shows the Admin tab.
 */
async function fetchIsAdmin(token: string | null): Promise<boolean> {
  if (!token) return false
  try {
    const res = await fetch(`${API_BASE}/me/is-admin`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return false
    const data = (await res.json()) as { admin?: boolean }
    return data.admin === true
  } catch {
    return false
  }
}

type Theme = 'system' | 'light' | 'dark'

interface Prefs {
  theme: Theme
}

const DEFAULT_PREFS: Prefs = {
  theme: 'system',
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<View>('dashboard')
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
  const [apps, setApps] = useState<AppEntry[]>([])
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    pro.auth.init().then(() => setReady(true))
    return pro.auth.onChange(setUser)
  }, [])

  const reloadApps = useCallback(async () => {
    try { setApps(await fetchApps(pro.auth.token)) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (user) reloadApps()
  }, [user, reloadApps])

  useEffect(() => {
    if (!user) { setIsAdmin(false); return }
    let cancelled = false
    fetchIsAdmin(pro.auth.token).then((admin) => {
      if (!cancelled) setIsAdmin(admin)
    })
    return () => { cancelled = true }
  }, [user])

  const openAppDetail = useCallback((id: string) => {
    setSelectedAppId(id)
    setView('app-detail')
  }, [])

  const deleteSelectedApp = useCallback(async () => {
    if (!selectedAppId) return
    const ok = await deleteAppApi(pro.auth.token, selectedAppId)
    if (ok) {
      await pro.kv.delete(`app-config:${selectedAppId}`).catch(() => {})
      setApps((prev) => prev.filter((a) => a.id !== selectedAppId))
      setSelectedAppId(null)
      setView('dashboard')
    }
  }, [selectedAppId])

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <p className="text-[var(--muted)]">Loading...</p>
      </div>
    )
  }

  if (!user) return <Landing />

  const selected = apps.find((a) => a.id === selectedAppId)

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Header user={user} view={view} onNavigate={setView} isAdmin={isAdmin} />
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        {view === 'dashboard' && (
          <Dashboard
            user={user}
            apps={apps}
            onOpenApp={openAppDetail}
            onPublishNew={() => setView('publish')}
          />
        )}
        {view === 'app-detail' && selectedAppId && (
          <AppDetail
            appId={selectedAppId}
            appName={selected?.name ?? null}
            getToken={() => pro.auth.token}
            onBack={() => setView('dashboard')}
            onDelete={deleteSelectedApp}
          />
        )}
        {view === 'publish' && <PublishView getToken={() => pro.auth.token} />}
        {view === 'subscription' && <SubscriptionView />}
        {view === 'admin' && isAdmin && <AdminView getToken={() => pro.auth.token} />}
        {view === 'settings' && <Settings />}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Landing (signed out)
// ---------------------------------------------------------------------------

function Landing() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="display-font text-4xl font-bold text-[var(--ink)]">Creator Console</h1>
        <p className="mt-4 text-[var(--muted)] text-lg">
          Sign in with GitHub to manage your apps on ProAppStore.
        </p>
        <button
          onClick={() => pro.auth.signIn()}
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90"
        >
          <GitHubIcon />
          Sign in with GitHub
        </button>
        <p className="mt-6 text-xs text-[var(--muted)]">
          Part of{' '}
          <a href="https://proappstore.online" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--ink)]">
            ProAppStore
          </a>
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header + Nav
// ---------------------------------------------------------------------------

const TABS: { key: View; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'publish', label: 'Publish' },
  { key: 'subscription', label: 'Subscription' },
  { key: 'settings', label: 'Settings' },
]

function Header({ user, view, onNavigate, isAdmin }: { user: User; view: View; onNavigate: (v: View) => void; isAdmin: boolean }) {
  // Admin tab is inserted before Settings only when the backend confirms
  // the signed-in user is in ADMIN_GITHUB_IDS. Non-admins never see it.
  const tabs: { key: View; label: string }[] = isAdmin
    ? [...TABS.slice(0, -1), { key: 'admin', label: 'Admin' }, TABS[TABS.length - 1]!]
    : TABS
  return (
    <header className="border-b border-[var(--line)] bg-[var(--glass-strong)] backdrop-blur-xl sticky top-0 z-30">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <button
            onClick={() => onNavigate('dashboard')}
            className="display-font text-lg font-bold text-[var(--ink)] tracking-tight"
          >
            Creator Console
          </button>
          <div className="flex items-center gap-3">
            {user.avatarUrl && (
              <img
                src={user.avatarUrl}
                alt={user.login}
                className="h-7 w-7 rounded-full ring-1 ring-[var(--line-strong)]"
              />
            )}
            <span className="hidden sm:inline text-sm font-medium text-[var(--muted)]">{user.login}</span>
            <button
              onClick={() => pro.auth.signOut()}
              className="text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] underline"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="flex gap-1 -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onNavigate(tab.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                (view === tab.key || (view === 'app-detail' && tab.key === 'dashboard'))
                  ? 'border-[var(--accent)] text-[var(--ink)]'
                  : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({
  user, apps, onOpenApp, onPublishNew,
}: {
  user: User
  apps: AppEntry[]
  onOpenApp: (id: string) => void
  onPublishNew: () => void
}) {
  const [sub, setSub] = useState<Subscription | null>(null)
  const [summary, setSummary] = useState<OwnerSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      pro.subscription.status().catch(() => null),
      fetchOwnerSummary(pro.auth.token, 30),
    ])
      .then(([s, sum]) => {
        if (cancelled) return
        setSub(s)
        setSummary(sum)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <p className="text-[var(--muted)] py-12 text-center">Loading dashboard...</p>
  }

  return (
    <div className="space-y-8">
      {/* Welcome card */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--glass-strong)] p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-4">
          {user.avatarUrl && (
            <img src={user.avatarUrl} alt="" className="h-14 w-14 rounded-full ring-2 ring-[var(--line-strong)]" />
          )}
          <div>
            <h2 className="display-font text-2xl font-bold text-[var(--ink)]">
              Welcome, {user.login}
            </h2>
            <div className="mt-1 flex items-center gap-2">
              <PlanBadge sub={sub} />
            </div>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Apps" value={apps.length} />
        <StatCard
          label="Active 30d"
          value={summary ? formatNumber(summary.activeUsers) : '—'}
        />
        <StatCard label="Plan" value={sub?.status === 'active' ? 'Pro' : 'Free'} />
      </div>

      {/* Apps list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="display-font text-xl font-bold text-[var(--ink)]">Your Apps</h3>
          <button
            type="button"
            onClick={onPublishNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            + Publish New App
          </button>
        </div>

        {apps.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line-strong)] p-12 text-center">
            <p className="text-[var(--muted)]">
              No apps yet.{' '}
              <button type="button" onClick={onPublishNew} className="text-[var(--accent)] font-semibold underline">
                Submit your first app
              </button>{' '}
              for review.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {apps.map((a) => (
              <button
                key={a.id}
                onClick={() => onOpenApp(a.id)}
                className="text-left rounded-xl border border-[var(--line)] bg-[var(--glass)] p-4 hover:bg-[var(--glass-hover)] shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--ink)]">{a.name}</span>
                  <AppStatusBadge submissionStatus={a.submissionStatus} hasSubmission={a.hasSubmission} />
                </div>
                <p className="mt-1 text-xs text-[var(--muted)] font-mono">{a.id}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Created {new Date(a.createdAt).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// AppDetail moved to ./AppDetail.tsx — multi-section listing editor

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

interface Pricing {
  proMonthly: { priceId: string; currency: string; dollars: number } | null
}

async function fetchPricing(): Promise<Pricing | null> {
  try {
    const res = await fetch(`${API_BASE}/pricing`)
    if (!res.ok) return null
    return (await res.json()) as Pricing
  } catch {
    return null
  }
}

function SubscriptionView() {
  const [sub, setSub] = useState<Subscription | null>(null)
  const [pricing, setPricing] = useState<Pricing | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      pro.subscription.status().catch(() => null),
      fetchPricing(),
    ])
      .then(([s, p]) => {
        if (cancelled) return
        setSub(s)
        setPricing(p)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <p className="text-[var(--muted)] py-12 text-center">Loading subscription...</p>
  }

  const isPro = sub?.status === 'active'
  const monthly = pricing?.proMonthly
  const dollars = monthly?.dollars ?? 9

  return (
    <div className="space-y-8">
      <h2 className="display-font text-2xl font-bold text-[var(--ink)]">Subscription</h2>

      {/* Current plan */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--glass-strong)] p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3 mb-4">
          <PlanBadge sub={sub} />
          <span className="text-sm text-[var(--muted)]">Current plan</span>
        </div>

        {isPro && sub ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--ink)]">
              Your Pro subscription is active.
              {sub.cancelAtPeriodEnd && ' It will not renew after the current period.'}
            </p>
            <p className="text-sm text-[var(--muted)]">
              Renewal: {new Date(sub.currentPeriodEnd).toLocaleDateString()}
            </p>
            <button
              onClick={() => pro.subscription.openPortal(window.location.href)}
              className="rounded-lg border border-[var(--line-strong)] bg-[var(--glass)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--glass-hover)]"
            >
              Manage Billing
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              {monthly
                ? `One subscription unlocks every Pro app on the platform — $${dollars}/mo, cancel anytime.`
                : "Pro subscriptions aren't configured on this platform yet. Check back soon."}
            </p>
            <button
              disabled={!monthly}
              onClick={() => {
                if (!monthly) return
                pro.subscription.openCheckout({
                  priceId: monthly.priceId,
                  successUrl: window.location.href,
                  cancelUrl: window.location.href,
                })
              }}
              className="rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {monthly ? `Upgrade to Pro — $${dollars}/mo` : 'Upgrade unavailable'}
            </button>
          </div>
        )}
      </div>

      {/* Where your $9 goes — pool model explainer (replaces the old feature
          comparison table, which described feature-gating that doesn't exist
          on PAS). */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--glass-strong)] p-6">
        <h3 className="display-font text-lg font-bold text-[var(--ink)] mb-2">Where your ${dollars} goes</h3>
        <p className="text-sm text-[var(--muted)] mb-4">
          ProAppStore is one subscription for every Pro app — no per-app prices, no in-app upgrades.
          Creators are paid monthly from the subscription pool in proportion to how much each
          subscriber actually used their app.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--glass)] p-4">
            <p className="text-2xl font-bold text-[var(--ink)]">90%</p>
            <p className="text-xs text-[var(--muted)] mt-1">
              Goes to creators of the apps you used this month, weighted by your usage of each.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--glass)] p-4">
            <p className="text-2xl font-bold text-[var(--ink)]">10%</p>
            <p className="text-xs text-[var(--muted)] mt-1">
              Platform fee — covers hosting, databases, file storage, real-time, payments.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--glass)] p-4">
            <p className="text-2xl font-bold text-[var(--ink)]">0</p>
            <p className="text-xs text-[var(--muted)] mt-1">
              Ads. Trackers. Data sold. Per-app paywalls. None of the above.
            </p>
          </div>
        </div>
        <p className="text-xs text-[var(--muted)] mt-4">
          Full mechanics, edge cases, and the math:{' '}
          <a href="https://proappstore.online/pricing" target="_blank" rel="noopener noreferrer" className="underline text-[var(--accent)]">
            proappstore.online/pricing
          </a>
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function Settings() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    pro.kv.get<Prefs>('prefs')
      .then((p) => { if (!cancelled && p) setPrefs(p) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const save = async (updated: Prefs) => {
    setPrefs(updated)
    setSaving(true)
    try {
      await pro.kv.set('prefs', updated)
      // Apply theme
      if (updated.theme === 'dark') {
        document.documentElement.dataset.theme = 'dark'
      } else if (updated.theme === 'light') {
        delete document.documentElement.dataset.theme
      } else {
        if (matchMedia('(prefers-color-scheme: dark)').matches) {
          document.documentElement.dataset.theme = 'dark'
        } else {
          delete document.documentElement.dataset.theme
        }
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-[var(--muted)] py-12 text-center">Loading settings...</p>
  }

  return (
    <div className="space-y-8">
      <h2 className="display-font text-2xl font-bold text-[var(--ink)]">Settings</h2>

      {/* Theme */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--glass-strong)] p-6">
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">Theme</h3>
        <div className="flex gap-2">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button
              key={t}
              onClick={() => save({ ...prefs, theme: t })}
              className={`rounded-lg px-4 py-2 text-sm font-medium capitalize ${
                prefs.theme === t
                  ? 'bg-[var(--accent)] text-white'
                  : 'border border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {saving && (
        <p className="text-xs text-[var(--muted)] text-center">Saving...</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function PlanBadge({ sub }: { sub: Subscription | null }) {
  const isPro = sub?.status === 'active'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
        isPro
          ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
          : 'bg-[var(--line)] text-[var(--muted)]'
      }`}
    >
      {isPro ? 'Pro' : 'Free'}
    </span>
  )
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--glass)] p-4">
      <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">{label}</p>
      <p className="mt-1 display-font text-2xl font-bold text-[var(--ink)]">{value}</p>
    </div>
  )
}

function AppStatusBadge({ submissionStatus, hasSubmission }: { submissionStatus?: string | null; hasSubmission?: boolean }) {
  // The apps table only has a row when provisioning succeeded, so by default
  // every entry is "Live." If the dev's latest submission for this app is
  // pending or rejected (e.g. a re-submission for changes), surface that.
  let label: string
  let cls: string
  if (hasSubmission && submissionStatus === 'pending') {
    label = 'In review'
    cls = 'bg-[var(--warning)]/15 text-[var(--warning)]'
  } else if (hasSubmission && submissionStatus === 'rejected') {
    label = 'Rejected'
    cls = 'bg-[var(--error)]/15 text-[var(--error)]'
  } else {
    label = 'Live'
    cls = 'bg-[var(--success)]/15 text-[var(--success)]'
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  )
}

// (The Toggle component lived here. Removed alongside the fake email-
// notifications + weekly-digest controls in Settings — those wired to
// per-user KV but no backend ever read them. Restore from git history
// if a real toggle is wanted.)

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}
