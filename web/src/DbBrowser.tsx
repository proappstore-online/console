import { useState, useEffect, useCallback } from 'react'
import type { Tab } from './dbBrowserTypes'
import { fetchTables } from './dbBrowserApi'
import { TablesTab } from './TablesTab'
import { QueryTab } from './QueryTab'
import { SchemaTab } from './SchemaTab'
import { ApiTab } from './ApiTab'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  appId: string
  getToken: () => string | null
}

export function DbBrowser({ appId, getToken }: Props) {
  const [tab, setTab] = useState<Tab>('tables')
  const [tables, setTables] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const token = getToken()
    if (!token) { setLoadError('Not signed in.'); setLoading(false); return }
    try {
      const t = await fetchTables(token, appId)
      setTables(t)
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

  const tabs: { key: Tab; label: string }[] = [
    { key: 'tables', label: 'Tables' },
    { key: 'query', label: 'SQL Query' },
    { key: 'schema', label: 'Schema Graph' },
    { key: 'api', label: 'API' },
  ]

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <h3 className="display-font text-lg font-bold text-[var(--ink)] mb-1">Database</h3>
      <p className="text-sm text-[var(--muted)] mb-4">
        Browse your app's D1 database at{' '}
        <code className="text-xs font-mono">data-{appId}.proappstore.online</code>.
      </p>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 border-b border-[var(--line)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-[var(--accent)] text-[var(--ink)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* The API tab reads the schema and the platform's endpoint routes itself, so the
          data-worker table load above does not gate it. */}
      {tab === 'api' && <ApiTab appId={appId} getToken={getToken} />}

      {tab !== 'api' && loading && <p className="text-sm text-[var(--muted)]">Loading...</p>}

      {tab !== 'api' && !loading && loadError && (
        <div className="space-y-2">
          <p className="text-sm text-[var(--error)]">Couldn't connect to data worker. {loadError}</p>
          <button
            onClick={() => { setLoading(true); reload() }}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !loadError && tab === 'tables' && (
        <TablesTab
          appId={appId}
          tables={tables}
          selectedTable={selectedTable}
          onSelectTable={setSelectedTable}
          getToken={getToken}
        />
      )}

      {!loading && !loadError && tab === 'query' && (
        <QueryTab appId={appId} getToken={getToken} />
      )}

      {!loading && !loadError && tab === 'schema' && (
        <SchemaTab appId={appId} getToken={getToken} />
      )}
    </section>
  )
}
