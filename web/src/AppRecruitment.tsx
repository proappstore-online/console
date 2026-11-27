import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './api'
import { fetchRecruitment, setRecruitment, type RecruitmentSettings } from './recruitmentApi'

export function AppRecruitment({ appId, token }: { appId: string; token: string | null }) {
  const [settings, setSettings] = useState<RecruitmentSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const version = useRef(0)
  const load = useCallback(async () => {
    const current = ++version.current
    setSettings(null); setError(null); setBusy(true)
    try {
      const result = await fetchRecruitment(appId, token)
      if (current === version.current) setSettings(result)
    } catch (e) {
      if (current !== version.current) return
      setError(e instanceof ApiError && [401, 403].includes(e.status)
        ? 'Only the current app owner can manage recruitment. Sign in again if your session has expired.'
        : e instanceof ApiError && e.status === 404 ? 'Recruitment controls are unavailable for this app or deployment.'
          : 'Could not read recruitment settings. Please try again.')
    } finally { if (current === version.current) setBusy(false) }
  }, [appId, token])
  useEffect(() => { void load(); return () => { version.current += 1 } }, [load])

  const change = async (accepting: boolean) => {
    if (busy) return
    const current = version.current
    setBusy(true); setError(null)
    try {
      const result = await setRecruitment(appId, token, accepting)
      if (current === version.current) setSettings(result)
    } catch {
      if (current !== version.current) return
      setSettings(null)
      setError('Could not confirm the recruitment update. Refresh to read the current setting.')
    } finally { if (current === version.current) setBusy(false) }
  }

  return <section aria-labelledby="recruitment-heading" className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5 space-y-3">
    <h3 id="recruitment-heading" className="text-base font-semibold text-[var(--ink)]">Team recruitment</h3>
    <p className="text-sm text-[var(--muted)]">Requests go to your private enquiry inbox. They do not grant membership or send an email.</p>
    {busy && !settings && <p role="status" className="text-sm text-[var(--muted)]">Loading recruitment settings…</p>}
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    {settings && <>
      <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--ink)]">
        <input type="checkbox" checked={settings.accepting_requests} disabled={busy} onChange={(e) => void change(e.target.checked)} />
        Accept requests to join this app
      </label>
      <p role="status" className="text-sm text-[var(--muted)]">{busy ? 'Saving recruitment setting…' : settings.accepting_requests ? 'Requests are open while this app is public and listed.' : 'Requests are closed. Existing enquiries remain in your inbox.'}</p>
    </>}
    <button type="button" disabled={busy} onClick={() => void load()} className="min-h-11 rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-50">Refresh recruitment settings</button>
  </section>
}
