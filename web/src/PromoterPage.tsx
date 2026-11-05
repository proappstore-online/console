import { useEffect, useRef, useState } from 'react'
import type { User } from '@proappstore/sdk'
import QRCode from 'qrcode'
import { pro } from './sdk'
import { SignInButton } from '@proappstore/sdk/ui'
import { promoterAppFromHash, promoterHash, promoterSignInUrl } from './nav'
import { fetchOwnProfile, saveOwnProfile, withdrawOwnProfile } from './publicTeamApi'
import {
  PROMOTER_RANGES, loadPromoterAccess, enrollPromoter, withdrawPromoter, renamePromoter,
  errorMessage, ownActivity, isDenied, trackingReady, readinessMessage, type PromoterAccess, type PromoterLoader, type PromoterRange,
} from './promoterApi'

import { PROMOTER_BUTTON, PROMOTER_CARD } from './promoterShared'
const INPUT = 'min-h-11 max-w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-[var(--ink)]'

export function PromoterSignIn() {
  // SDK drops the hash during OAuth. A validated, non-secret outer query marker
  // survives the real SDK return_to and restores the hash/app after auth.init.
  const start = () => history.replaceState(null, '', promoterSignInUrl(location.href))
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 text-[var(--ink)]">
    <h1 className="display-font text-3xl font-bold">Promote an app</h1>
    <p>Sign in to choose an app, get a personal link and see your confirmed referrals. You do not need to own or publish an app.</p>
    {pro.auth.authError && <p role="alert">Sign-in did not complete ({pro.auth.authError}). Try again.</p>}
    <div onClickCapture={start}><SignInButton app={pro} provider="google" label="Sign in with Google" /></div>
    <div onClickCapture={start}><SignInButton app={pro} provider="github" label="Sign in with GitHub" /></div>
    <a href="#/" className="underline">Open the Creator Console</a>
  </main>
}

export function downloadText(filename: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function ShareCard({ link, code, appId }: { link: string; code: string; appId: string }) {
  const [qr, setQr] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    let live = true; setQr('')
    QRCode.toDataURL(link, { width: 240, margin: 4, errorCorrectionLevel: 'M' }).then(
      (image) => { if (live) setQr(image) }, () => { if (live) setMessage('Could not generate QR. Use the link or retry.') },
    )
    return () => { live = false }
  }, [link])
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage('Copied.') } catch { setMessage('Could not copy. Select and copy the text above.') }
  }
  return <section className={PROMOTER_CARD} aria-labelledby="share-h">
    <h2 id="share-h" className="text-xl font-bold">Your link and code</h2>
    <p className="mt-3 break-all font-mono">{link}</p><p className="my-3 font-mono">{code}</p>
    <div className="flex flex-wrap gap-2">
      <button className={PROMOTER_BUTTON} onClick={() => void copy(link)}>Copy link</button>
      <button className={PROMOTER_BUTTON} onClick={() => void copy(code)}>Copy code</button>
      {typeof navigator.share === 'function' && <button className={PROMOTER_BUTTON} onClick={() => void navigator.share({ url: link }).catch(() => setMessage('Sharing did not complete. You can copy the link.'))}>Share</button>}
      <button className={PROMOTER_BUTTON} onClick={() => downloadText(`${appId}-promotion.txt`, `Try ${appId}: ${link}\nReferral code: ${code}\nI am sharing my promoter link. Credit requires first authenticated app use; visits and scans do not count.\n`)}>Download materials</button>
    </div>
    {qr && <><img src={qr} alt="QR code for your personal app link" width="240" height="240" className="mt-4 max-w-full" /><a download={`${appId}-referral-qr.png`} href={qr} className={PROMOTER_BUTTON}>Download QR</a></>}
    <p role="status" className="mt-2">{message}</p>
  </section>
}

