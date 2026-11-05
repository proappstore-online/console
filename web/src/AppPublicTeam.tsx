// Public team section (console#11, platform#542), beside the private team/roles management. A current
// member previews and opts in or out of their own public profile; the owner can take people off the public
// roster. A contribution label is presentation, never a permission. Nothing here shows emails, user ids or
// access roles, and nothing here invites anyone or changes access.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './api'
import {
  LABEL_MAX, NAME_MAX, fetchPublicTeam, fetchRoster, hideMember, saveOwnProfile, withdrawOwnProfile,
  type PublicMember, type RosterMember,
} from './publicTeamApi'

interface Props {
  appId: string
  getToken: () => string | null
  /** The signed-in user's id, used only to find their own row in the owner's roster. */
  userId?: string | null
}

function message(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'Your session has expired. Sign in again.'
    if (e.status === 403) return 'Only a current member of this app’s team can do that.'
    return e.message || fallback
  }
  return 'Could not reach the service. Check your connection and try again.'
}

export function AppPublicTeam({ appId, getToken, userId }: Props) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pub, setPub] = useState<PublicMember[]>([])
  const [roster, setRoster] = useState<RosterMember[] | null>(null) // null = not the owner
  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const version = useRef(0)

  const load = useCallback(async () => {
    const v = ++version.current
    setLoading(true); setLoadError(null); setStatus(null)
    setPub([]); setRoster(null); setName(''); setLabel(''); setVisible(false)
    try {
      const [publicList, rosterResult] = await Promise.all([
        fetchPublicTeam(appId).then((r) => r.members, (e) => { if (e instanceof ApiError && e.status === 404) return [] as PublicMember[]; throw e }),
        // 403 just means "not the owner": the owner-only roster is skipped, the own-profile form still works.
        fetchRoster(appId, getToken()).then((r) => r.members, (e) => { if (e instanceof ApiError && e.status === 403) return null; throw e }),
      ])
      if (v !== version.current) return // a newer load (app switch) superseded this one
      setPub(publicList)
      setRoster(rosterResult)
      const mine = rosterResult?.find((m) => m.user_id === userId)
      if (mine) { setName(mine.display_name ?? ''); setLabel(mine.label ?? ''); setVisible(mine.visible) }
    } catch (e) {
      if (v === version.current) setLoadError(message(e, 'Could not load the public team.'))
    } finally {
      if (v === version.current) setLoading(false)
    }
  }, [appId, getToken, userId])

  useEffect(() => { void load() }, [load])
  useEffect(() => () => { version.current += 1 }, [])

  const refreshPublic = async () => {
    const v = version.current
    try {
      const list = await fetchPublicTeam(appId)
      if (v === version.current) setPub(list.members)
    } catch { /* the saved/hidden result is already shown; the list refreshes on next load */ }
  }

  const save = async () => {
    if (busy) return
    setBusy(true); setStatus(null)
    const v = version.current
    try {
      await saveOwnProfile(appId, getToken(), { display_name: name, label, visible })
      if (v !== version.current) return
      setStatus({ ok: true, text: visible ? 'Saved. Your profile is public.' : 'Saved. Your profile is not public.' })
      void refreshPublic()
    } catch (e) {
      if (v === version.current) setStatus({ ok: false, text: message(e, 'Could not save your profile.') })
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async () => {
    if (busy) return
    setBusy(true); setStatus(null)
    const v = version.current
    try {
      await withdrawOwnProfile(appId, getToken())
      if (v !== version.current) return
      setVisible(false)
      setStatus({ ok: true, text: 'Withdrawn. Your profile is no longer public.' })
      void refreshPublic()
    } catch (e) {
      if (v === version.current) setStatus({ ok: false, text: message(e, 'Could not withdraw your profile.') })
    } finally {
      setBusy(false)
    }
  }

  const hide = async (m: RosterMember) => {
    if (busy) return
    setBusy(true); setStatus(null)
    const v = version.current
    try {
      await hideMember(appId, getToken(), m.user_id)
      if (v !== version.current) return
      setRoster((r) => r && r.map((x) => x.user_id === m.user_id ? { ...x, visible: false } : x))
      setStatus({ ok: true, text: `${m.display_name ?? 'That member'} is no longer on the public list. They can opt in again.` })
      void refreshPublic()
    } catch (e) {
      if (v === version.current) setStatus({ ok: false, text: message(e, 'Could not update the public list.') })
    } finally {
      setBusy(false)
    }
  }

  const shownName = name.trim()
  const field = 'mt-1 block w-full rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)]'

  return (
    <section aria-labelledby="public-team-h" className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 space-y-5">
      <div>
        <h3 id="public-team-h" className="display-font text-lg font-bold text-[var(--ink)]">Public team</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Who visitors see behind this app. Nobody is public until they choose to be. A label such as “Designer” is only a title — it never changes what anyone can do.
        </p>
      </div>

      {loading && <p role="status" className="text-sm text-[var(--muted)]">Loading…</p>}
      {loadError && (
        <div role="alert" className="text-sm">
          <p className="text-[var(--error)]">{loadError}</p>
          <button type="button" onClick={() => void load()} className="mt-2 rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-[var(--ink)]">Retry</button>
        </div>
      )}

      {!loading && !loadError && (
        <>
          <form onSubmit={(e) => { e.preventDefault(); void save() }} className="space-y-3" aria-label="Your public profile">
            <h4 className="text-sm font-semibold text-[var(--ink)]">Your public profile</h4>
            <label className="block text-sm text-[var(--muted)]">
              Display name
              <input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} className={field} autoComplete="off" />
            </label>
            <label className="block text-sm text-[var(--muted)]">
              Label (optional)
              <input value={label} maxLength={LABEL_MAX} onChange={(e) => setLabel(e.target.value)} className={field} autoComplete="off" />
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
              <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
              Show me on this app’s public team
            </label>
            <p className="text-xs text-[var(--muted)]" aria-label="Preview">
              Preview: {visible && shownName
                ? <strong className="text-[var(--ink)]">{shownName}{label.trim() ? ` · ${label.trim()}` : ''}</strong>
                : 'you will not appear on the public team.'}
            </p>
            {roster === null && (
              <p className="text-xs text-[var(--muted)]">Your saved profile can’t be shown here; saving replaces it.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button aria-label={busy ? 'Saving…' : 'Save profile'} type="submit" disabled={busy || (visible && !shownName)} className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? 'Saving…' : 'Save profile'}
              </button>
              <button type="button" onClick={() => void withdraw()} disabled={busy} className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-50">
                Withdraw from public team
              </button>
            </div>
            {visible && !shownName && <p className="text-xs text-[var(--muted)]">Add a display name to appear publicly.</p>}
          </form>

          {status && <p role={status.ok ? 'status' : 'alert'} className={`text-sm ${status.ok ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>{status.text}</p>}

          <div>
            <h4 className="text-sm font-semibold text-[var(--ink)]">Visible to visitors now</h4>
            {pub.length === 0 ? (
              <p className="mt-1 text-sm text-[var(--muted)]">No one is on the public team yet.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm text-[var(--ink)]">
                {pub.map((m, i) => <li key={i}>{m.display_name}{m.label ? <span className="text-[var(--muted)]"> · {m.label}</span> : null}</li>)}
              </ul>
            )}
          </div>

          {roster && (
            <div>
              <h4 className="text-sm font-semibold text-[var(--ink)]">Moderate the public list</h4>
              <p className="mt-1 text-xs text-[var(--muted)]">You can take someone off the list; you can’t publish for them. Hiding isn’t a ban — to remove a person for good, remove them from the team.</p>
              <ul className="mt-2 divide-y divide-[var(--line)]">
                {roster.filter((m) => m.user_id !== userId).map((m) => (
                  <li key={m.user_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0 truncate text-[var(--ink)]">
                      {m.display_name ?? 'No public profile'}{m.label ? <span className="text-[var(--muted)]"> · {m.label}</span> : null}
                      <span className="ml-2 text-xs text-[var(--muted)]">{m.visible ? 'public' : 'not public'}</span>
                    </span>
                    {m.visible && (
                      <button type="button" disabled={busy} onClick={() => void hide(m)} aria-label={`Hide ${m.display_name ?? 'member'} from the public list`}
                        className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-xs text-[var(--ink)] disabled:opacity-50">
                        Hide
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}
