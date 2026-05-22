import { useState, useEffect, useCallback } from 'react'

const API = 'https://api.proappstore.online/v1'

const SUPPORTED_EVENTS = [
  'notification.sent',
  'storage.uploaded',
]

interface WebhookRow {
  id: string
  event: string
  url: string
  active: number
  created_at: number
}

async function fetchWebhooks(token: string, appId: string): Promise<WebhookRow[]> {
  const res = await fetch(`${API}/apps/${encodeURIComponent(appId)}/webhooks`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Failed to load webhooks (${res.status})`)
  const data = (await res.json()) as { webhooks: WebhookRow[] }
  return data.webhooks ?? []
}

async function createWebhook(token: string, appId: string, event: string, url: string): Promise<{ id: string; secret: string }> {
  const res = await fetch(`${API}/apps/${encodeURIComponent(appId)}/webhooks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event, url }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(body || `Failed to create webhook (${res.status})`)
  }
  return (await res.json()) as { id: string; secret: string }
}

async function deleteWebhook(token: string, appId: string, id: string): Promise<void> {
  const res = await fetch(`${API}/apps/${encodeURIComponent(appId)}/webhooks/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Failed to delete webhook (${res.status})`)
}

async function testWebhook(token: string, appId: string, id: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${API}/apps/${encodeURIComponent(appId)}/webhooks/${id}/test`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Failed to test webhook (${res.status})`)
  return (await res.json()) as { status: number; body: string }
}

interface Props {
  appId: string
  getToken: () => string | null
}

export function WebhooksManager({ appId, getToken }: Props) {
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Add form
  const [event, setEvent] = useState(SUPPORTED_EVENTS[0]!)
  const [url, setUrl] = useState('')
  const [addState, setAddState] = useState<'idle' | 'saving' | { error: string }>('idle')
  const [newSecret, setNewSecret] = useState<{ id: string; secret: string } | null>(null)

  // Per-webhook action state
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})
  const [testing, setTesting] = useState<Record<string, boolean>>({})
  const [testResult, setTestResult] = useState<Record<string, { status: number; body: string }>>({})
  const [actionError, setActionError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const token = getToken()
    if (!token) { setLoadError('Not signed in.'); setLoading(false); return }
    try {
      const w = await fetchWebhooks(token, appId)
      setWebhooks(w)
      setLoadError(null)
    } catch (e) {
      setLoadError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [appId, getToken])

  useEffect(() => {
    setLoading(true)
    reload()
  }, [reload])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = getToken()
    if (!token) return
    const u = url.trim()
    if (!u) return
    setAddState('saving')
    setNewSecret(null)
    try {
      const result = await createWebhook(token, appId, event, u)
      setNewSecret(result)
      setUrl('')
      setEvent(SUPPORTED_EVENTS[0]!)
      setAddState('idle')
      await reload()
    } catch (err) {
      setAddState({ error: (err as Error).message })
    }
  }

  const handleDelete = async (id: string) => {
    const token = getToken()
    if (!token) return
    setDeleting((prev) => ({ ...prev, [id]: true }))
    setActionError(null)
    try {
      await deleteWebhook(token, appId, id)
      if (newSecret?.id === id) setNewSecret(null)
      await reload()
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setDeleting((prev) => ({ ...prev, [id]: false }))
    }
  }

  const handleTest = async (id: string) => {
    const token = getToken()
    if (!token) return
    setTesting((prev) => ({ ...prev, [id]: true }))
    setActionError(null)
    try {
      const result = await testWebhook(token, appId, id)
      setTestResult((prev) => ({ ...prev, [id]: result }))
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setTesting((prev) => ({ ...prev, [id]: false }))
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <h3 className="display-font text-lg font-bold text-[var(--ink)] mb-1">Webhooks</h3>
      <p className="text-sm text-[var(--muted)] mb-4">
        Receive signed HTTP callbacks when events occur in your app.
      </p>

      {/* Current webhooks */}
      <div className="mb-6">
        <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Registered webhooks
        </h4>

        {loading && <p className="text-sm text-[var(--muted)]">Loading...</p>}

        {!loading && loadError && (
          <p className="text-sm text-[var(--error)]">{loadError}</p>
        )}

        {!loading && !loadError && webhooks.length === 0 && (
          <p className="text-sm text-[var(--muted)] italic">
            No webhooks registered yet.
          </p>
        )}

        {!loading && !loadError && webhooks.length > 0 && (
          <ul className="space-y-2">
            {webhooks.map((w) => (
              <li
                key={w.id}
                className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <EventBadge event={w.event} />
                      <span className="text-sm font-mono text-[var(--ink)] truncate">
                        {w.url}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      Created {new Date(w.created_at * 1000).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-3">
                    <button
                      onClick={() => handleTest(w.id)}
                      disabled={testing[w.id]}
                      className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--line)] disabled:opacity-50"
                    >
                      {testing[w.id] ? 'Testing...' : 'Test'}
                    </button>
                    <button
                      onClick={() => handleDelete(w.id)}
                      disabled={deleting[w.id]}
                      className="rounded-lg border border-[var(--error)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--error)] hover:bg-[var(--error)]/10 disabled:opacity-50"
                    >
                      {deleting[w.id] ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
                {testResult[w.id] && (
                  <div className="mt-2 rounded-lg bg-[var(--line)]/50 px-3 py-2 text-xs font-mono text-[var(--muted)]">
                    Status: {testResult[w.id].status} &mdash; {testResult[w.id].body.slice(0, 200)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {actionError && (
          <p className="mt-2 text-sm text-[var(--error)]">{actionError}</p>
        )}
      </div>

      {/* Secret display (shown once after creation) */}
      {newSecret && (
        <div className="mb-6 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--accent)] mb-1">
            Signing secret (shown once — copy it now)
          </p>
          <code className="block text-xs font-mono text-[var(--ink)] break-all select-all">
            {newSecret.secret}
          </code>
        </div>
      )}

      {/* Add webhook form */}
      <div>
        <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Add webhook
        </h4>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="flex gap-2 flex-col sm:flex-row">
            <select
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              disabled={addState === 'saving'}
              className="rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] disabled:opacity-50"
            >
              {SUPPORTED_EVENTS.map((ev) => (
                <option key={ev} value={ev}>{ev}</option>
              ))}
            </select>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              disabled={addState === 'saving'}
              className="flex-1 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm font-mono text-[var(--ink)] placeholder:text-[var(--muted)]/60 focus:outline-none focus:border-[var(--ink)] disabled:opacity-50"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={addState === 'saving' || !url.trim()}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {addState === 'saving' ? 'Adding...' : 'Add webhook'}
            </button>
            {typeof addState === 'object' && (
              <span className="text-xs text-[var(--error)]">{addState.error}</span>
            )}
          </div>
        </form>
      </div>
    </section>
  )
}

function EventBadge({ event }: { event: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--accent)]">
      {event}
    </span>
  )
}
