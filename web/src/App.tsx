import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import type { User } from '@proappstore/sdk'
import { pro } from './sdk'

import { type View, type AppEntry, type AppTab, type AppSettingsTab, parseHash as parseHashString, hashFor, deriveSlug, mergeApps, appTabsFor, effectiveAppTab } from './nav'
import { fetchApps, fetchAgentProjects, fetchAdministeredApps, deleteAppApi, fetchIsAdmin } from './appsApi'
import { probeOperatorAccess, type OperatorAccess } from './operator'
import { syncTokenToCookie } from './authSync'
import { Landing, Header } from './Header'
import { MobileAppTabBar } from './AppTabBar'
import { ErrorBoundary } from './ErrorBoundary'
import { Dashboard } from './Dashboard'
import { NewAppModal } from './NewAppModal'
import { ConnectorSetupView } from './ConnectorSetupView'

// Lazy-loaded routes — only downloaded when the user navigates there.
// Dashboard + Header stay eager (they are the landing experience).
const AppDetail = lazy(() => import('./AppDetail').then(m => ({ default: m.AppDetail })))
const PublishView = lazy(() => import('./PublishView').then(m => ({ default: m.PublishView })))
const PayoutsView = lazy(() => import('./PayoutsView').then(m => ({ default: m.PayoutsView })))
const SubscriptionView = lazy(() => import('./SubscriptionView').then(m => ({ default: m.SubscriptionView })))
const ServicesView = lazy(() => import('./ServicesView').then(m => ({ default: m.ServicesView })))
const AdminView = lazy(() => import('./AdminView').then(m => ({ default: m.AdminView })))
const ProfileView = lazy(() => import('./ProfileView').then(m => ({ default: m.ProfileView })))
const UILibraryView = lazy(() => import('./UILibraryView').then(m => ({ default: m.UILibraryView })))

