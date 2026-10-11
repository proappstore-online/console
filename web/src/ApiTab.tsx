import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { apiFetch, ApiError } from './api'
import { pro } from './sdk'
import { fetchDatabaseSchema } from './dbBrowserApi'
import type { DatabaseSchema } from './dbSchema'
import { ResultsTable } from './ResultsTable'
import { CopyOpen } from './AppPublishing'
import { appMcpEndpoint } from './AppMcpTools'
import {
  ENDPOINT_PREFIX, FILTER_OPS,
  actionUrl, callAction, canSave, configToDraft, curlFor, defaultOwnerColumn, deleteEndpoint, draftForTable,
  draftToConfig, emptyDraft, endpointErrorMessage, insertColumnState, insertModesFor, listEndpoints, maxPageSize,
  paramRequired, previewEndpoint, saveEndpoint,
  type Draft, type Endpoint, type EndpointError, type EndpointManifest, type EndpointScope, type InsertMode,
} from './endpointsApi'

/**
 * Data → API (console#3): expose a table as a read or insert endpoint without
 * writing SQL. The form builds a structured config; the platform (#155) reads
 * the live schema, generates the SQL, and returns it for preview — the only
 * place SQL appears here.
 */

const DANGER = 'var(--danger,#dc2626)'
const PREVIEW_DEBOUNCE_MS = 400
const SUGGESTED_ROLES = ['moderator', 'editor', 'viewer']
const PRIMARY = 'rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50'
const SECONDARY = 'rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-sm text-[var(--ink)] hover:border-[var(--accent)] disabled:opacity-50'
const CONTROL = 'rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 text-sm text-[var(--ink)]'
const PRE = 'text-[11px] bg-[var(--paper)] border border-[var(--line)] rounded-lg p-2.5 overflow-x-auto'

const SCOPE_LABEL: Record<EndpointScope, string> = { own: 'own rows', all: 'all rows', public: 'public' }

interface Props { appId: string; getToken: () => string | null }

