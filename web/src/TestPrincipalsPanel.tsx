import { useCallback, useEffect, useState } from 'react'
import { relativeTime } from './adminHelpers'
import { ResponsiveTable } from './ResponsiveTable'
import {
  type TestPrincipal,
  type OidcGrant,
  type PrincipalEvent,
  fetchTestPrincipals,
  fetchTestPrincipal,
  createTestPrincipal,
  setTestPrincipalStatus,
  fetchPrincipalEvents,
  createGrant,
  revokeGrant,
} from './testPrincipals'

// Admin-only panel for managed test principals and their least-privilege CI
// OIDC grants (platform#432) — the console counterpart to the MCP tools and
// the backend admin routes in oidc-session.ts. A test principal is a
// non-human account; a grant binds it to one repo/workflow/ref/environment
// with its own expiry, so a leaked or misconfigured CI job can't widen scope.

const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,39}$/

export function TestPrincipalsPanel({ getToken }: { getToken: () => string | null }) {
  const [principals, setPrincipals] = useState<TestPrincipal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const [newSlug, setNewSlug] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const data = await fetchTestPrincipals(token)
      setPrincipals(data.principals)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load test principals.')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    refresh()
  }, [refresh])

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const slug = newSlug.trim()
    if (!SLUG_RE.test(slug)) {
      setFormError('Slug must be 3-40 lowercase letters, digits or hyphens.')
      return
    }
    setFormError(null)
    setCreating(true)
    try {
      await createTestPrincipal(getToken(), slug, newDescription.trim() || null)
      setNewSlug('')
      setNewDescription('')
      await refresh()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create test principal.')
    } finally {
      setCreating(false)
    }
  }

  const onToggleStatus = async (p: TestPrincipal) => {
    try {
      await setTestPrincipalStatus(getToken(), p.id, p.status === 'disabled')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status.')
    }
  }

  if (loading) return <div className="h-24 rounded-2xl border border-[var(--line)] bg-[var(--panel)] animate-pulse" />

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 space-y-4">
      <div>
        <h2 className="display-font text-xl font-bold text-[var(--ink)]">Test principals</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Non-human accounts for CI smoke tests. Each least-privilege OIDC grant binds a repo, workflow, ref and
          expiry — no personal account, no stored token.
        </p>
      </div>

      {error && <p className="text-xs text-[var(--error)]">{error}</p>}

      <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-1">
          <span className="font-medium text-[var(--ink)]">Slug</span>
          <input
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            placeholder="e.g. grasskarma-e2e"
            className="rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1 text-[var(--ink)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-[var(--ink)]">Description</span>
          <input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="optional"
            className="w-56 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1 text-[var(--ink)]"
          />
        </label>
        <button
          aria-label={creating ? 'Creating...' : 'New principal'}
          type="submit"
          disabled={creating || !newSlug.trim()}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 font-semibold text-white disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'New principal'}
        </button>
      </form>
      {formError && <p className="text-xs text-[var(--error)]">{formError}</p>}

      {principals.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">No test principals yet.</p>
      ) : (
        <ResponsiveTable caption="Test principals" rows={principals} rowKey={(p) => p.id} className="text-xs" headClassName="text-[var(--muted)]"
          columns={[
            { key: 'slug', header: 'Slug', className: 'font-mono text-[var(--ink)]', cell: (p) => (
              <button onClick={() => setSelected(selected === p.id ? null : p.id)} className="text-left underline wrap-anywhere">{p.slug}</button>
            ) },
            { key: 'status', header: 'Status', cell: (p) => (
              <span className={`rounded px-1.5 py-0.5 ${p.status === 'active' ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'bg-[var(--error)]/10 text-[var(--error)]'}`}>
                {p.status}
              </span>
            ) },
            { key: 'description', header: 'Description', className: 'text-[var(--muted)]', cell: (p) => p.description ?? '—' },
            { key: 'created', header: 'Created', className: 'text-[var(--muted)]', cell: (p) => relativeTime(p.created_at) },
            { key: 'toggle', header: <span className="sr-only">Actions</span>, label: '', className: 'text-right', cell: (p) => (
              <button onClick={() => onToggleStatus(p)} className="text-[var(--muted)] underline hover:text-[var(--ink)]">
                {p.status === 'active' ? 'Disable' : 'Enable'}
              </button>
            ) },
          ]} />
      )}

      {selected && <PrincipalDetail principalId={selected} getToken={getToken} onChanged={refresh} />}
    </section>
  )
}

