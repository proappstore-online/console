import { useState, useEffect, useCallback } from 'react'
import { initPro } from '@proappstore/sdk'
import type { User, Subscription } from '@proappstore/sdk'
import { PublishView } from './PublishView'

const pro = initPro({ appId: 'console' })

type View = 'dashboard' | 'app-detail' | 'publish' | 'subscription' | 'settings'

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

interface AppConfig {
  description: string
}

type Theme = 'system' | 'light' | 'dark'

interface Prefs {
  theme: Theme
  emailNotifications: boolean
  weeklyDigest: boolean
}

const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  emailNotifications: true,
  weeklyDigest: false,
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<View>('dashboard')
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)

  useEffect(() => {
    pro.auth.init().then(() => setReady(true))
    return pro.auth.onChange(setUser)
  }, [])

  const openAppDetail = useCallback((id: string) => {
    setSelectedAppId(id)
    setView('app-detail')
  }, [])

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <p className="text-[var(--muted)]">Loading...</p>
      </div>
    )
  }

  if (!user) return <Landing />

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Header user={user} view={view} onNavigate={setView} />
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        {view === 'dashboard' && <Dashboard user={user} onOpenApp={openAppDetail} />}
        {view === 'app-detail' && selectedAppId && (
          <AppDetail appId={selectedAppId} onBack={() => setView('dashboard')} />
        )}
        {view === 'publish' && <PublishView getToken={() => pro.auth.token} />}
        {view === 'subscription' && <SubscriptionView />}
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

