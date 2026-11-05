// Promoter workspace (console#14): a separate surface for people who promote apps. It reuses the PAS
// session but confers no creator/admin access — it renders none of the creator navigation or controls,
// and every role decision stays on the server. Backend contracts are not deployed yet, so by default
// every flow reports itself unavailable; no link, code, enrollment or figure is ever made up.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@proappstore/sdk'
import { pro } from './sdk'
import { GoogleIcon, GitHubIcon } from './dashboardShared'
import {
  PROMOTER_RANGES, UNAVAILABLE_MESSAGE, loadPromoterAccess,
  type PromoterAccess, type PromoterApp, type PromoterLoader, type PromoterRange,
} from './promoterApi'

const BUTTON = 'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'
const CARD = 'rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5'
const OUTLINE = `${BUTTON} border border-[var(--line-strong)] text-[var(--ink)] disabled:opacity-50`

/** Signed-out promoter entry: Google first, GitHub as the alternative. No app or GitHub account is required. */
export function PromoterSignIn() {
  const authError = pro.auth.authError
  const start = (provider: 'google' | 'github') => {
    // Come back on the promoter return route so the console settles into the workspace.
    history.replaceState(null, '', '#/promoter/return')
    void pro.auth.signIn(provider)
  }
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="display-font text-4xl font-bold text-[var(--ink)]">Promote an app</h1>
        <p className="mt-4 text-lg text-[var(--muted)]">
          Sign in to get your personal link and see the new users you bring to ProAppStore apps. You don’t need to build or publish an app.
        </p>
        {authError && (
          <p role="alert" className="mt-4 text-sm" style={{ color: 'var(--danger,#dc2626)' }}>
            Sign-in did not complete ({authError}). Try again.
          </p>
        )}
        <div className="mt-8 flex flex-col items-center gap-3">
          <button type="button" onClick={() => start('google')} className={`${BUTTON} bg-[var(--accent)] text-white`}>
            <GoogleIcon /> Sign in with Google
          </button>
          <button type="button" onClick={() => start('github')} className={OUTLINE}>
            <GitHubIcon /> Sign in with GitHub
          </button>
        </div>
        <p className="mt-6 text-xs text-[var(--muted)]">
          Building apps instead? <a href="#/" className="underline hover:text-[var(--ink)]">Open the Creator Console</a>.
        </p>
      </div>
    </div>
  )
}

function Notice({ title, children, tone = 'info' }: { title: string; children: React.ReactNode; tone?: 'info' | 'warn' }) {
  const color = tone === 'warn' ? 'var(--warning,#d97706)' : 'var(--line-strong)'
  return (
    <div role="status" className={CARD} style={{ borderColor: color }}>
      <h3 className="text-sm font-semibold text-[var(--ink)]">{title}</h3>
      <p className="mt-1 text-sm text-[var(--muted)]">{children}</p>
    </div>
  )
}

const STOPPED_COPY: Record<'suspended' | 'revoked' | 'withdrawn', { title: string; body: string }> = {
  suspended: { title: 'Your promoter access is suspended', body: 'The app owner has paused your access. Your link is switched off and no new referrals are counted until it is restored. Contact the app owner to ask why.' },
  revoked: { title: 'Your promoter access was removed', body: 'The app owner or the platform removed your access to this app. Your link no longer counts referrals.' },
  withdrawn: { title: 'You have left this promotion', body: 'You withdrew from promoting this app. Your link no longer counts referrals.' },
}