function ProfileControls({ appId, initialName, run }: { appId: string; initialName: string; run: (action: () => Promise<unknown>) => Promise<void> }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [name, setName] = useState(initialName)
  const [label, setLabel] = useState('')
  const [visible, setVisible] = useState(false)
  const [promotion, setPromotion] = useState(false)
  useEffect(() => {
    let live = true; setLoaded(false); setError('')
    fetchOwnProfile(appId, pro.auth.token).then(({ profile }) => {
      if (!live) return
      setName(profile?.display_name ?? initialName); setLabel(profile?.label ?? '')
      setVisible(profile?.visible ?? false); setPromotion(profile?.show_promotion ?? false); setLoaded(true)
    }, () => { if (live) setError('Public preferences are temporarily unavailable. Your saved choices have not been changed.') })
    return () => { live = false }
  }, [appId, initialName, retry])
  if (!loaded) return <section className={PROMOTER_CARD}><h2 className="text-xl font-bold">Your public profile</h2><p role="status">{error || 'Loading public preferences…'}</p>{error && <button className={PROMOTER_BUTTON} onClick={() => setRetry((n) => n + 1)}>Retry preferences</button>}</section>
  return <section className={PROMOTER_CARD} aria-labelledby="profile-h">
    <h2 id="profile-h" className="text-xl font-bold">Your public profile</h2>
    <p>Sharing your name and showing your promotion contribution are separate choices. Neither grants app access. These are your saved choices; a new profile starts private.</p>
    <label className="mt-3 block">Display name <input className={INPUT} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></label>
    <label className="mt-3 block">Contribution label <input className={INPUT} maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />Show my public name</label>
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={promotion} onChange={(e) => setPromotion(e.target.checked)} />Show my promotion contribution publicly</label>
    <p aria-label="Public profile preview">Preview: {visible ? `${name || '(name required)'}${label ? ` · ${label}` : ''}${promotion ? ' · confirmed referrals and share among promoters' : ''}` : 'Hidden'}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button className={PROMOTER_BUTTON} disabled={visible && !name.trim()} onClick={() => void run(() => saveOwnProfile(appId, pro.auth.token, { display_name: name, label, visible, show_promotion: promotion }))}>Save public choices</button>
      <button className={PROMOTER_BUTTON} onClick={() => void run(() => withdrawOwnProfile(appId, pro.auth.token))}>Hide public profile</button>
      <button className={PROMOTER_BUTTON} onClick={() => void run(() => renamePromoter(appId, name))}>Save promoter name</button>
    </div>
    <p className="mt-2 text-sm text-[var(--muted)]">A public contribution card appears only while active, opted in and credited with a confirmed referral. Re-enrolling after withdrawal does not restore consent.</p>
  </section>
}

