// ---------------------------------------------------------------------------
// Landing (signed out) + Header + Nav
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef } from 'react'
import type { User } from '@proappstore/sdk'
import { pro } from './sdk'
import type { View, AppEntry, AppTab } from './nav'
import { APP_TABS } from './nav'
import { GitHubIcon } from './dashboardShared'

export function Landing() {
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

const TABS: { key: View; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'publish', label: 'Publish' },
  { key: 'payouts', label: 'Payouts' },
  { key: 'subscription', label: 'Subscription' },
  { key: 'ui-library', label: 'UI Library' },
]

export function Header({
  user, view, onNavigate, isAdmin, apps, selectedAppId, onOpenApp, appTab, onAppTab,
}: {
  user: User
  view: View
  onNavigate: (v: View) => void
  isAdmin: boolean
  apps: AppEntry[]
  selectedAppId: string | null
  onOpenApp: (id: string, tab?: AppTab) => void
  appTab: AppTab
  onAppTab: (t: AppTab) => void
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
            {/* Per-app workspace tabs: Research · Build · QA · Dev Ops · Settings */}
            <div className="flex items-center rounded-lg border border-[var(--line-strong)] overflow-hidden ml-1">
              {APP_TABS.map((t, i) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onAppTab(t.key)}
                  className={`px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${i > 0 ? 'border-l border-[var(--line-strong)]' : ''} ${
                    appTab === t.key ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--panel-hover)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
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
  onOpenApp: (id: string, tab?: AppTab) => void
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
              onClick={() => { setOpen(false); if (a.id !== selectedAppId) onOpenApp(a.id, 'build') }}
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