function Header({ user, view, onNavigate }: { user: User; view: View; onNavigate: (v: View) => void }) {
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
          {TABS.map((tab) => (
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

function Dashboard({ user, onOpenApp }: { user: User; onOpenApp: (id: string) => void }) {
  const [apps, setApps] = useState<AppEntry[]>([])
  const [sub, setSub] = useState<Subscription | null>(null)
  const [totalViews, setTotalViews] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [list, subResult] = await Promise.all([
          fetchApps(pro.auth.token),
          pro.subscription.status().catch(() => null),
        ])
        if (cancelled) return
        setApps(list)
        setSub(subResult)

        if (list.length > 0) {
          try {
            const counters = await pro.counters.list({ prefix: 'views:' })
            if (!cancelled) {
              const total = Object.values(counters).reduce((a, b) => a + b, 0)
              setTotalViews(total)
            }
          } catch {
            // counters may not be available
          }
        }
      } catch {
        // signed out or network error
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
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
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Total Apps" value={apps.length} />
        <StatCard label="Total Views" value={totalViews ?? 0} />
        <StatCard label="Plan" value={sub?.status === 'active' ? 'Pro' : 'Free'} />
      </div>

      {/* Apps list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="display-font text-xl font-bold text-[var(--ink)]">Your Apps</h3>
          <a
            href="https://create.freeappstore.online"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            + Create New App
          </a>
        </div>

        {apps.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line-strong)] p-12 text-center">
            <p className="text-[var(--muted)]">No apps yet. Create your first app to get started.</p>
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
                  <span className="inline-block h-2 w-2 rounded-full bg-[var(--success)]" title="Active" />
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

// ---------------------------------------------------------------------------
// App Detail
// ---------------------------------------------------------------------------

function AppDetail({ appId, onBack }: { appId: string; onBack: () => void }) {
  const [apps, setApps] = useState<AppEntry[]>([])
  const [config, setConfig] = useState<AppConfig>({ description: '' })
  const [views, setViews] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const entry = apps.find((a) => a.id === appId)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [list, storedConfig, viewCount] = await Promise.all([
          fetchApps(pro.auth.token),
          pro.kv.get<AppConfig>(`app-config:${appId}`),
          pro.counters.get(`views:${appId}`).catch(() => 0),
        ])
        if (cancelled) return
        setApps(list)
        if (storedConfig) setConfig(storedConfig)
        setViews(viewCount)
      } catch {
        // error loading
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [appId])

  const saveDescription = async () => {
    setSaving(true)
    try {
      await pro.kv.set(`app-config:${appId}`, config)
    } finally {
      setSaving(false)
    }
  }

  const deleteApp = async () => {
    setDeleting(true)
    try {
      // Remove the row server-side (apps table). CF Pages, D1, DNS, the
      // GitHub repo, and the storefront entry are intentionally left alive —
      // this is a dashboard-listing delete, not a deprovision.
      const ok = await deleteAppApi(pro.auth.token, appId)
      if (ok) {
        await pro.kv.delete(`app-config:${appId}`).catch(() => {})
        onBack()
      }
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <p className="text-[var(--muted)] py-12 text-center">Loading app details...</p>
  }

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="text-sm font-medium text-[var(--accent)] hover:underline"
      >
        &larr; Back to Dashboard
      </button>

      {/* App info */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--glass-strong)] p-6 shadow-[var(--shadow-card)]">
        <h2 className="display-font text-2xl font-bold text-[var(--ink)]">
          {entry?.name ?? appId}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)] font-mono">{appId}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {appId}.proappstore.online
        </p>
        <div className="mt-4 flex gap-3">
          <a
            href={`https://${appId}.proappstore.online`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--glass)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--glass-hover)]"
          >
            Open App
          </a>
          <a
            href={`https://github.com/proappstore-online/${appId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--glass)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--glass-hover)]"
          >
            View Code
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--glass-strong)] p-6">
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">Stats</h3>
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Views" value={views ?? 0} />
        </div>
      </div>

      {/* Settings — description */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--glass-strong)] p-6">
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">Settings</h3>
        <label className="block text-sm font-medium text-[var(--ink)] mb-1">Description</label>
        <textarea
          value={config.description}
          onChange={(e) => setConfig({ ...config, description: e.target.value })}
          rows={3}
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
          placeholder="Describe your app..."
        />
        <button
          onClick={saveDescription}
          disabled={saving}
          className="mt-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Danger zone */}
      <div className="rounded-2xl border border-[var(--error)]/30 bg-[var(--glass-strong)] p-6">
        <h3 className="text-sm font-semibold text-[var(--error)] uppercase tracking-wide mb-3">Danger Zone</h3>
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-lg border border-[var(--error)]/40 px-4 py-2 text-sm font-semibold text-[var(--error)] hover:bg-[var(--error)]/10"
          >
            Delete App
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--error)]">
              This will remove <strong>{entry?.name ?? appId}</strong> from your apps list and delete its configuration. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={deleteApp}
                disabled={deleting}
                className="rounded-lg bg-[var(--error)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Yes, delete'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

function SubscriptionView() {
  const [sub, setSub] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    pro.subscription.status()
      .then((s) => { if (!cancelled) setSub(s) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <p className="text-[var(--muted)] py-12 text-center">Loading subscription...</p>
  }

  const isPro = sub?.status === 'active'

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
              You are on the Free plan. Upgrade to Pro for $9/mo to unlock all features.
            </p>
            <button
              onClick={() =>
                pro.subscription.openCheckout({
                  priceId: 'price_pro_monthly',
                  successUrl: window.location.href,
                  cancelUrl: window.location.href,
                })
              }
              className="rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90"
            >
              Upgrade to Pro -- $9/mo
            </button>
          </div>
        )}
      </div>

      {/* Feature comparison */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--glass-strong)] p-6">
        <h3 className="display-font text-lg font-bold text-[var(--ink)] mb-4">Feature Comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)]">
                <th className="text-left py-2 font-semibold text-[var(--ink)]">Feature</th>
                <th className="text-center py-2 font-semibold text-[var(--muted)]">Free</th>
                <th className="text-center py-2 font-semibold text-[var(--accent)]">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {FEATURES.map((f) => (
                <tr key={f.name}>
                  <td className="py-2.5 text-[var(--ink)]">{f.name}</td>
                  <td className="py-2.5 text-center text-[var(--muted)]">{f.free}</td>
                  <td className="py-2.5 text-center text-[var(--ink)]">{f.pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const FEATURES = [
  { name: 'KV Storage', free: '1 MB/user', pro: '10 MB/user' },
  { name: 'Real-time Rooms', free: '50 user-hrs/day', pro: 'Unlimited' },
  { name: 'Custom Domain', free: '--', pro: 'Yes' },
  { name: 'Server-side AI', free: '--', pro: 'Included' },
  { name: 'Cron Workers', free: '--', pro: 'Yes' },
  { name: 'Transactional Email', free: '--', pro: 'Included' },
  { name: 'Cloud Sync', free: '--', pro: 'Yes' },
  { name: 'Priority Support', free: '--', pro: 'Yes' },
]

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

      {/* Notifications */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--glass-strong)] p-6">
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">Notifications</h3>
        <div className="space-y-3">
          <Toggle
            label="Email notifications"
            checked={prefs.emailNotifications}
            onChange={(v) => save({ ...prefs, emailNotifications: v })}
          />
          <Toggle
            label="Weekly digest"
            checked={prefs.weeklyDigest}
            onChange={(v) => save({ ...prefs, weeklyDigest: v })}
          />
        </div>
      </div>

      {/* API Keys */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--glass-strong)] p-6">
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">API Keys</h3>
        <p className="text-sm text-[var(--muted)]">
          Coming soon: manage your API proxy keys for server-side AI access.
        </p>
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

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm text-[var(--ink)]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--line-strong)]'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
            checked ? 'translate-x-[1.125rem] ml-0.5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  )
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}
