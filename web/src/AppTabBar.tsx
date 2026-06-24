// Per-app workspace tab icons + the mobile bottom tab bar.
//
// On phones the 8-9 workspace tabs can't fit the header, so they live in a
// fixed, thumb-reachable bottom bar (native-app pattern) — icon + label, the
// row scrolls if needed. On sm+ the header tab strip is used instead and this
// bar is hidden. The icon map is shared with Header.

import type { ReactNode } from 'react'
import { APP_TABS, type AppTab } from './nav'

function Icon({ d, children }: { d?: string; children?: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" aria-hidden="true">
      {d ? <path d={d} /> : children}
    </svg>
  )
}

export const APP_TAB_ICONS: Record<AppTab, ReactNode> = {
  research: <Icon><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icon>,
  build: <Icon d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-2.7-.6-.6-2.7 2.1-2.1Z" />,
  data: <Icon><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6a8 3 0 0 0 16 0V5" /><path d="M4 11v6a8 3 0 0 0 16 0v-6" /></Icon>,
  test: <Icon><path d="M9 3v6l-5 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-9V3" /><path d="M8 3h8" /></Icon>,
  control: <Icon><line x1="4" y1="8" x2="20" y2="8" /><circle cx="9" cy="8" r="2" /><line x1="4" y1="16" x2="20" y2="16" /><circle cx="15" cy="16" r="2" /></Icon>,
  analytics: <Icon><line x1="6" y1="20" x2="6" y2="12" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="14" /></Icon>,
  spending: <Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5a2.5 2 0 0 1 5 0c0 2.5-5 1-5 4a2.5 2 0 0 0 5 0" /></Icon>,
  style: <Icon><circle cx="13.5" cy="6.5" r="1.5" /><circle cx="17.5" cy="10.5" r="1.5" /><circle cx="8.5" cy="7.5" r="1.5" /><circle cx="6.5" cy="12.5" r="1.5" /><path d="M12 2a10 10 0 1 0 0 20 2 2 0 0 0 2-2c0-1-1-1.5-1-2.5a2 2 0 0 1 2-2h2a4 4 0 0 0 4-4 8 8 0 0 0-11-7.5" /></Icon>,
  settings: <Icon><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Icon>,
}

/** Fixed bottom tab bar for the per-app workspace — mobile only (sm:hidden).
 *  Icon + label, scrolls horizontally if the tabs exceed the width. */
export function MobileAppTabBar({ appTab, onAppTab }: { appTab: AppTab; onAppTab: (t: AppTab) => void }) {
  return (
    <div className="sm:hidden fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-[var(--panel)] backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
      <nav aria-label="Workspace" className="flex overflow-x-auto">
        {APP_TABS.map((t) => {
          const active = appTab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onAppTab(t.key)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 flex-shrink-0 min-w-[3.6rem] px-1 py-1.5 text-[10px] font-medium transition-colors ${
                active ? 'text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
            >
              {APP_TAB_ICONS[t.key]}
              <span className="leading-none">{t.label}</span>
            </button>
          )
        })}
      </nav>
      {/* Right-edge fade — hints that the tab row scrolls to more tabs. */}
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-[var(--panel)] to-transparent" />
    </div>
  )
}