function RouteSpinner() {
  return <p className="py-12 text-center text-[var(--muted)]">Loading...</p>
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

/** Parse the current location hash into view + optional param + tab (DOM wrapper). */
function parseHash() {
  return parseHashString(location.hash)
}

/** Update hash without triggering hashchange (DOM wrapper). `replace` avoids
 *  pushing a history entry — used for tab switches so Back doesn't cycle tabs. */
function setHash(
  view: View,
  param?: string | null,
  tab?: AppTab | null,
  settingsTab?: AppSettingsTab | null,
  replace = false,
) {
  const target = hashFor(view, param, tab, settingsTab)
  if (location.hash === target) return
  if (replace) history.replaceState(null, '', target)
  else history.pushState(null, '', target)
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const initial = parseHash()
  const [view, setViewState] = useState<View>(initial.view)
  const [selectedAppId, setSelectedAppId] = useState<string | null>(initial.param)
  const [appTab, setAppTab] = useState<AppTab>(initial.tab ?? 'build')
  const [appSettingsTab, setAppSettingsTab] = useState<AppSettingsTab>(initial.settingsTab ?? 'storefront')
  const [apps, setApps] = useState<AppEntry[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [showNewApp, setShowNewApp] = useState(false)
  // platform#297: whether the platform admits the user to the selected app's operator view.
  const [operatorAccess, setOperatorAccess] = useState<{ appId: string; access: OperatorAccess } | null>(null)

  // Sync view to hash
  const setView = useCallback((v: View) => {
    setViewState(v)
    if (v !== 'app-detail') { setHash(v) }
  }, [])

  // Listen for back/forward navigation
  useEffect(() => {
    const onHashChange = () => {
      const { view: v, param, tab, settingsTab } = parseHash()
      setViewState(v)
      if (v === 'app-detail' && param) {
        setSelectedAppId(param)
        if (tab) setAppTab(tab) // restore the deep-linked tab on back/forward
        if (tab === 'settings') setAppSettingsTab(settingsTab ?? 'storefront')
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    pro.auth.init().then(() => setReady(true))
    return pro.auth.onChange((u) => {
      setUser(u)
      // Mirror token to cross-subdomain cookie so storefront can detect sign-in
      syncTokenToCookie(pro.auth.token)
    })
  }, [])

  const reloadApps = useCallback(async () => {
    try {
      const [published, projects, administered] = await Promise.all([
        fetchApps(pro.auth.token),
        fetchAgentProjects(pro.auth.token),
        fetchAdministeredApps(pro.auth.token),
      ])
      setApps(mergeApps(published, projects, administered))
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

  // The backend decides the operator tab (platform#297): one read of the owner/admin-gated
  // context per selected app. A refused user gets no tab, and no admin data is fetched.
  useEffect(() => {
    if (!user || view !== 'app-detail' || !selectedAppId) return
    let cancelled = false
    setOperatorAccess({ appId: selectedAppId, access: { status: 'unknown' } })
    probeOperatorAccess(pro.auth.token, selectedAppId).then((access) => {
      if (!cancelled) setOperatorAccess({ appId: selectedAppId, access })
    })
    return () => { cancelled = true }
  }, [user, view, selectedAppId])

  const openAppDetail = useCallback((id: string, requested: AppTab = 'build') => {
    const tab = effectiveAppTab(apps.find((a) => a.id === id), requested)
    setAppTab(tab)
    setSelectedAppId(id)
    setViewState('app-detail')
    setHash('app-detail', id, tab, tab === 'settings' ? appSettingsTab : null)
  }, [appSettingsTab, apps])

  // GitHub App install finished: land on the app's Integrations settings.
  const finishConnectorSetup = useCallback((id: string) => {
    setAppTab('settings')
    setAppSettingsTab('integrations')
    setSelectedAppId(id)
    setViewState('app-detail')
    setHash('app-detail', id, 'settings', 'integrations', true)
  }, [])

  // Switch the active per-app tab + reflect it in the URL (replace, so Back
  // returns to the previous view rather than cycling through each tab).
  const changeAppTab = useCallback((t: AppTab) => {
    setAppTab(t)
    if (selectedAppId) setHash('app-detail', selectedAppId, t, t === 'settings' ? appSettingsTab : null, true)
  }, [appSettingsTab, selectedAppId])

  const changeAppSettingsTab = useCallback((t: AppSettingsTab) => {
    setAppSettingsTab(t)
    if (selectedAppId) setHash('app-detail', selectedAppId, 'settings', t, true)
  }, [selectedAppId])

  // Create a new app = create its agent-teams project (slug = id), then land on
  // the app's Agents tab. The repo/hosting is built by the team afterward.
  const createApp = useCallback(async (name: string, idea: string, template?: string): Promise<string | null> => {
    const slug = deriveSlug(name)
    if (slug.length < 2) return 'Please use letters or numbers in the name.'
    try {
      const res = await fetch('https://agents.proappstore.online/v1/projects', {
        method: 'POST',
        headers: { Authorization: `Bearer ${pro.auth.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, idea: idea.trim() || undefined, template: template && template !== 'blank' ? template : undefined }),
      })
      if (!res.ok) return `${res.status}: ${await res.text()}`
      setShowNewApp(false)
      openAppDetail(slug, 'research') // brand-new app: brainstorm + build the KB first
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
  const access: OperatorAccess = operatorAccess && operatorAccess.appId === selectedAppId ? operatorAccess.access : { status: 'unknown' }
  const appTabs = appTabsFor(selected, access.status)
  // An app the user only administers opens on the operator view: its other tabs are the owner's.
  const currentTab = effectiveAppTab(selected, appTab)

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      <Header
        user={user}
        view={view}
        onNavigate={setView}
        isAdmin={isAdmin}
        apps={apps}
        selectedAppId={selectedAppId}
        onOpenApp={openAppDetail}
        appTab={currentTab}
        onAppTab={changeAppTab}
        appTabs={appTabs}
      />
      <main className={view === 'app-detail'
        ? 'flex-1 flex flex-col w-full px-1.5 pt-2 pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:px-2 sm:py-2 sm:pb-2 min-h-0'
        : 'flex-1 mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 overflow-y-auto min-h-0'}>
        {/* Section boundary keyed by view: a crash in any view shows a local
            fallback instead of white-screening the whole console; switching
            views clears it. (app-detail also has its own inner boundary.) */}
        <ErrorBoundary variant="section" resetKey={view}>
        {view === 'dashboard' && (
          <Dashboard
            user={user}
            apps={apps}
            onOpenApp={openAppDetail}
            onPublishNew={() => setView('publish')}
            onNewApp={() => setShowNewApp(true)}
          />
        )}
        <Suspense fallback={<RouteSpinner />}>
          {view === 'app-detail' && selectedAppId && (
            <AppDetail
              key={selectedAppId}
              appId={selectedAppId}
              appName={selected?.name ?? null}
              getToken={() => pro.auth.token}
              onDelete={deleteSelectedApp}
              onReauth={() => pro.auth.signIn()}
              tab={currentTab}
              settingsTab={appSettingsTab}
              onSettingsTab={changeAppSettingsTab}
              operatorAccess={access}
            />
          )}
          {view === 'publish' && <PublishView getToken={() => pro.auth.token} />}
          {view === 'payouts' && <PayoutsView getToken={() => pro.auth.token} />}
          {view === 'subscription' && <SubscriptionView />}
          {view === 'services' && <ServicesView getToken={() => pro.auth.token} />}
          {view === 'admin' && isAdmin && <AdminView getToken={() => pro.auth.token} />}
          {view === 'profile' && <ProfileView user={user} />}
          {view === 'ui-library' && <UILibraryView />}
          {view === 'connector-setup' && <ConnectorSetupView getToken={() => pro.auth.token} onDone={finishConnectorSetup} />}
        </Suspense>
        </ErrorBoundary>
      </main>
      {view === 'app-detail' && selectedAppId && (
        <MobileAppTabBar tabs={appTabs} appTab={currentTab} onAppTab={changeAppTab} />
      )}
      {showNewApp && <NewAppModal onClose={() => setShowNewApp(false)} onCreate={createApp} />}
    </div>
  )
}

// AppDetail moved to ./AppDetail.tsx — multi-section listing editor
