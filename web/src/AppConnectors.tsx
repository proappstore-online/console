import { useState, useEffect, useCallback } from 'react'
import { ApiError } from './api'
import { fetchConnectors, githubInstallUrl, unbindGithubInstallation, type ConnectorsResponse } from './connectorsApi'

/**
 * Connectors (Settings → Integrations, platform#258/#261). Lists the connectors the
 * app's manifest declares and the GitHub App installations bound to it. Connecting
 * sends the owner to GitHub; GitHub returns to #/connectors/github/setup.
 */
export function AppConnectors({ appId, getToken }: { appId: string; getToken: () => string | null }) {
  const [data, setData] = useState<ConnectorsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try { setData(await fetchConnectors(appId, getToken())) }
    catch (e) { setError(e instanceof ApiError ? e.message : (e as Error).message) }
  }, [appId, getToken])

  useEffect(() => { load() }, [load])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await fn() } catch (e) { setError(e instanceof ApiError ? e.message : (e as Error).message) }
    setBusy(false)
  }

  const connect = () => run(async () => {
    const { url } = await githubInstallUrl(appId, getToken())
    window.location.assign(url)
  })

  const unbind = (id: number) => run(async () => {
    await unbindGithubInstallation(appId, id, getToken())
    await load()
  })

  const github = data?.connectors.filter((c) => c.kind === 'github') ?? []
  const appMode = github.some((c) => c.modes.includes('app'))

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide">Connectors</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Third-party accounts this app's worker can use, declared in its manifest. The platform proves you control a
            GitHub installation before binding it.
          </p>
        </div>
        <button type="button" onClick={load}
          className="text-xs text-[var(--muted)] hover:text-[var(--ink)] px-2 py-1 rounded border border-[var(--line)] hover:border-[var(--accent)] flex-shrink-0">
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-[var(--error)] py-2">{error}</p>}
      {!data && !error && <p className="text-sm text-[var(--muted)] py-3">Loading…</p>}

      {data && data.connectors.length === 0 && (
        <p className="text-sm text-[var(--muted)] mt-2">This app declares no connectors.</p>
      )}

      {data?.connectors.map((c) => (
        <div key={c.name} className="mt-2 rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
          <code className="font-semibold text-[var(--ink)]">{c.name}</code>
          <span className="text-[11px] text-[var(--muted)] ml-2">
            {c.kind} · modes: {c.modes.join(', ')}
            {c.pat_secret ? ` · PAT secret: ${c.pat_secret}` : ''}
            {c.events.length ? ` · events: ${c.events.join(', ')}` : ''}
          </span>
        </div>
      ))}

      {data && appMode && (
        <div className="mt-3 pt-3 border-t border-[var(--line)]">
          <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5">GitHub installations</p>
          {data.installations.length === 0 && <p className="text-sm text-[var(--muted)] mb-2">No GitHub account connected.</p>}
          <div className="space-y-1.5">
            {data.installations.map((i) => (
              <div key={i.installation_id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] px-3 py-2">
                <div className="min-w-0">
                  <code className="text-sm font-semibold text-[var(--ink)]">{i.account_login}</code>
                  <span className="text-[11px] text-[var(--muted)] ml-2">{i.account_type} · installation {i.installation_id}</span>
                </div>
                <button type="button" onClick={() => unbind(i.installation_id)} disabled={busy}
                  className="text-[11px] text-[var(--muted)] hover:text-[var(--error)] disabled:opacity-50">
                  Remove
                </button>
              </div>
            ))}
          </div>
          {data.configured ? (
            <button type="button" onClick={connect} disabled={busy}
              className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? 'Opening GitHub…' : 'Connect GitHub'}
            </button>
          ) : (
            <p className="mt-3 text-xs text-[var(--muted)]">The platform's GitHub App is not configured yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
