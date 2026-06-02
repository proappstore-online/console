import { useState, useEffect, useCallback, useRef } from 'react'
import type { User, Subscription } from '@proappstore/sdk'
import { pro } from './sdk'
import { ProfileView } from './ProfileView'
import { PublishView } from './PublishView'
import { PayoutsView } from './PayoutsView'
import { AppDetail } from './AppDetail'
import { AdminView } from './AdminView'
import { UILibraryView } from './UILibraryView'
import { fetchOwnerSummary, formatNumber, type OwnerSummary } from './usage'

import { type View, type AppEntry, parseHash as parseHashString, hashFor, deriveSlug, mergeApps } from './nav'
import { API_BASE } from './api'

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

/** The caller's agent-teams projects (in-progress apps being built by agents). */
async function fetchAgentProjects(token: string | null): Promise<{ slug: string; name: string; createdAt: number }[]> {
  if (!token) return []
  try {
    const res = await fetch('https://agents.proappstore.online/v1/projects', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return []
    const data = (await res.json()) as { projects: { slug: string; name: string; createdAt: number }[] }
    return data.projects ?? []
  } catch {
    return []
  }
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

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

/** Parse the current location hash into view + optional param (DOM wrapper). */
function parseHash(): { view: View; param: string | null } {
  return parseHashString(location.hash)
}

/** Update hash without triggering hashchange (DOM wrapper). */
function setHash(view: View, param?: string | null) {
  const target = hashFor(view, param)
  if (location.hash !== target) history.pushState(null, '', target)
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const initial = parseHash()
  const [view, setViewState] = useState<View>(initial.view)
  const [selectedAppId, setSelectedAppId] = useState<string | null>(initial.param)
  const [appSettingsOpen, setAppSettingsOpen] = useState(false)
  const [apps, setApps] = useState<AppEntry[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [showNewApp, setShowNewApp] = useState(false)

  // Sync view to hash
  const setView = useCallback((v: View) => {
    setViewState(v)
    if (v !== 'app-detail') { setAppSettingsOpen(false); setHash(v) }
  }, [])

  // Listen for back/forward navigation
  useEffect(() => {
    const onHashChange = () => {
      const { view: v, param } = parseHash()
      setViewState(v)
      if (v === 'app-detail' && param) setSelectedAppId(param)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    pro.auth.init().then(() => setReady(true))
    return pro.auth.onChange(setUser)
  }, [])

  const reloadApps = useCallback(async () => {
    try {
      const [published, projects] = await Promise.all([
        fetchApps(pro.auth.token),
        fetchAgentProjects(pro.auth.token),
      ])
      setApps(mergeApps(published, projects))
    } catch { /* ignore */ }
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

  const openAppDetail = useCallback((id: string, tab: 'overview' | 'agents' = 'agents') => {
    setAppSettingsOpen(tab === 'overview')
    setSelectedAppId(id)
    setViewState('app-detail')
    setHash('app-detail', id)
  }, [])

  // Create a new app = create its agent-teams project (slug = id), then land on
  // the app's Agents tab. The repo/hosting is built by the team afterward.
  const createApp = useCallback(async (name: string, idea: string): Promise<string | null> => {
    const slug = deriveSlug(name)
    if (slug.length < 2) return 'Please use letters or numbers in the name.'
    try {
      const res = await fetch('https://agents.proappstore.online/v1/projects', {
        method: 'POST',
        headers: { Authorization: `Bearer ${pro.auth.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, idea: idea.trim() || undefined }),
      })
      if (!res.ok) return `${res.status}: ${await res.text()}`
      setShowNewApp(false)
      openAppDetail(slug, 'agents')
      return null
    } catch (e) {
      return (e as Error).message
    }
  }, [openAppDetail])

  const deleteSelectedApp = useCallback(async () => {
    if (!selectedAppId) return
    const ok = await deleteAppApi(pro.auth.token, selectedAppId)
    if (ok) {
      await pro.kv.delete(`app-config:${selectedAppId}`).catch(() => {})
      setApps((prev) => prev.filter((a) => a.id !== selectedAppId))
      setSelectedAppId(null)
      setViewState('dashboard')
      setHash('dashboard')
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
      <Header
        user={user}
        view={view}
        onNavigate={setView}
        isAdmin={isAdmin}
        apps={apps}
        selectedAppId={selectedAppId}
        onOpenApp={openAppDetail}
        settingsOpen={appSettingsOpen}
        onToggleSettings={() => setAppSettingsOpen((s) => !s)}
      />
      <main className={view === 'app-detail'
        ? 'flex-1 w-full px-3 py-3 sm:px-4'
        : 'flex-1 mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8'}>
        {view === 'dashboard' && (
          <Dashboard
            user={user}
            apps={apps}
            onOpenApp={openAppDetail}
            onPublishNew={() => setView('publish')}
            onNewApp={() => setShowNewApp(true)}
          />
        )}
        {view === 'app-detail' && selectedAppId && (
          <AppDetail
            key={selectedAppId}
            appId={selectedAppId}
            appName={selected?.name ?? null}
            getToken={() => pro.auth.token}
            onDelete={deleteSelectedApp}
            settingsOpen={appSettingsOpen}
          />
        )}
        {view === 'publish' && <PublishView getToken={() => pro.auth.token} />}
        {view === 'payouts' && <PayoutsView getToken={() => pro.auth.token} />}
        {view === 'subscription' && <SubscriptionView />}
        {view === 'admin' && isAdmin && <AdminView getToken={() => pro.auth.token} />}
        {view === 'profile' && <ProfileView user={user} />}
        {view === 'ui-library' && <UILibraryView />}
      </main>
      {showNewApp && <NewAppModal onClose={() => setShowNewApp(false)} onCreate={createApp} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// New app modal — name + idea → create the agent-teams project → Agents tab
// ---------------------------------------------------------------------------

function NewAppModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, idea: string) => Promise<string | null> }) {
  const [name, setName] = useState('')
  const [idea, setIdea] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    const err = await onCreate(name.trim(), idea)
    if (err) { setError(err); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="display-font text-2xl font-bold text-[var(--ink)] mb-1">New app</h2>
        <p className="text-sm text-[var(--muted)] mb-5">Name it and describe the idea. Your agent team (BA / Dev / QA) builds it — you press Play and chat.</p>
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
  { key: 'payouts', label: 'Payouts' },
  { key: 'subscription', label: 'Subscription' },
  { key: 'ui-library', label: 'UI Library' },
]

function Header({
  user, view, onNavigate, isAdmin, apps, selectedAppId, onOpenApp, settingsOpen, onToggleSettings,
}: {
  user: User
  view: View
  onNavigate: (v: View) => void
  isAdmin: boolean
  apps: AppEntry[]
  selectedAppId: string | null
  onOpenApp: (id: string, tab?: 'overview' | 'agents') => void
  settingsOpen: boolean
  onToggleSettings: () => void
}) {
  const tabs: { key: View; label: string }[] = isAdmin
    ? [...TABS.slice(0, -1), { key: 'admin', label: 'Admin' }, TABS[TABS.length - 1]!]
    : TABS
  const onApp = view === 'app-detail' && !!selectedAppId
  const isWide = onApp // app pages run full-width; match the navbar to the content
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--panel)] backdrop-blur-xl">
      <div className={`${isWide ? 'w-full px-3 sm:px-4' : 'mx-auto max-w-5xl px-4 sm:px-6 lg:px-8'} flex items-center gap-3`}>
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="display-font text-base font-bold text-[var(--ink)] tracking-tight py-2 whitespace-nowrap"
        >
          Creator Console
        </button>

        {onApp ? (
          // On an app page the nav becomes a project switcher + its controls.
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <span className="text-[var(--muted)] select-none">/</span>
            <ProjectSwitcher
              apps={apps}
              selectedAppId={selectedAppId!}
              onOpenApp={onOpenApp}
              onAllApps={() => onNavigate('dashboard')}
            />
            <button
              type="button"
              onClick={onToggleSettings}
              title="Project settings (listing, domains, roles, danger zone)"
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                settingsOpen ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <span className="hidden sm:inline">Settings</span>
            </button>
            <a
              href={`https://${selectedAppId}.proappstore.online`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the live site"
              className="flex items-center gap-1 rounded-lg border border-[var(--line-strong)] px-2.5 py-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              <span className="hidden md:inline">Open</span>
            </a>
          </div>
        ) : (
          <nav className="flex gap-0.5 -mb-px overflow-x-auto flex-1 ml-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => onNavigate(tab.key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  view === tab.key
                    ? 'border-[var(--accent)] text-[var(--ink)]'
                    : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}

        <button
          type="button"
          onClick={() => onNavigate('profile')}
          title="Profile, API keys & settings"
          className={`flex-shrink-0 rounded-full ring-2 transition-colors ${view === 'profile' ? 'ring-[var(--accent)]' : 'ring-[var(--line-strong)] hover:ring-[var(--accent)]'}`}
        >
          {user.avatarUrl
            ? <img src={user.avatarUrl} alt="Profile" className="h-7 w-7 rounded-full block" />
            : <span className="h-7 w-7 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-xs font-bold">{user.login.charAt(0).toUpperCase()}</span>}
        </button>
      </div>
    </header>
  )
}

// Project switcher: current app name + chevron; dropdown to jump between apps
// or back to all apps. The breadcrumb-style switcher pattern (GitHub/Vercel/Linear).
function ProjectSwitcher({
  apps, selectedAppId, onOpenApp, onAllApps,
}: {
  apps: AppEntry[]
  selectedAppId: string
  onOpenApp: (id: string, tab?: 'overview' | 'agents') => void
  onAllApps: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = apps.find((a) => a.id === selectedAppId)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-[var(--panel-hover)] transition-colors max-w-[40vw] sm:max-w-xs"
      >
        <span className="font-semibold text-[var(--ink)] truncate">{current?.name ?? selectedAppId}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--muted)] flex-shrink-0"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 max-h-[70vh] overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--panel-solid)] shadow-[var(--shadow-card)] py-1 z-40">
          <button
            type="button"
            onClick={() => { setOpen(false); onAllApps() }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--panel-hover)] hover:text-[var(--ink)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            All apps
          </button>
          <div className="my-1 border-t border-[var(--line)]" />
          {apps.length === 0 && <p className="px-3 py-2 text-xs text-[var(--muted)]">No apps yet.</p>}
          {apps.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => { setOpen(false); if (a.id !== selectedAppId) onOpenApp(a.id, 'agents') }}
              className={`flex items-center justify-between gap-2 w-full px-3 py-2 text-sm hover:bg-[var(--panel-hover)] ${
                a.id === selectedAppId ? 'text-[var(--ink)] font-semibold' : 'text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
            >
              <span className="truncate">{a.name}</span>
              {a.id === selectedAppId && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent)] flex-shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({
  user, apps, onOpenApp, onPublishNew, onNewApp,
}: {
  user: User
  apps: AppEntry[]
  onOpenApp: (id: string, tab?: 'overview' | 'agents') => void
  onPublishNew: () => void
  onNewApp: () => void
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
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[var(--shadow-card)]">
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPublishNew}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]"
            >
              Publish existing
            </button>
            <button
              type="button"
              onClick={onNewApp}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              + New app
            </button>
          </div>
        </div>

        {apps.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line-strong)] p-12 text-center">
            <p className="text-[var(--muted)]">
              No apps yet.{' '}
              <button type="button" onClick={onNewApp} className="text-[var(--accent)] font-semibold underline">
                Create your first app
              </button>{' '}
              — your agent team builds it.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {apps.map((a) => (
              <button
                key={a.id}
                onClick={() => onOpenApp(a.id, 'agents')}
                className="text-left rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 hover:bg-[var(--panel-hover)] shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--ink)] truncate">{a.name}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {a.published === false && (
                      <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Building</span>
                    )}
                    {a.published !== false && a.hasAgentTeam && (
                      <span className="rounded-full border border-[var(--line-strong)] text-[var(--muted)] px-2 py-0.5 text-[10px] font-semibold">Agents</span>
                    )}
                    <AppStatusBadge submissionStatus={a.submissionStatus} hasSubmission={a.hasSubmission} />
                  </div>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)] font-mono">{a.id}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {a.published === false ? 'In progress · ' : ''}Created {new Date(a.createdAt).toLocaleDateString()}
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
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[var(--shadow-card)]">
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
              className="rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--panel-hover)]"
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
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
        <h3 className="display-font text-lg font-bold text-[var(--ink)] mb-2">Where your ${dollars} goes</h3>
        <p className="text-sm text-[var(--muted)] mb-4">
          ProAppStore is one subscription for every Pro app — no per-app prices, no in-app upgrades.
          Creators are paid monthly from the subscription pool in proportion to how much each
          subscriber actually used their app.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="text-2xl font-bold text-[var(--ink)]">90%</p>
            <p className="text-xs text-[var(--muted)] mt-1">
              Goes to creators of the apps you used this month, weighted by your usage of each.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="text-2xl font-bold text-[var(--ink)]">10%</p>
            <p className="text-xs text-[var(--muted)] mt-1">
              Platform fee — covers hosting, databases, file storage, real-time, payments.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
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
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
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
