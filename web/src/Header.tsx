// ---------------------------------------------------------------------------
// Landing (signed out) + Header + Nav
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef, type ReactNode } from 'react'
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

// Inline stroke icons (16px, matching the codebase's SVG style) so each nav tab
// can render icon-only on mobile and icon+label on wider screens.
function Icon({ d, children }: { d?: string; children?: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" aria-hidden="true">
      {d ? <path d={d} /> : children}
    </svg>
  )
}
const TAB_ICONS: Record<View, ReactNode> = {
  dashboard: <Icon><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Icon>,
  publish: <Icon><path d="M12 19V6" /><path d="m5 12 7-7 7 7" /></Icon>,
  payouts: <Icon><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></Icon>,
  subscription: <Icon><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></Icon>,
  services: <Icon><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></Icon>,
  'ui-library': <Icon><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></Icon>,
  admin: <Icon d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  // Views without their own nav tab (rendered elsewhere) — fall back to a dot.
  'app-detail': null, profile: null,
}

const APP_TAB_ICONS: Record<AppTab, ReactNode> = {
  research: <Icon><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icon>,
  build: <Icon d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-2.7-.6-.6-2.7 2.1-2.1Z" />,
  test: <Icon><path d="M9 3v6l-5 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-9V3" /><path d="M8 3h8" /></Icon>,
  control: <Icon><line x1="4" y1="8" x2="20" y2="8" /><circle cx="9" cy="8" r="2" /><line x1="4" y1="16" x2="20" y2="16" /><circle cx="15" cy="16" r="2" /></Icon>,
  analytics: <Icon><line x1="6" y1="20" x2="6" y2="12" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="14" /></Icon>,
  spending: <Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5a2.5 2 0 0 1 5 0c0 2.5-5 1-5 4a2.5 2 0 0 0 5 0" /></Icon>,
  style: <Icon><circle cx="13.5" cy="6.5" r="1.5" /><circle cx="17.5" cy="10.5" r="1.5" /><circle cx="8.5" cy="7.5" r="1.5" /><circle cx="6.5" cy="12.5" r="1.5" /><path d="M12 2a10 10 0 1 0 0 20 2 2 0 0 0 2-2c0-1-1-1.5-1-2.5a2 2 0 0 1 2-2h2a4 4 0 0 0 4-4 8 8 0 0 0-11-7.5" /></Icon>,
  settings: <Icon><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Icon>,
}

const TABS: { key: View; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'publish', label: 'Publish' },
  { key: 'payouts', label: 'Payouts' },
  { key: 'subscription', label: 'Subscription' },
  { key: 'services', label: 'Services' },
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
          title="Creator Console — dashboard"
          className="display-font text-base font-bold text-[var(--ink)] tracking-tight py-2 whitespace-nowrap flex-shrink-0"
        >
          {/* Compact on mobile to leave room for the nav; full brand on sm+. */}
          <span className="sm:hidden">Console</span>
          <span className="hidden sm:inline">Creator Console</span>
        </button>

        {onApp ? (
          // On an app page the nav becomes a project switcher + its controls.
          // NOTE: no overflow on this row — it's an ancestor of the switcher
          // dropdown, and any non-visible overflow clips it (overflow-x also
          // forces overflow-y to auto). Only the tab group scrolls (below).
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <span className="text-[var(--muted)] select-none flex-shrink-0">/</span>
            <ProjectSwitcher
              apps={apps}
              selectedAppId={selectedAppId!}
              onOpenApp={onOpenApp}
              onAllApps={() => onNavigate('dashboard')}
            />
            {/* Per-app workspace tabs: Research · Build · Data · Test · Control · Settings */}
            <div className="flex items-center rounded-lg border border-[var(--line-strong)] overflow-x-auto ml-1 min-w-0">
              {APP_TABS.map((t, i) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onAppTab(t.key)}
                  title={t.label}
                  aria-label={t.label}
                  aria-current={appTab === t.key ? 'page' : undefined}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${i > 0 ? 'border-l border-[var(--line-strong)]' : ''} ${
                    appTab === t.key ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--panel-hover)]'
                  }`}
                >
                  {APP_TAB_ICONS[t.key]}
                  {/* Icon-only until lg — 8 tabs + the project switcher won't fit
                      a label row on phones/tablets. */}
                  <span className="hidden lg:inline">{t.label}</span>
                </button>
              ))}
            </div>
            <a
              href={`https://${selectedAppId}.proappstore.online`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the live site"
              className="flex items-center gap-1 rounded-lg border border-[var(--line-strong)] px-2.5 py-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] transition-colors flex-shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              <span className="hidden md:inline">Open</span>
            </a>
          </div>
        ) : (
          <nav className="flex gap-0.5 -mb-px overflow-x-auto flex-1 ml-1 sm:ml-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => onNavigate(tab.key)}
                title={tab.label}
                aria-label={tab.label}
                aria-current={view === tab.key ? 'page' : undefined}
                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  view === tab.key
                    ? 'border-[var(--accent)] text-[var(--ink)]'
                    : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                {TAB_ICONS[tab.key]}
                {/* Icon-only on mobile; label appears on sm+ to avoid the cramped
                    7-tab horizontal scroll. */}
                <span className="hidden sm:inline">{tab.label}</span>
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
