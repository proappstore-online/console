/**
 * The passkey step-up prompt (#244), shown where the platform refused a read
 * with `step_up_required` and `method: 'passkey'`. It verifies with the
 * console passkey, or first sets one up. Setting one up needs a sign-in within
 * the last few minutes, so it may ask for that first. Once verified,
 * `onVerified` retries the refused read with the held step-up session.
 */

import { useState } from 'react'
import { operatorErrorMessage } from './operator'
import { CONSOLE_HOST, passkeyCode, passkeysAvailable, registerPasskey, stepUpWithPasskey } from './passkeyStepUp'

type Stage = 'ready' | 'working' | 'no_passkey' | 'reauth'

export function OperatorStepUp({ getToken, windowSeconds, onVerified, onReauth }: {
  /** The console session: the ceremony is authorised by it, and the step-up session is minted from it. */
  getToken: () => string | null
  windowSeconds: number
  onVerified: () => void
  onReauth?: () => void
}) {
  const [stage, setStage] = useState<Stage>('ready')
  const [error, setError] = useState<string | null>(null)

  if (!passkeysAvailable()) {
    return (
      <p className="mt-3 text-sm text-[var(--muted)]">
        Documents open only after a passkey check, which works on{' '}
        <a className="underline text-[var(--ink)]" href={`https://${CONSOLE_HOST}/${window.location.hash}`}>{CONSOLE_HOST}</a>.
      </p>
    )
  }

  const run = async (register: boolean) => {
    const token = getToken()
    if (!token) { setError('Your session has expired. Sign in again.'); return }
    setStage('working')
    setError(null)
    try {
      if (register) await registerPasskey(token)
      await stepUpWithPasskey(token, windowSeconds)
      setStage('ready')
      onVerified()
    } catch (e) {
      const code = passkeyCode(e)
      if (code === 'no_passkey') { setStage('no_passkey'); return }
      if (code === 'reauth_required') { setStage('reauth'); return }
      setStage(register ? 'no_passkey' : 'ready')
      setError(e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'The passkey check was cancelled or timed out.'
        : operatorErrorMessage(e))
    }
  }

  const button = 'rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-sm font-medium text-[var(--ink)] disabled:opacity-50'
  return (
    <div className="mt-3 space-y-2" aria-live="polite">
      {(stage === 'ready' || stage === 'working') && (
        <button type="button" className={button} disabled={stage === 'working'} onClick={() => run(false)}>
          {stage === 'working' ? 'Waiting for your passkey…' : 'Verify with passkey'}
        </button>
      )}
      {stage === 'no_passkey' && (
        <>
          <p className="text-sm text-[var(--muted)]">You have no passkey for the console yet. Set one up to open documents.</p>
          <button type="button" className={button} onClick={() => run(true)}>Set up a passkey</button>
        </>
      )}
      {stage === 'reauth' && (
        <>
          <p className="text-sm text-[var(--muted)]">Setting up a passkey needs a sign-in within the last few minutes. Sign in again, then set it up.</p>
          {onReauth && <button type="button" className={button} onClick={onReauth}>Sign in again</button>}
        </>
      )}
      {error && <p role="alert" className="text-sm text-[var(--error)]">{error}</p>}
    </div>
  )
}