export function PromoterPage({ user, initialAppId, onSelectApp, onSwitchAccount, onSignOut, load = loadPromoterAccess }: {
  user: User; initialAppId: string | null; onSelectApp?: (id: string | null) => void
  onSwitchAccount: () => void; onSignOut: () => void; load?: PromoterLoader
}) {
  const [appId, setAppId] = useState(initialAppId)
  const [range, setRange] = useState<PromoterRange>('30d')
  const [access, setAccess] = useState<PromoterAccess | null>(null)
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [moreBusy, setMoreBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [consent, setConsent] = useState(false)
  const [name, setName] = useState('')
  const [withdrawPreview, setWithdrawPreview] = useState(false)
  const version = useRef(0)
  const actionLock = useRef(false)
  const [periodNow, setPeriodNow] = useState(Date.now)
  useEffect(() => {
    const change = () => setAppId(promoterAppFromHash(location.hash))
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  useEffect(() => {
    const v = ++version.current
    setAccess(null); setError(''); setActionMessage(''); setConsent(false); setName(''); setWithdrawPreview(false); setMoreBusy(false)
    load({ appId, range, now: periodNow }).then(
      (data) => { if (version.current === v) setAccess(data) },
      (e: unknown) => { if (version.current === v) setError(errorMessage(e)) },
    )
    return () => { version.current++ }
  }, [appId, range, periodNow, reload, load, user.id])
  async function run(action: () => Promise<unknown>) {
    if (actionLock.current) return
    actionLock.current = true; setBusy(true); setActionMessage('')
    const v = version.current
    try { await action(); if (v === version.current) { setActionMessage('Saved.'); setReload((n) => n + 1) } }
    catch (e) { if (v === version.current) {
      if (isDenied(e)) { setAccess(null); setError(errorMessage(e)) }
      else setActionMessage(errorMessage(e))
    } }
    finally { actionLock.current = false; setBusy(false) }
  }
  async function more() {
    if (access?.kind !== 'enrolled' || !access.activity?.next || moreBusy) return
    const v = version.current; setMoreBusy(true)
    try {
      const page = await ownActivity(access.appId, access.activity.next.before_id)
      if (v === version.current) setAccess({ ...access, activity: { ...page, referrals: [...new Map([...access.activity.referrals, ...page.referrals].map((r) => [r.referral_id, r])).values()] }, activityError: undefined })
    } catch (e) { if (v === version.current) { if (isDenied(e)) { setAccess(null); setError(errorMessage(e)) } else setAccess({ ...access, activityError: errorMessage(e) }) } }
    finally { if (v === version.current) setMoreBusy(false) }
  }
  function select(id: string) {
    setAppId(id || null); history.pushState(null, '', promoterHash(id)); onSelectApp?.(id || null)
  }
  const enrolled = access?.kind === 'enrolled' ? access : null
  const active = enrolled?.promoter.status === 'active'
  const promotion = enrolled?.report.contributions.promotion
  const ready = trackingReady(access?.readiness)
  const canEnroll = ready && access?.readiness?.enrollment_open === true
  const shareable = ready && active && enrolled.promoter.code_active && enrolled.promoter.app_public !== false
  return <div className="min-h-dvh text-[var(--ink)]">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
      <h1 className="display-font text-xl font-bold">Promoter workspace</h1>
      <div className="flex flex-wrap items-center gap-2"><span>Signed in as {user.name}</span><button className={PROMOTER_BUTTON} onClick={onSwitchAccount}>Switch account</button><button className={PROMOTER_BUTTON} onClick={onSignOut}>Sign out</button></div>
    </header>
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      {access && <label className="block">App <select aria-label="App" className={INPUT} value={appId ?? ''} onChange={(e) => select(e.target.value)} disabled={busy}>
        <option value="">Choose an app…</option>{access.apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select></label>}
      {!access && !error && <p role="status">Loading…</p>}
      {error && <div role="alert"><p>{error}</p><button className={PROMOTER_BUTTON} onClick={() => setReload((n) => n + 1)}>Retry</button></div>}
      {access?.kind === 'choose' && <p>You do not need to own an app. Choose a public app to promote. {access.apps.length === 0 && 'No apps are currently open for enrollment.'}</p>}
      {access && appId && <section className={PROMOTER_CARD} aria-label="Referral readiness">
        <p>{readinessMessage(access.readiness)}</p>
        <p>Enrollment is {access.readiness?.enrollment_open === true ? 'open' : access.readiness?.enrollment_open === false ? 'closed' : 'unavailable'}; verified referral tracking is required to enroll or re-enroll.</p>
        {access.readinessError && <p role="alert">Readiness could not load: {access.readinessError}</p>}
        <button className={PROMOTER_BUTTON} onClick={() => setReload((n) => n + 1)}>Refresh readiness</button>
      </section>}
      {(access?.kind === 'not-enrolled' || enrolled?.promoter.status === 'withdrawn') && appId && <section className={PROMOTER_CARD}>
        <h2 className="text-xl font-bold">{enrolled ? 'You have left this promotion' : 'Enroll to promote this app'}</h2>
        <p>Your link is available after enrollment. A private, missing or closed app may refuse enrollment.</p>
        <label className="mt-3 block">Optional display name <input className={INPUT} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />I consent to enroll as a promoter for {appId}.</label>
        <button className={PROMOTER_BUTTON} disabled={!canEnroll || !consent || busy} onClick={() => void run(() => enrollPromoter(appId, name))}>{enrolled ? 'Re-enroll' : 'Enroll'}</button>
      </section>}
      {enrolled?.promoter.status === 'suspended' && <p role="status">Your promoter access is suspended. Your link is disabled. Only the owner can restore it. {enrolled.promoter.status_reason} Existing confirmed credit remains below.</p>}
      {active && !shareable && <p role="status">This app is unavailable for sharing. Your existing contribution record is still shown.</p>}
      {shareable && <ShareCard key={enrolled.appId} appId={enrolled.appId} link={enrolled.promoter.share_url} code={enrolled.promoter.code} />}
      {enrolled && promotion && <section className={PROMOTER_CARD} aria-labelledby="stats-h">
        <h2 id="stats-h" className="text-xl font-bold">Promotion / Marketing</h2>
        <label className="mt-3 block">Period <select aria-label="Period" className={INPUT} value={range} onChange={(e) => { setPeriodNow(Date.now()); setRange(e.target.value as PromoterRange) }}>
          {PROMOTER_RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select></label>
        <dl className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(promotion.counts).map(([key, value]) => <div key={key}><dt className="capitalize">{key}</dt><dd className="text-2xl font-bold">{value}</dd></div>)}</dl>
        <p>Your share: {promotion.share_of_referred_users.percent}%</p>
        <p>Share = your {promotion.share_of_referred_users.numerator} confirmed referrals ÷ {promotion.share_of_referred_users.denominator} confirmed referrals from all promoters for this app and period. Organic and unattributed users are excluded.</p>
        <p>Your standing: {promotion.standing.rank === null ? 'Not ranked yet' : `#${promotion.standing.rank} of ${promotion.standing.ranked_promoters}`}{promotion.standing.tied_on_count ? ' (tied on count)' : ''}.</p>
        {!promotion.counts.confirmed && <p>No confirmed referrals in this period yet.</p>}
        <p className="mt-3 text-sm text-[var(--muted)]">Updated {new Date(enrolled.report.freshness.as_of).toUTCString()}. {enrolled.report.freshness.note} {enrolled.report.freshness.referrals_recorded_since !== null && `Recorded since ${new Date(enrolled.report.freshness.referrals_recorded_since).toUTCString()}.`}</p>
        <button className={PROMOTER_BUTTON} onClick={() => { setPeriodNow(Date.now()); setReload((n) => n + 1) }}>Refresh contributions</button>
        <h3 className="mt-4 font-bold">Your activity (all time)</h3>
        <p className="text-sm text-[var(--muted)]">The activity API is not period-filtered and omits expired captures. Totals above use the selected period.</p>
        {enrolled.activityError && <p role="alert">Activity could not load: {enrolled.activityError} <button className={PROMOTER_BUTTON} onClick={() => setReload((n) => n + 1)}>Retry activity</button></p>}
        {enrolled.activity?.referrals.length === 0 && <p>No activity yet.</p>}
        <ul>{enrolled.activity?.referrals.map((r) => <li key={r.referral_id}>{new Date(r.confirmed_at ?? r.captured_at).toUTCString()} — {r.status}</li>)}</ul>
        {enrolled.activity?.next && <button className={PROMOTER_BUTTON} disabled={moreBusy} onClick={() => void more()}>Load more activity</button>}
        <h3 className="mt-4 font-bold">Code</h3><p>{enrolled.report.contributions.code.reason}</p>
        <a href={`#/apps/${enrolled.appId}/contributions`} className="underline">Separate code contributions (app team access required)</a>
      </section>}
      <fieldset disabled={busy} className="contents">
        {active && <ProfileControls key={`${user.id}:${enrolled.appId}`} appId={enrolled.appId} initialName={enrolled.promoter.display_name ?? ''} run={run} />}
        {active && <section className={PROMOTER_CARD}><button className={PROMOTER_BUTTON} onClick={() => setWithdrawPreview(true)}>Withdraw from promotion</button>
          {withdrawPreview && <div><p>Your link will stop working, your promoter name will be cleared and public promotion consent will be removed. Confirmed credits remain.</p><button className={PROMOTER_BUTTON} onClick={() => void run(() => withdrawPromoter(enrolled.appId))}>Confirm withdrawal</button><button className={PROMOTER_BUTTON} onClick={() => setWithdrawPreview(false)}>Cancel</button></div>}
        </section>}
      </fieldset>
      <p role="status">{busy ? 'Saving…' : actionMessage}</p>
      <section className={PROMOTER_CARD}><h2 className="text-xl font-bold">How it works</h2><ol className="list-decimal space-y-2 pl-5">
        <li>Enroll for an app and get your personal link, code and QR.</li><li>Share voluntarily. Visits and QR scans do not count.</li><li>A person new to this app must claim your code and first use the app while authenticated. Pending claims expire after 14 days.</li><li>Confirmed referrals determine your share among promoters. These figures do not grant roles, ownership or payouts.</li>
      </ol></section>
    </main>
  </div>
}