export function ApiTab({ appId, getToken }: Props) {
  const [endpoints, setEndpoints] = useState<Endpoint[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [schema, setSchema] = useState<DatabaseSchema | null>(null)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [roles, setRoles] = useState<string[]>(SUGGESTED_ROLES)
  const [editing, setEditing] = useState<{ draft: Draft; saved: Endpoint | null } | null>(null)

  const loadList = useCallback(async () => {
    setListError(null)
    try {
      setEndpoints((await listEndpoints(appId, getToken())).endpoints)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setUnavailable(true)
      else setListError(endpointErrorMessage(e).message)
    }
  }, [appId, getToken])

  useEffect(() => { void loadList() }, [loadList])

  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetchDatabaseSchema(token, appId).then(setSchema, (e: Error) => setSchemaError(e.message))
    // Role names to suggest for "All rows": the defaults plus any role already granted on this app.
    apiFetch<{ roles?: { role_name?: string; roleName?: string }[] }>(`/apps/${encodeURIComponent(appId)}/roles`, { token })
      .then((r) => {
        const granted = (r.roles ?? []).map((x) => x.role_name ?? x.roleName).filter((n): n is string => !!n && n !== 'owner')
        setRoles([...new Set([...SUGGESTED_ROLES, ...granted])])
      }, () => {})
  }, [appId, getToken])

  const tableNamed = (name: string) => schema?.tables.find((t) => t.name === name)

  if (unavailable) {
    return <p className="text-sm text-[var(--muted)]">Not available yet — the platform's endpoint routes are not deployed.</p>
  }

  if (editing) {
    return (
      <EndpointEditor
        key={editing.saved?.name ?? 'new'}
        appId={appId} getToken={getToken} schema={schema} schemaError={schemaError} roles={roles}
        initial={editing.draft} saved={editing.saved}
        onSaved={(saved) => { setEditing({ draft: configToDraft(saved.config!, tableNamed(saved.config!.table)), saved }); void loadList() }}
        onDeleted={() => { setEditing(null); void loadList() }}
        onClose={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Expose a table as a read or insert endpoint — no SQL. Each endpoint is also a tool on this app's MCP server.
        </p>
        <button type="button" onClick={() => setEditing({ draft: emptyDraft(), saved: null })} className={`${PRIMARY} flex-shrink-0`}>New endpoint</button>
      </div>

      {listError && <p role="alert" className="text-sm" style={{ color: DANGER }}>{listError}</p>}
      {!endpoints && !listError && <p className="text-sm text-[var(--muted)]">Loading…</p>}
      {endpoints && endpoints.length === 0 && (
        <p className="text-sm text-[var(--muted)]">No endpoints yet. Create one to let your app, an MCP client or a script read or write a table.</p>
      )}
      {endpoints?.map((ep) => {
        const kind = ep.config?.kind ?? (ep.manifest?.operation === 'execute' ? 'insert' : 'read')
        return (
          <div key={ep.name} data-testid={`endpoint-${ep.name}`} className="rounded-xl border border-[var(--line)] p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-sm font-semibold text-[var(--ink)]">{ep.name}</code>
              <Badge>{kind}</Badge>
              {ep.config && <span className="text-[11px] text-[var(--muted)]">{ep.config.table}</span>}
              {ep.config && <Badge>{SCOPE_LABEL[ep.config.scope]}</Badge>}
              <Badge tone={ep.status === 'broken' ? 'danger' : 'ok'}>{ep.status}</Badge>
              <button type="button" disabled={!ep.config}
                onClick={() => ep.config && setEditing({ draft: configToDraft(ep.config, tableNamed(ep.config.table)), saved: ep })}
                className={`ml-auto ${SECONDARY} text-xs`}>
                Edit
              </button>
            </div>
            {ep.status === 'broken' && ep.error && <p className="mt-1 text-xs" style={{ color: DANGER }}>{ep.error}</p>}
          </div>
        )
      })}
    </div>
  )
}

// ── Editor ─────────────────────────────────────────────────────────

interface EditorProps {
  appId: string
  getToken: () => string | null
  schema: DatabaseSchema | null
  schemaError: string | null
  roles: string[]
  initial: Draft
  saved: Endpoint | null
  onSaved: (endpoint: Endpoint) => void
  onDeleted: () => void
  onClose: () => void
}

function EndpointEditor({ appId, getToken, schema, schemaError, roles, initial, saved, onSaved, onDeleted, onClose }: EditorProps) {
  const [draft, setDraft] = useState<Draft>(initial)
  const [preview, setPreview] = useState<EndpointManifest | null>(null)
  const [previewError, setPreviewError] = useState<EndpointError | null>(null)
  const [saveError, setSaveError] = useState<EndpointError | null>(null)
  const [busy, setBusy] = useState(false)
  const [customRole, setCustomRole] = useState('')
  const requestVersion = useRef(0)

  const table = schema?.tables.find((t) => t.name === draft.table)
  const config = useMemo(() => draftToConfig(draft, table), [draft, table])
  const blockers = canSave(draft)
  const configKey = JSON.stringify(config)
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  // Debounced preview. A newer edit bumps the version, so a slower, older answer is dropped.
  useEffect(() => {
    const version = ++requestVersion.current
    if (blockers.length) { setPreview(null); setPreviewError(null); return }
    const timer = setTimeout(() => {
      previewEndpoint(appId, JSON.parse(configKey), getToken())
        .then((r) => { if (version === requestVersion.current) { setPreview(r.manifest); setPreviewError(null) } })
        .catch((e) => { if (version === requestVersion.current) { setPreview(null); setPreviewError(endpointErrorMessage(e)) } })
    }, PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [appId, configKey, getToken, blockers.length])
  useEffect(() => () => { requestVersion.current += 1 }, [])

  const setKind = (kind: Draft['kind']) => setDraft((d) => {
    const scope = kind === 'insert' ? 'own' : d.scope
    const ownerColumn = scope === 'own' ? (d.ownerColumn || defaultOwnerColumn(table) || '') : ''
    return { ...d, kind, scope, ownerColumn, insertModes: insertModesFor(table, ownerColumn), appRoles: scope === 'all' ? d.appRoles : [] }
  })
  const setScope = (scope: EndpointScope) => setDraft((d) => {
    const ownerColumn = scope === 'own' ? (d.ownerColumn || defaultOwnerColumn(table) || '') : ''
    return { ...d, scope, ownerColumn, appRoles: scope === 'all' ? d.appRoles : [], pageSize: Math.min(d.pageSize, maxPageSize(scope)) }
  })
  const setOwner = (ownerColumn: string) => setDraft((d) => ({ ...d, ownerColumn, insertModes: insertModesFor(table, ownerColumn) }))
  const setMode = (col: string, mode: InsertMode) => setDraft((d) => ({ ...d, insertModes: { ...d.insertModes, [col]: mode } }))
  const toggleRole = (role: string) => setDraft((d) => ({ ...d, appRoles: d.appRoles.includes(role) ? d.appRoles.filter((r) => r !== role) : [...d.appRoles, role] }))

  const save = async () => {
    setBusy(true); setSaveError(null)
    try { onSaved((await saveEndpoint(appId, config, getToken())).endpoint) } catch (e) { setSaveError(endpointErrorMessage(e)) }
    setBusy(false)
  }
  const remove = async () => {
    if (!saved || !window.confirm(`Delete ${saved.name}? Apps and MCP clients calling it will get an error.`)) return
    setBusy(true); setSaveError(null)
    try { await deleteEndpoint(appId, saved.name, getToken()); onDeleted() } catch (e) { setSaveError(endpointErrorMessage(e)); setBusy(false) }
  }

  const numericColumn = (name: string) => /INT|REAL|FLOA|DOUB|NUMERIC|DECIMAL/i.test(table?.columns.find((c) => c.name === name)?.type ?? '')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-[var(--ink)]">{saved ? `Edit ${saved.name}` : 'New endpoint'}</h4>
        <button type="button" onClick={onClose} className={`${SECONDARY} text-xs`}>Back to list</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,420px)]">
        <div className="space-y-4">
          <Section title="Endpoint">
            <label className="block text-xs text-[var(--muted)]">Name
              <div className="mt-1 flex items-center">
                <span className="rounded-l-lg border border-r-0 border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1 text-sm font-mono text-[var(--muted)]">{ENDPOINT_PREFIX}</span>
                <input aria-label="Name" value={draft.suffix} disabled={!!saved} maxLength={56}
                  onChange={(e) => update({ suffix: e.target.value })} className={`${CONTROL} rounded-l-none font-mono flex-1 min-w-0`} />
              </div>
            </label>
            <label className="mt-2 block text-xs text-[var(--muted)]">Description
              <input aria-label="Description" value={draft.description} onChange={(e) => update({ description: e.target.value })} className={`${CONTROL} mt-1 w-full`} />
            </label>
            <fieldset className="mt-3">
              <legend className="text-xs text-[var(--muted)]">Kind</legend>
              <div className="mt-1 flex gap-4 text-sm text-[var(--ink)]">
                <label><input type="radio" name="kind" checked={draft.kind === 'read'} onChange={() => setKind('read')} /> Read</label>
                <label><input type="radio" name="kind" checked={draft.kind === 'insert'} disabled={draft.scope !== 'own'} onChange={() => setKind('insert')} /> Insert</label>
              </div>
              {draft.scope !== 'own' && <p className="mt-1 text-[11px] text-[var(--muted)]">Insert endpoints write the caller's own rows only.</p>}
            </fieldset>
            <label className="mt-3 block text-xs text-[var(--muted)]">Table
              {schemaError ? <p className="mt-1 text-sm" style={{ color: DANGER }}>Couldn't read the database schema. {schemaError}</p> : (
                <select aria-label="Table" value={draft.table} disabled={!schema}
                  onChange={(e) => setDraft((d) => draftForTable(d, schema?.tables.find((t) => t.name === e.target.value)))}
                  className={`${CONTROL} mt-1 w-full`}>
                  <option value="">{schema ? 'Pick a table' : 'Loading schema…'}</option>
                  {schema?.tables.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
              )}
            </label>
          </Section>

          <Section title="Who can call it">
            <div className="space-y-2 text-sm text-[var(--ink)]">
              <label className="block"><input type="radio" name="scope" checked={draft.scope === 'own'} onChange={() => setScope('own')} /> Only the caller's rows</label>
              {draft.scope === 'own' && (
                <label className="ml-5 block text-xs text-[var(--muted)]">Owner column
                  <select aria-label="Owner column" value={draft.ownerColumn} onChange={(e) => setOwner(e.target.value)} className={`${CONTROL} ml-2`}>
                    <option value="">Pick a column</option>
                    {table?.columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </label>
              )}
              <label className="block"><input type="radio" name="scope" checked={draft.scope === 'all'} disabled={draft.kind === 'insert'} onChange={() => setScope('all')} /> All rows (app role required)</label>
              {draft.scope === 'all' && (
                <div className="ml-5">
                  <div className="flex flex-wrap gap-1.5">
                    {[...new Set([...roles, ...draft.appRoles])].map((r) => (
                      <label key={r} className="text-xs rounded border border-[var(--line)] px-2 py-0.5">
                        <input type="checkbox" aria-label={`Role ${r}`} checked={draft.appRoles.includes(r)} onChange={() => toggleRole(r)} /> {r}
                      </label>
                    ))}
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    <input aria-label="Custom role" placeholder="other role" value={customRole} onChange={(e) => setCustomRole(e.target.value)} className={`${CONTROL} text-xs`} />
                    <button type="button" className={`${SECONDARY} text-xs`} disabled={!customRole.trim()}
                      onClick={() => { const r = customRole.trim(); if (!draft.appRoles.includes(r)) toggleRole(r); setCustomRole('') }}>Add</button>
                  </div>
                </div>
              )}
              <label className="block"><input type="radio" name="scope" checked={draft.scope === 'public'} disabled={draft.kind === 'insert'} onChange={() => setScope('public')} /> Public</label>
              {draft.scope === 'public' && (
                <p role="note" className="ml-5 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-2 text-xs text-[var(--ink)]">
                  Anyone on the internet can call this. Only pick columns you'd publish.
                </p>
              )}
            </div>
          </Section>

          {table && (
            <Section title="Columns">
              {draft.kind === 'read' ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {table.columns.map((c) => (
                    <label key={c.name} className="text-sm text-[var(--ink)]">
                      <input type="checkbox" aria-label={`Column ${c.name}`} checked={draft.readColumns.includes(c.name)}
                        onChange={() => update({ readColumns: draft.readColumns.includes(c.name) ? draft.readColumns.filter((x) => x !== c.name) : [...draft.readColumns, c.name] })} />{' '}
                      <code>{c.name}</code>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {table.columns.map((c) => {
                    const s = insertColumnState(c, draft.ownerColumn)
                    if (s.owner) return <p key={c.name} className="text-sm text-[var(--muted)]"><code>{c.name}</code> — filled by the server</p>
                    const mode = draft.insertModes[c.name] ?? 'skip'
                    const generated = mode === 'uuid' || mode === 'now'
                    const locked = s.required && mode === 'param'
                    return (
                      <div key={c.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--ink)]">
                        <label>
                          <input type="checkbox" aria-label={`Column ${c.name}`} checked={mode === 'param'} disabled={locked || generated}
                            onChange={() => setMode(c.name, mode === 'param' ? 'skip' : 'param')} />{' '}
                          <code>{c.name}</code>{locked && <span className="text-[11px] text-[var(--muted)]"> (required)</span>}
                        </label>
                        {s.canUuid && (
                          <label className="text-xs text-[var(--muted)]">
                            <input type="checkbox" aria-label={`Generate ${c.name}`} checked={mode === 'uuid'} onChange={() => setMode(c.name, mode === 'uuid' ? 'param' : 'uuid')} /> Generate automatically (UUID)
                          </label>
                        )}
                        {s.canNow && (
                          <label className="text-xs text-[var(--muted)]">
                            <input type="checkbox" aria-label={`Set ${c.name} to now`} checked={mode === 'now'} onChange={() => setMode(c.name, mode === 'now' ? (s.required ? 'param' : 'skip') : 'now')} /> Set to now
                          </label>
                        )}
                        {s.hasDefault && mode === 'param' && (
                          <input aria-label={`Default for ${c.name}`} placeholder="default value if omitted" value={draft.defaults[c.name] ?? ''}
                            onChange={(e) => update({ defaults: { ...draft.defaults, [c.name]: e.target.value } })} className={`${CONTROL} text-xs`} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>
          )}

          {table && draft.kind === 'read' && (
            <Section title="Filters, sort and paging">
              {draft.filters.map((f, i) => {
                const setFilter = (patch: Partial<typeof f>) => update({ filters: draft.filters.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
                return (
                  <div key={i} className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <select aria-label={`Filter ${i + 1} column`} value={f.column} onChange={(e) => setFilter({ column: e.target.value, max: undefined })} className={CONTROL}>
                      {table.columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                    <select aria-label={`Filter ${i + 1} operator`} value={f.op} onChange={(e) => setFilter({ op: e.target.value as typeof f.op })} className={CONTROL}>
                      {FILTER_OPS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                    </select>
                    <label className="text-[var(--muted)]"><input type="checkbox" checked={!!f.optional} onChange={(e) => setFilter({ optional: e.target.checked || undefined })} /> optional</label>
                    {numericColumn(f.column) && (
                      <input type="number" aria-label={`Filter ${i + 1} max`} placeholder="max" value={f.max ?? ''}
                        onChange={(e) => setFilter({ max: e.target.value === '' ? undefined : Number(e.target.value) })} className={`${CONTROL} w-20`} />
                    )}
                    <button type="button" onClick={() => update({ filters: draft.filters.filter((_, j) => j !== i) })} className="text-[var(--muted)] hover:text-[var(--ink)]">Remove</button>
                  </div>
                )
              })}
              <button type="button" className={`${SECONDARY} text-xs`}
                onClick={() => update({ filters: [...draft.filters, { column: table.columns[0]!.name, op: 'eq' }] })}>Add filter</button>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                <label>Sort
                  <select aria-label="Sort column" value={draft.sort?.column ?? ''} className={`${CONTROL} ml-1`}
                    onChange={(e) => update({ sort: e.target.value ? { column: e.target.value, dir: draft.sort?.dir ?? 'asc' } : null })}>
                    <option value="">none</option>
                    {table.columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </label>
                {draft.sort && (
                  <select aria-label="Sort direction" value={draft.sort.dir} className={CONTROL}
                    onChange={(e) => update({ sort: { column: draft.sort!.column, dir: e.target.value as 'asc' | 'desc' } })}>
                    <option value="asc">ascending</option><option value="desc">descending</option>
                  </select>
                )}
                <label className="ml-2">Page size
                  <input type="number" aria-label="Page size" min={1} max={maxPageSize(draft.scope)} value={draft.pageSize}
                    onChange={(e) => update({ pageSize: Number(e.target.value) })} className={`${CONTROL} ml-1 w-20`} />
                  <span className="ml-1">max {maxPageSize(draft.scope)}</span>
                </label>
                <label className="ml-2"><input type="checkbox" aria-label="Paginate" checked={draft.paginate} onChange={(e) => update({ paginate: e.target.checked })} /> Paginate</label>
              </div>
            </Section>
          )}

          {blockers.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-[var(--muted)]" aria-label="Before you can save">
              {blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          )}
          {saveError && <ErrorBlock error={saveError} />}
          <div className="flex gap-2">
            <button type="button" onClick={() => void save()} disabled={busy || blockers.length > 0} className={PRIMARY}>{busy ? 'Saving…' : 'Save'}</button>
            {saved && <button type="button" onClick={() => void remove()} disabled={busy} className={SECONDARY} style={{ color: DANGER }}>Delete</button>}
          </div>
        </div>

        <div className="space-y-4 min-w-0">
          <Section title="Preview">
            {previewError && <ErrorBlock error={previewError} />}
            {!preview && !previewError && <p className="text-xs text-[var(--muted)]">{blockers.length ? 'Fill in the form to see the generated SQL.' : 'Generating…'}</p>}
            {preview && (
              <>
                <pre data-testid="preview-sql" className={`${PRE} text-[var(--ink)] whitespace-pre-wrap`}>{preview.sql}</pre>
                <ParamTable params={preview.params} />
              </>
            )}
          </Section>
          {saved?.manifest && <TestPanel appId={appId} getToken={getToken} endpoint={saved} manifest={saved.manifest} />}
          {saved?.manifest && saved.config && <DocsPanel appId={appId} endpoint={saved} manifest={saved.manifest} scope={saved.config.scope} />}
        </div>
      </div>
    </div>
  )
}

// ── Test call ─────────────────────────────────────────────────────

function coerce(raw: string, type: string): unknown {
  if (type === 'integer' || type === 'number') return Number(raw)
  if (type === 'boolean') return raw === 'true'
  return raw
}

function TestPanel({ appId, getToken, endpoint, manifest }: { appId: string; getToken: () => string | null; endpoint: Endpoint; manifest: EndpointManifest }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ ok: true; data: unknown } | { ok: false; status: number | null; message: string } | null>(null)
  const [running, setRunning] = useState(false)
  const login = pro.auth.user?.login

  const run = async () => {
    setRunning(true); setResult(null)
    const params: Record<string, unknown> = {}
    for (const [k, p] of Object.entries(manifest.params)) if (values[k] !== undefined && values[k] !== '') params[k] = coerce(values[k]!, p.type)
    try {
      setResult({ ok: true, data: await callAction(appId, endpoint.name, params, getToken()) })
    } catch (e) {
      setResult({ ok: false, status: e instanceof ApiError ? e.status : null, message: e instanceof ApiError ? e.message : 'Could not reach the platform. Try again.' })
    }
    setRunning(false)
  }

  const rows = result?.ok && result.data && typeof result.data === 'object' && Array.isArray((result.data as { rows?: unknown }).rows)
    ? (result.data as { rows: Record<string, unknown>[] }).rows : null

  return (
    <Section title="Test call">
      <p className="mb-2 text-xs text-[var(--muted)]">
        Running as you ({login ?? 'signed-in user'}). An own-rows endpoint returns your rows, not another user's.
      </p>
      {Object.entries(manifest.params).map(([k, p]) => (
        <label key={k} className="mb-1.5 flex items-center gap-2 text-xs text-[var(--muted)]">
          <code className="w-28 truncate text-[var(--ink)]">{k}</code>
          <input aria-label={`Param ${k}`} value={values[k] ?? ''} placeholder={`${p.type}${paramRequired(p) ? ', required' : ''}`}
            onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} className={`${CONTROL} flex-1 min-w-0 text-xs`} />
        </label>
      ))}
      <button type="button" onClick={() => void run()} disabled={running} className={PRIMARY}>{running ? 'Running…' : 'Run'}</button>
      {result && !result.ok && (
        <p role="alert" className="mt-2 text-sm" style={{ color: DANGER }}>{result.status ? `${result.status}: ` : ''}{result.message}</p>
      )}
      {result?.ok && (
        <div className="mt-2 space-y-2">
          <p role="status" className="text-xs text-[var(--success)]">OK{rows ? ` · ${rows.length} row${rows.length === 1 ? '' : 's'}` : ''}</p>
          {rows && rows.length > 0 && <ResultsTable columns={Object.keys(rows[0]!)} rows={rows} />}
          <pre data-testid="test-json" className={`${PRE} text-[var(--ink)] max-h-64`}>{JSON.stringify(result.data, null, 2)}</pre>
        </div>
      )}
    </Section>
  )
}

// ── Docs ───────────────────────────────────────────────────────────

function DocsPanel({ appId, endpoint, manifest, scope }: { appId: string; endpoint: Endpoint; manifest: EndpointManifest; scope: EndpointScope }) {
  const url = actionUrl(appId, endpoint.name)
  const curl = curlFor(appId, endpoint.name, manifest.params, scope)
  return (
    <Section title="Docs">
      <dl className="space-y-1.5 text-xs">
        <DocRow label="URL" value={url} />
        <DocRow label="MCP tool" value={`${appId}/${endpoint.name}`} />
        <DocRow label="MCP server" value={appMcpEndpoint(appId)} />
      </dl>
      <ParamTable params={manifest.params} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-[var(--muted)]">curl</span>
        <CopyOpen url={curl} openable={false} />
      </div>
      <pre data-testid="docs-curl" className={`${PRE} mt-1 text-[var(--ink)]`}>{curl}</pre>
      {scope !== 'public' && (
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          <code>$PAS_TOKEN</code> is a user's personal app token (<code>pas_at_…</code>), created in their app with{' '}
          <code>app.tokens.create(…)</code>. Your app can also call it with <code>app.actions.call</code>, and MCP clients through the server above.
        </p>
      )}
    </Section>
  )
}

function DocRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[var(--muted)] w-20 flex-shrink-0">{label}</dt>
      <dd className="min-w-0 flex-1 truncate font-mono text-[var(--ink)]">{value}</dd>
      <CopyOpen url={value} openable={false} />
    </div>
  )
}

// ── Shared bits ────────────────────────────────────────────────────

function ParamTable({ params }: { params: EndpointManifest['params'] }) {
  const entries = Object.entries(params)
  if (entries.length === 0) return <p className="mt-2 text-xs text-[var(--muted)]">No parameters.</p>
  return (
    <table className="mt-2 w-full text-left text-xs" aria-label="Parameters">
      <thead className="text-[var(--muted)]"><tr><th className="py-1">Param</th><th>Type</th><th>Required</th><th>Max</th></tr></thead>
      <tbody>
        {entries.map(([k, p]) => (
          <tr key={k} className="border-t border-[var(--line)] text-[var(--ink)]">
            <td className="py-1 font-mono">{k}</td><td>{p.type}</td>
            <td>{paramRequired(p) ? 'yes' : p.default !== undefined ? `no (default ${JSON.stringify(p.default)})` : 'no'}</td>
            <td>{p.max ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <h5 className="mb-2 text-sm font-semibold text-[var(--muted)] uppercase tracking-wide">{title}</h5>
      {children}
    </div>
  )
}

function Badge({ children, tone }: { children: ReactNode; tone?: 'ok' | 'danger' }) {
  const color = tone === 'danger' ? { color: DANGER, borderColor: DANGER } : tone === 'ok' ? { color: 'var(--success)', borderColor: 'var(--success)' } : undefined
  return <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-[var(--line)] text-[var(--muted)]" style={color}>{children}</span>
}

function ErrorBlock({ error }: { error: EndpointError }) {
  return (
    <div role="alert" className="text-sm" style={{ color: DANGER }}>
      <p>{error.message}</p>
      {error.details.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs">{error.details.map((d) => <li key={d}>{d}</li>)}</ul>}
    </div>
  )
}

