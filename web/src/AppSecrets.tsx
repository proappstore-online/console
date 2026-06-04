import { useState, useEffect, useCallback } from 'react'
import { apiFetch, ApiError } from './api'

/**
 * App secrets (Settings → Integrations). The app's server-side secrets used by
 * the platform proxy (e.g. third-party API keys the app calls from the server,
 * never shipped to the client). Values are write-only — the API returns names +
 * metadata only, never the secret. Names are UPPER_SNAKE_CASE.
 */

interface SecretRow { name: string; createdAt: number; lastUsedAt: number | null }

const NAME_RE = /^[A-Z][A-Z0-9_]*$/

function ago(ms: number | null): string {
  if (!ms) return 'never'
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function AppSecrets({ appId, getToken }: { appId: string; getToken: () => string | null }) {
  const [secrets, setSecrets] = useState<SecretRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setError(null)
    try {
      const r = await apiFetch<{ secrets: SecretRow[] }>(`/apps/${appId}/secrets`, { token })
      setSecrets(r.secrets ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message)
      setSecrets([])
    }
    setLoading(false)
  }, [appId, getToken])

  useEffect(() => { load() }, [load])

  const save = async () => {
    const token = getToken()
    if (!token) return
    const n = name.trim().toUpperCase()
    if (!NAME_RE.test(n)) { setError('Name must be UPPER_SNAKE_CASE (e.g. OPENWEATHER_KEY)'); return }
    if (!value) { setError('Value is required'); return }
    setBusy(true); setError(null)
    try {
      await apiFetch(`/apps/${appId}/secrets/${encodeURIComponent(n)}`, { token, method: 'PUT', body: JSON.stringify({ value }) })
      setName(''); setValue('')
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message)
    }
    setBusy(false)
  }

  const remove = async (n: string) => {
    const token = getToken()
    if (!token) return
    setBusy(true); setError(null)
    try {
      await apiFetch(`/apps/${appId}/secrets/${encodeURIComponent(n)}`, { token, method: 'DELETE' })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message)
    }
    setBusy(false)
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide">Secrets</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Server-side secrets for this app (third-party API keys called via the platform proxy). Encrypted at rest;
            values are write-only and never shipped to the client.
          </p>
        </div>
        <button type="button" onClick={load}
          className="text-xs text-[var(--muted)] hover:text-[var(--ink)] px-2 py-1 rounded border border-[var(--line)] hover:border-[var(--accent)] flex-shrink-0">
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-[var(--error)] py-2">{error}</p>}
      {loading && <p className="text-sm text-[var(--muted)] py-3">Loading…</p>}

      {!loading && secrets && (
        <div className="space-y-1.5 mt-2">
          {secrets.length === 0 && <p className="text-sm text-[var(--muted)]">No secrets yet.</p>}
          {secrets.map((s) => (
            <div key={s.name} className="group flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] px-3 py-2">
              <div className="min-w-0">
                <code className="text-sm font-semibold text-[var(--ink)]">{s.name}</code>
                <span className="text-[11px] text-[var(--muted)] ml-2">added {ago(s.createdAt)} · used {ago(s.lastUsedAt)}</span>
              </div>
              <button type="button" onClick={() => remove(s.name)} disabled={busy}
                className="text-[11px] text-[var(--muted)] hover:text-[var(--error)] opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-[var(--line)] grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <label className="text-xs text-[var(--muted)]">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="OPENWEATHER_KEY"
            className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)] font-mono" />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Value
          <input value={value} type="password" onChange={(e) => setValue(e.target.value)} placeholder="secret value"
            onKeyDown={(e) => { if (e.key === 'Enter') save() }}
            className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)]" />
        </label>
        <button type="button" onClick={save} disabled={busy || !name.trim() || !value}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? 'Saving…' : 'Add'}
        </button>
      </div>
    </div>
  )
}
