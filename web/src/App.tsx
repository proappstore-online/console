import { useState, useEffect, useCallback } from 'react'
import type { User } from '@proappstore/sdk'
import { pro } from './sdk'
import { ProfileView } from './ProfileView'
import { PublishView } from './PublishView'
import { PayoutsView } from './PayoutsView'
import { AppDetail } from './AppDetail'
import { AdminView } from './AdminView'
import { UILibraryView } from './UILibraryView'

import { type View, type AppEntry, parseHash as parseHashString, hashFor, deriveSlug, mergeApps } from './nav'
import { fetchApps, fetchAgentProjects, deleteAppApi, fetchIsAdmin } from './appsApi'
import { Landing, Header } from './Header'
import { Dashboard } from './Dashboard'
import { SubscriptionView } from './SubscriptionView'
import { NewAppModal } from './NewAppModal'

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

// AppDetail moved to ./AppDetail.tsx — multi-section listing editor