function PrincipalDetail({
  principalId,
  getToken,
  onChanged,
}: {
  principalId: string
  getToken: () => string | null
  onChanged: () => void
}) {
  const [grants, setGrants] = useState<OidcGrant[]>([])
  const [events, setEvents] = useState<PrincipalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const [detail, eventsRes] = await Promise.all([
        fetchTestPrincipal(token, principalId),
        fetchPrincipalEvents(token, principalId),
      ])
      setGrants(detail.grants)
      setEvents(eventsRes.events)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load grant detail.')
    } finally {
      setLoading(false)
    }
  }, [getToken, principalId])

  useEffect(() => {
    setLoading(true)
    refresh()
  }, [refresh])

  const onRevoke = async (id: string) => {
    try {
      await revokeGrant(getToken(), id)
      await refresh()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke grant.')
    }
  }

  if (loading) return <div className="h-16 rounded-xl border border-[var(--line)] bg-[var(--paper)] animate-pulse" />

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4 space-y-4">
      {error && <p className="text-xs text-[var(--error)]">{error}</p>}

      <div>
        <h3 className="text-sm font-semibold text-[var(--ink)]">Grants</h3>
        {grants.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--muted)]">No grants yet.</p>
        ) : (
          <div className="mt-2">
            <ResponsiveTable caption="Grants" rows={grants} rowKey={(g) => g.id} className="text-xs text-[var(--muted)]" headClassName="text-[var(--muted)]"
              columns={[
                { key: 'repository', header: 'Repository', className: 'font-mono text-[var(--ink)]', cell: (g) => g.repository },
                { key: 'workflow', header: 'Workflow', cell: (g) => g.workflow ?? 'any' },
                { key: 'ref', header: 'Ref', cell: (g) => g.ref },
                { key: 'environment', header: 'Environment', cell: (g) => g.environment ?? '—' },
                { key: 'expires', header: 'Expires', cell: (g) => g.expires_at ? relativeTime(g.expires_at) : '—' },
                { key: 'mints', header: 'Mints', cell: (g) => g.mint_count },
                { key: 'revoke', header: <span className="sr-only">Actions</span>, label: '', className: 'text-right', cell: (g) => g.revoked_at
                  ? <span className="text-[var(--muted)]">revoked</span>
                  : <button onClick={() => onRevoke(g.id)} className="text-[var(--error)] underline">Revoke</button> },
              ]} />
          </div>
        )}
        <NewGrantForm principalId={principalId} getToken={getToken} onCreated={() => { refresh(); onChanged() }} />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[var(--ink)]">Audit history</h3>
        {events.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--muted)]">No events recorded.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
            {events.map((e) => (
              <li key={e.id}>
                <span className="font-mono text-[var(--ink)]">{e.action}</span> by {e.actor} · {relativeTime(e.at)}
                {e.reason && <span> — "{e.reason}"</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function NewGrantForm({
  principalId,
  getToken,
  onCreated,
}: {
  principalId: string
  getToken: () => string | null
  onCreated: () => void
}) {
  const [repository, setRepository] = useState('proappstore-online/')
  const [workflow, setWorkflow] = useState('.github/workflows/deploy.yml')
  const [ref, setRef] = useState('refs/heads/main')
  const [environment, setEnvironment] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(30)
  const [scope, setScope] = useState<'user' | 'creator'>('user')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await createGrant(getToken(), {
        principal_id: principalId,
        repository: repository.trim(),
        workflow: workflow.trim(),
        ref: ref.trim(),
        environment: environment.trim() || undefined,
        expires_at: Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
        scope,
      })
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create grant.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-wrap items-end gap-2 text-xs">
      <label className="flex flex-col gap-1">
        <span className="font-medium text-[var(--ink)]">Repository</span>
        <input
          value={repository}
          onChange={(e) => setRepository(e.target.value)}
          className="w-56 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 text-[var(--ink)]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium text-[var(--ink)]">Workflow</span>
        <input
          value={workflow}
          onChange={(e) => setWorkflow(e.target.value)}
          className="w-56 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 text-[var(--ink)]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium text-[var(--ink)]">Ref</span>
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          className="w-40 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 text-[var(--ink)]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium text-[var(--ink)]">Environment</span>
        <input
          value={environment}
          onChange={(e) => setEnvironment(e.target.value)}
          placeholder="optional"
          className="w-32 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 text-[var(--ink)]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium text-[var(--ink)]">Expires in (days)</span>
        <input
          type="number"
          min={1}
          max={365}
          value={expiresInDays}
          onChange={(e) => setExpiresInDays(Number(e.target.value))}
          className="w-20 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 text-[var(--ink)]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium text-[var(--ink)]">Scope</span>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as 'user' | 'creator')}
          className="rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 text-[var(--ink)]"
        >
          <option value="user">user</option>
          <option value="creator">creator</option>
        </select>
      </label>
      <button aria-label={busy ? 'Creating...' : 'New grant'} type="submit" disabled={busy} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 font-semibold text-white disabled:opacity-50">
        {busy ? 'Creating...' : 'New grant'}
      </button>
      {error && <p className="w-full text-[var(--error)]">{error}</p>}
    </form>
  )
}