function ShareCard({ access }: { access: PromoterAccess }) {
  const [copied, setCopied] = useState<string | null>(null)
  const live = access.kind === 'enrolled' ? access : null
  const copy = async (label: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(label) } catch { setCopied(null) }
  }
  const canShare = !!live && typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  return (
    <section aria-labelledby="share-h" className={CARD}>
      <h2 id="share-h" className="display-font text-lg font-bold text-[var(--ink)]">Your link and code</h2>
      {live ? (
        <dl className="mt-3 space-y-2 text-sm">
          <div><dt className="text-[var(--muted)]">Link</dt><dd className="break-all font-mono text-[var(--ink)]">{live.link}</dd></div>
          <div><dt className="text-[var(--muted)]">Code</dt><dd className="font-mono text-[var(--ink)]">{live.code}</dd></div>
        </dl>
      ) : (
        <p className="mt-2 text-sm text-[var(--muted)]">Your personal link and code appear here once you are enrolled for an app.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={!live} onClick={() => live && copy('link', live.link)} className={OUTLINE}>Copy link</button>
        <button type="button" disabled={!live} onClick={() => live && copy('code', live.code)} className={OUTLINE}>Copy code</button>
        <button type="button" disabled={!canShare} onClick={() => live && navigator.share({ url: live.link }).catch(() => {})} className={OUTLINE}>Share</button>
        <button type="button" disabled className={OUTLINE}>Download materials</button>
      </div>
      <p aria-live="polite" className="mt-2 text-xs text-[var(--muted)]">{copied ? `Copied ${copied}.` : ''}</p>
      <div className="mt-3 flex h-28 w-28 items-center justify-center rounded-lg border border-dashed border-[var(--line-strong)] p-2 text-center text-xs text-[var(--muted)]">
        QR code not available yet
      </div>
    </section>
  )
}

function Stats({ access, range, onRange, onRetry, onMore, loadingMore }: {
  access: PromoterAccess
  range: PromoterRange
  onRange: (r: PromoterRange) => void
  onRetry: () => void
  onMore: () => void
  loadingMore: boolean
}) {
  return (
    <section aria-labelledby="stats-h" className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="stats-h" className="display-font text-lg font-bold text-[var(--ink)]">Your referrals</h2>
        <label className="text-sm text-[var(--muted)]">
          Period{' '}
          <select value={range} onChange={(e) => onRange(e.target.value as PromoterRange)} className="rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 text-[var(--ink)]">
            {PROMOTER_RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
      </div>
      {access.kind === 'enrolled' ? (
        <>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div><dt className="text-xs text-[var(--muted)]">Pending</dt><dd className="text-2xl font-bold text-[var(--ink)]">{access.stats.pending}</dd></div>
            <div><dt className="text-xs text-[var(--muted)]">Confirmed</dt><dd className="text-2xl font-bold text-[var(--ink)]">{access.stats.confirmed}</dd></div>
            <div><dt className="text-xs text-[var(--muted)]">Your share</dt><dd className="text-2xl font-bold text-[var(--ink)]">{access.stats.sharePct}%</dd></div>
          </dl>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Share = your confirmed referrals ÷ {access.stats.denominator} confirmed new users in this period. Updated {new Date(access.stats.asOf).toUTCString()}.
          </p>
          {access.stats.pending === 0 && access.stats.confirmed === 0 && (
            <p className="mt-3 text-sm text-[var(--muted)]">No referrals in this period yet. Share your link to get started.</p>
          )}
          <h3 className="mt-5 text-sm font-semibold text-[var(--ink)]">Standings (anonymous)</h3>
          <ol className="mt-1 space-y-1 text-sm text-[var(--muted)]">
            {access.standings.map((r) => (
              <li key={r.rank}>#{r.rank} — {r.sharePct}%{r.you ? ' (you)' : ''}</li>
            ))}
          </ol>
          <h3 className="mt-5 text-sm font-semibold text-[var(--ink)]">Activity</h3>
          {access.activity.items.length === 0 ? (
            <p className="mt-1 text-sm text-[var(--muted)]">No activity in this period.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm text-[var(--muted)]">
              {access.activity.items.map((a) => <li key={a.id}>{new Date(a.at).toUTCString()} — {a.status}</li>)}
            </ul>
          )}
          {access.activity.nextCursor && (
            <button aria-label={loadingMore ? 'Loading…' : 'Load more'} type="button" onClick={onMore} disabled={loadingMore} className={`${OUTLINE} mt-3`}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      ) : access.kind === 'error' ? (
        <div role="alert" className="mt-3 text-sm">
          <p style={{ color: 'var(--error,#dc2626)' }}>Couldn’t load your referrals: {access.message}</p>
          <button type="button" onClick={onRetry} className={`${OUTLINE} mt-2`}>Retry</button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--muted)]">
          {access.kind === 'unavailable' ? 'Unavailable — referral tracking is not live yet.' : 'Nothing to show yet.'}
        </p>
      )}
    </section>
  )
}

export function PromoterPage({
  user, ownedApps, initialAppId, onSelectApp, onSwitchAccount, onSignOut, load = loadPromoterAccess,
}: {
  user: User
  /** Apps the caller owns, if any — only used to offer an app selector; never a source of promoter rights. */
  ownedApps: PromoterApp[]
  initialAppId: string | null
  onSelectApp?: (appId: string | null) => void
  onSwitchAccount: () => void
  onSignOut: () => void
  load?: PromoterLoader
}) {
  const [appId, setAppId] = useState<string | null>(initialAppId)
  const [range, setRange] = useState<PromoterRange>('30d')
  const [access, setAccess] = useState<PromoterAccess | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const latest = useRef(0)

  // Each request is ticketed; a slower response for a previously selected app/period is dropped, so one
  // app's figures can never appear under another.
  useEffect(() => {
    const ticket = ++latest.current
    setAccess(null)
    load({ appId, range }).then(
      (a) => { if (ticket === latest.current) setAccess(a) },
      (e: unknown) => { if (ticket === latest.current) setAccess({ kind: 'error', message: e instanceof Error ? e.message : 'request failed' }) },
    )
  }, [appId, range, reloadKey, load])

  const loadMore = useCallback(() => {
    if (access?.kind !== 'enrolled' || !access.activity.nextCursor) return
    const ticket = latest.current
    const prev = access
    setLoadingMore(true)
    load({ appId, range, cursor: access.activity.nextCursor }).then((next) => {
      if (ticket !== latest.current) return
      setAccess(next.kind === 'enrolled'
        ? { ...next, activity: { items: [...prev.activity.items, ...next.activity.items], nextCursor: next.activity.nextCursor } }
        : next)
    }).catch((e: unknown) => {
      if (ticket === latest.current) setAccess({ kind: 'error', message: e instanceof Error ? e.message : 'request failed' })
    }).finally(() => setLoadingMore(false))
  }, [access, appId, range, load])

  const choices = access?.kind === 'enrolled' ? access.apps : ownedApps
  const select = (id: string) => { setAppId(id || null); onSelectApp?.(id || null) }
  const stopped = access && (access.kind === 'suspended' || access.kind === 'revoked' || access.kind === 'withdrawn') ? STOPPED_COPY[access.kind] : null

  return (
    <div className="min-h-[100dvh]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3 sm:px-6">
        <span className="display-font text-lg font-bold text-[var(--ink)]">Promoter workspace</span>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--muted)]">Signed in as {user.login}</span>
          <button type="button" onClick={onSwitchAccount} className={OUTLINE}>Switch account</button>
          <button type="button" onClick={onSignOut} className={OUTLINE}>Sign out</button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 sm:px-6">
        {access === null && <p role="status" className="text-[var(--muted)]">Loading…</p>}
        {access?.kind === 'unavailable' && <Notice title="Enrollment unavailable">{UNAVAILABLE_MESSAGE}</Notice>}
        {access?.kind === 'not-enrolled' && <Notice title="You’re not enrolled for this app">Enrollment opens soon. You don’t need to own an app to promote one.</Notice>}
        {stopped && <Notice tone="warn" title={stopped.title}>{stopped.body}</Notice>}

        {choices.length === 0 ? (
          <Notice title="You don’t own any apps">That’s fine — promoters don’t need to. Once enrollment opens you’ll pick an app to promote here.</Notice>
        ) : (
          <label className="block text-sm text-[var(--muted)]">
            App{' '}
            <select value={appId ?? ''} onChange={(e) => select(e.target.value)} className="rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 text-[var(--ink)]">
              <option value="">Choose an app…</option>
              {choices.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}

        <div>
          <button type="button" disabled className={`${BUTTON} bg-[var(--accent)] text-white disabled:opacity-50`}>Enroll</button>
          <span className="ml-2 text-xs text-[var(--muted)]">Enrollment isn’t open yet.</span>
        </div>

        {!stopped && <ShareCard access={access ?? { kind: 'unavailable' }} />}
        {access && !stopped && (
          <Stats access={access} range={range} onRange={setRange} onRetry={() => setReloadKey((k) => k + 1)} onMore={loadMore} loadingMore={loadingMore} />
        )}

        <section className={CARD} aria-labelledby="guide-h">
          <h2 id="guide-h" className="display-font text-lg font-bold text-[var(--ink)]">How it works</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
            <li>Enroll for an app and get your personal link and code.</li>
            <li>Share them. A referral is pending until the new user is confirmed.</li>
            <li>Confirmed referrals count toward your share of the app’s new users.</li>
          </ol>
        </section>
      </main>
    </div>
  )
}
