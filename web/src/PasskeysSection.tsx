/**
 * Profile → Passkeys (console#29): the one place to see, add, rename and remove
 * your passkeys. One passkey belongs to the parent domain proappstore.online and
 * works for the Console and every app (platform#699, #700).
 *
 * Adding a second passkey and removing one need a recent check: the platform
 * answers 403 `reauth_required`, and the section offers a passkey check first,
 * then a fresh sign-in, and retries the refused change.
 */

import { useCallback, useEffect, useState } from 'react'
import { relativeTime } from './adminHelpers'
import { PasskeyHostNote } from './OperatorStepUp'
import {
  listPasskeys, passkeyCode, passkeysAvailable, registerPasskey, removePasskey, renamePasskey, stepUpToken, stepUpWithPasskey,
  type Passkey,
} from './passkeyStepUp'

const BUTTON = 'rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-sm font-medium text-[var(--ink)] disabled:opacity-50'
const INPUT = 'min-w-0 flex-1 basis-48 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)]'

function message(e: unknown): string {
  if (e instanceof DOMException && e.name === 'NotAllowedError') return 'The passkey check was cancelled or timed out.'
  return e instanceof Error ? e.message : 'Something went wrong.'
}

/** A change the platform refused for want of a recent check, waiting to be retried. */
interface Pending { what: string; retry: (token: string) => Promise<void> }

export function PasskeysSection({ getToken, onReauth }: { getToken: () => string | null; onReauth: () => void }) {
  const available = passkeysAvailable()
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try { setPasskeys(await listPasskeys(token)) } catch (e) { setError(message(e)) }
  }, [getToken])

  useEffect(() => { if (available) void load() }, [available, load])

  /** Run a change with the step-up session when one is held, else the console session. */
  const change = async (what: string, act: (token: string) => Promise<void>) => {
    const session = getToken()
    if (!session) { setError('Your session has expired. Sign in again.'); return }
    setBusy(true); setError(null); setPending(null)
    try {
      await act(stepUpToken() ?? session)
      setEditing(null); setConfirming(null)
      await load()
    } catch (e) {
      if (passkeyCode(e) === 'reauth_required') setPending({ what, retry: act })
      else setError(message(e))
    } finally { setBusy(false) }
  }

  const verifyAndRetry = async (p: Pending) => {
    const session = getToken()
    if (!session) { setError('Your session has expired. Sign in again.'); return }
    setBusy(true); setError(null)
    try { await stepUpWithPasskey(session) } catch (e) { setError(message(e)); setBusy(false); return }
    setBusy(false)
    await change(p.what, p.retry)
  }

  const add = () => change('Adding a passkey', async (token) => { await registerPasskey(token, newName); setNewName('') })
  const rename = (id: string, name: string) => change('Renaming a passkey', (token) => renamePasskey(token, id, name))
  const remove = (id: string) => change('Removing a passkey', (token) => removePasskey(token, id))
  const hasPasskey = !!passkeys?.length

  return (
    <section id="passkeys" className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">Passkeys</h3>
      <p className="text-sm text-[var(--muted)] mb-4">
        One passkey works across ProAppStore: the Console and every app. It's needed to approve, refuse and open private documents.
      </p>
      {!available ? <PasskeyHostNote /> : (
        <div className="space-y-3" aria-live="polite">
          {passkeys === null ? (
            !error && <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : passkeys.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">You have no passkey yet.</p>
          ) : (
            <ul className="space-y-2">
              {passkeys.map((p) => (
                <li key={p.id} className="rounded-xl border border-[var(--line)] p-3">
                  {editing?.id === p.id ? (
                    <div className="flex flex-wrap gap-2">
                      <input aria-label="Passkey name" value={editing.name} maxLength={60} autoFocus className={INPUT}
                        onChange={(e) => setEditing({ id: p.id, name: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter' && editing.name.trim()) void rename(p.id, editing.name) }} />
                      <button type="button" className={BUTTON} disabled={busy || !editing.name.trim()} onClick={() => rename(p.id, editing.name)}>Save</button>
                      <button type="button" className="px-2 text-sm text-[var(--muted)] hover:text-[var(--ink)]" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="font-semibold text-[var(--ink)] break-words">{p.name}</p>
                        <p className="text-xs text-[var(--muted)]">
                          Added {relativeTime(p.created_at)} · last used {p.last_used_at ? relativeTime(p.last_used_at) : 'never'}
                        </p>
                      </div>
                      {confirming === p.id ? (
                        <span className="flex flex-wrap items-center gap-1">
                          <button type="button" disabled={busy} onClick={() => remove(p.id)}
                            className="rounded-lg bg-[var(--error)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                            {busy ? 'Removing…' : `Remove ${p.name}`}
                          </button>
                          <button type="button" disabled={busy} onClick={() => { setConfirming(null); setPending(null) }}
                            className="rounded-lg px-2 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--ink)]">Cancel</button>
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <button type="button" aria-label={`Rename ${p.name}`} onClick={() => { setEditing({ id: p.id, name: p.name }); setConfirming(null) }}
                            className="text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] underline">Rename</button>
                          <button type="button" aria-label={`Remove ${p.name}`} onClick={() => { setConfirming(p.id); setEditing(null) }}
                            className="text-xs font-medium text-[var(--error)] hover:underline">Remove</button>
                        </span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {passkeys !== null && (
            <div className="flex flex-wrap gap-2">
              <input aria-label="New passkey name" value={newName} maxLength={60} className={INPUT}
                placeholder="Name it, e.g. Work laptop (optional)" onChange={(e) => setNewName(e.target.value)} />
              <button type="button" className={BUTTON} disabled={busy} onClick={add}>Add a passkey</button>
            </div>
          )}

          {pending && (
            <div className="space-y-2 rounded-xl border border-[var(--line)] p-3">
              <p className="text-sm text-[var(--muted)]">
                {hasPasskey
                  ? `${pending.what} needs a passkey check or a sign-in within the last few minutes.`
                  : `${pending.what} needs a sign-in within the last few minutes. Sign in again, then retry.`}
              </p>
              <div className="flex flex-wrap gap-2">
                {hasPasskey && <button type="button" className={BUTTON} disabled={busy} onClick={() => verifyAndRetry(pending)}>Verify with passkey</button>}
                <button type="button" className={BUTTON} disabled={busy} onClick={onReauth}>Sign in again</button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-[var(--error)]">{error}</p>}
        </div>
      )}
    </section>
  )
}
