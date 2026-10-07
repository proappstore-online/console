import { useEffect, useRef, useState } from 'react'
import { ApiError } from './api'
import { completeGithubSetup } from './connectorsApi'
import { parseConnectorSetup } from './nav'

// The `code` GitHub returns is single-use, so the POST must run exactly once even
// if React re-mounts the effect.
let started = false

/** Landing for `#/connectors/github/setup?…` (platform#258): relay GitHub's parameters to the platform. */
export function ConnectorSetupView({ getToken, onDone }: { getToken: () => string | null; onDone: (appId: string) => void }) {
  const [error, setError] = useState<string | null>(null)
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    if (started) return
    started = true
    const params = parseConnectorSetup(location.hash)
    // Drop the single-use parameters from the URL and history right away.
    history.replaceState(null, '', location.pathname + location.search)
    completeGithubSetup(params, getToken())
      .then((r) => done.current(r.app_id))
      .catch((e) => setError(e instanceof ApiError ? e.message : (e as Error).message))
      .finally(() => { started = false })
  }, [getToken])

  return (
    <div className="max-w-md mx-auto py-12 text-center">
      {error ? (
        <>
          <p className="text-sm text-[var(--error)]">{error}</p>
          <p className="text-xs text-[var(--muted)] mt-2">Start again with Connect GitHub in the app's Settings → Integrations.</p>
          <a href="#/" className="mt-3 inline-block text-sm text-[var(--accent)]">Back to dashboard</a>
        </>
      ) : (
        <p className="text-[var(--muted)]">Connecting GitHub…</p>
      )}
    </div>
  )
}
