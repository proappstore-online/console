import { apiFetch, ApiError } from './api'
import type { SchemaColumn, TableSchema } from './dbSchema'

/**
 * Console-defined API endpoints (console#3). Wire shapes of
 * platform/packages/backend/src/routes/endpoints.ts and lib/endpoint-sql.ts
 * (#155): the console sends a structured config, the server re-reads the live
 * schema and generates the SQL. No SQL ever leaves the console.
 */

export const ENDPOINT_PREFIX = 'api_'
/** The part the creator types after the fixed `api_` prefix. */
export const ENDPOINT_SUFFIX_RE = /^[a-z][a-z0-9_]{0,55}$/
export type FilterOp = 'eq' | 'lt' | 'lte' | 'gt' | 'gte'
export const FILTER_OPS: { op: FilterOp; label: string }[] = [
  { op: 'eq', label: '=' }, { op: 'lt', label: '<' }, { op: 'lte', label: '<=' }, { op: 'gt', label: '>' }, { op: 'gte', label: '>=' },
]
export type EndpointKind = 'read' | 'insert'
export type EndpointScope = 'own' | 'all' | 'public'

export interface EndpointFilter { column: string; op: FilterOp; optional?: boolean; max?: number }
export interface EndpointConfig {
  name: string
  description: string
  kind: EndpointKind
  table: string
  scope: EndpointScope
  owner_column?: string
  columns: string[]
  filters?: EndpointFilter[]
  sort?: { column: string; dir: 'asc' | 'desc' }
  page_size?: number
  paginate?: boolean
  generated?: Record<string, '__uuid' | '__now'>
  defaults?: Record<string, string | number | boolean>
  app_roles?: string[]
}

export interface ToolParam { type: string; description?: string; optional?: boolean; default?: unknown; max?: number }
export interface EndpointManifest {
  name: string
  description: string
  operation: 'query' | 'execute'
  sql: string
  params: Record<string, ToolParam>
  requires_auth: boolean
}
export interface Endpoint {
  name: string
  config: EndpointConfig | null
  manifest: EndpointManifest | null
  updated_at: number
  updated_by: string | null
  status: 'ok' | 'broken'
  error?: string
}

const base = (appId: string) => `/apps/${encodeURIComponent(appId)}`

export const listEndpoints = (appId: string, token: string | null) =>
  apiFetch<{ endpoints: Endpoint[] }>(`${base(appId)}/endpoints`, { token })

export const previewEndpoint = (appId: string, config: EndpointConfig, token: string | null) =>
  apiFetch<{ manifest: EndpointManifest }>(`${base(appId)}/endpoints/preview`, { token, method: 'POST', body: JSON.stringify({ config }) })

export const saveEndpoint = (appId: string, config: EndpointConfig, token: string | null) =>
  apiFetch<{ endpoint: Endpoint }>(`${base(appId)}/endpoints/${encodeURIComponent(config.name)}`, {
    token, method: 'PUT', body: JSON.stringify({ config }),
  })

export const deleteEndpoint = (appId: string, name: string, token: string | null) =>
  apiFetch<{ ok: true }>(`${base(appId)}/endpoints/${encodeURIComponent(name)}`, { token, method: 'DELETE' })

/** Runs the action as the signed-in console user — the same route an app or a personal token calls. */
export const callAction = (appId: string, name: string, params: Record<string, unknown>, token: string | null) =>
  apiFetch<unknown>(`${base(appId)}/actions/${encodeURIComponent(name)}`, { token, method: 'POST', body: JSON.stringify({ params }) })

/** The public URL of an endpoint. */
export const actionUrl = (appId: string, name: string) => `https://api.proappstore.online/v1${base(appId)}/actions/${name}`

export interface EndpointError { message: string; details: string[] }

/** One readable message (plus the server's details) for every status the endpoint routes answer. */
export function endpointErrorMessage(e: unknown): EndpointError {
  if (!(e instanceof ApiError)) return { message: 'Could not reach the platform. Check your connection and try again.', details: [] }
  const body = (e.body && typeof e.body === 'object' ? e.body : {}) as { details?: unknown }
  const details = Array.isArray(body.details) ? body.details.filter((d): d is string => typeof d === 'string') : []
  switch (e.status) {
    case 400: return { message: e.message, details }
    case 401: return { message: 'Your session has expired. Sign in again.', details: [] }
    case 409: return { message: 'That name is already used by an action in the repo\'s mcp.json. Pick another.', details: [] }
    case 422: return { message: 'The endpoint does not match the live database schema.', details: details.length ? details : [e.message] }
    case 503: return { message: 'Couldn\'t read the database schema. Try again.', details: [] }
    default: return { message: e.message, details }
  }
}

// ── Form logic (pure) ──────────────────────────────────────────────

const OWNER_CANDIDATES = ['user_id', 'owner_id', 'created_by']

/** The owner column to preselect for "Only the caller's rows": the first PAS convention the table has. */
export function defaultOwnerColumn(table: TableSchema | undefined): string | undefined {
  return OWNER_CANDIDATES.find((c) => table?.columns.some((col) => col.name === c))
}

export const maxPageSize = (scope: EndpointScope) => (scope === 'public' ? 500 : 100)

/** How an insert writes one column. */
export type InsertMode = 'param' | 'skip' | 'uuid' | 'now'
export interface InsertColumnState {
  /** The owner column: filled by the server from the caller, never writable. */
  owner: boolean
  /** NOT NULL, no default, not an auto rowid: the insert must supply it (as a param or generated). */
  required: boolean
  hasDefault: boolean
  canUuid: boolean
  canNow: boolean
  initial: InsertMode | 'server'
}

const isIntType = (t: string) => /INT/i.test(t)

export function insertColumnState(col: SchemaColumn, ownerColumn: string | undefined): InsertColumnState {
  const hasDefault = col.defaultValue !== null && col.defaultValue !== undefined
  const pk = col.primaryKeyPosition > 0
  const autoRowid = pk && isIntType(col.type)
  const canUuid = pk && !isIntType(col.type) && /TEXT|CHAR|CLOB|^$/i.test(col.type)
  const canNow = !pk && isIntType(col.type) && /(_at|_on|time|timestamp|date)$/i.test(col.name)
  const required = col.notNull && !hasDefault && !autoRowid
  if (col.name === ownerColumn) return { owner: true, required: false, hasDefault, canUuid: false, canNow: false, initial: 'server' }
  return { owner: false, required, hasDefault, canUuid, canNow, initial: canUuid ? 'uuid' : autoRowid ? 'skip' : 'param' }
}

/** Everything the form edits; turned into an EndpointConfig by draftToConfig. */
export interface Draft {
  suffix: string
  description: string
  kind: EndpointKind
  table: string
  scope: EndpointScope
  ownerColumn: string
  readColumns: string[]
  insertModes: Record<string, InsertMode>
  /** Raw text of "default value if omitted", by column. */
  defaults: Record<string, string>
  filters: EndpointFilter[]
  sort: { column: string; dir: 'asc' | 'desc' } | null
  pageSize: number
  paginate: boolean
  appRoles: string[]
}

export function emptyDraft(): Draft {
  return {
    suffix: '', description: '', kind: 'read', table: '', scope: 'own', ownerColumn: '', readColumns: [],
    insertModes: {}, defaults: {}, filters: [], sort: null, pageSize: 50, paginate: true, appRoles: [],
  }
}

/** Reset the table-dependent parts of a draft for a newly picked table. */
export function draftForTable(draft: Draft, table: TableSchema | undefined): Draft {
  const ownerColumn = defaultOwnerColumn(table) ?? ''
  return {
    ...draft,
    table: table?.name ?? '',
    ownerColumn: draft.scope === 'own' ? ownerColumn : '',
    readColumns: table?.columns.map((c) => c.name) ?? [],
    insertModes: insertModesFor(table, ownerColumn),
    defaults: {},
    filters: [],
    sort: null,
  }
}

export function insertModesFor(table: TableSchema | undefined, ownerColumn: string): Record<string, InsertMode> {
  const modes: Record<string, InsertMode> = {}
  for (const col of table?.columns ?? []) {
    const s = insertColumnState(col, ownerColumn)
    if (s.initial !== 'server') modes[col.name] = s.initial
  }
  return modes
}

function typedDefault(raw: string, col: SchemaColumn | undefined): string | number | boolean {
  const t = (col?.type ?? '').toUpperCase()
  if (t.includes('BOOL')) return raw === 'true' || raw === '1'
  if (/INT|REAL|FLOA|DOUB|NUMERIC|DECIMAL/.test(t) && raw.trim() !== '' && Number.isFinite(Number(raw))) return Number(raw)
  return raw
}

/** The exact EndpointConfig the server's validateEndpointConfig accepts — no extra keys. */
export function draftToConfig(d: Draft, table: TableSchema | undefined): EndpointConfig {
  const config: EndpointConfig = {
    name: `${ENDPOINT_PREFIX}${d.suffix}`, description: d.description.trim(), kind: d.kind, table: d.table, scope: d.scope, columns: [],
  }
  if (d.scope === 'own') config.owner_column = d.ownerColumn
  if (d.scope === 'all') config.app_roles = d.appRoles
  if (d.kind === 'read') {
    const order = table?.columns.map((c) => c.name) ?? d.readColumns
    config.columns = order.filter((c) => d.readColumns.includes(c))
    if (d.filters.length) config.filters = d.filters
    if (d.sort) config.sort = d.sort
    config.page_size = d.pageSize
    config.paginate = d.paginate
  } else {
    const generated: Record<string, '__uuid' | '__now'> = {}
    const defaults: Record<string, string | number | boolean> = {}
    for (const col of table?.columns ?? []) {
      if (col.name === d.ownerColumn) continue
      const mode = d.insertModes[col.name]
      if (mode === 'param') {
        config.columns.push(col.name)
        const raw = d.defaults[col.name]
        if (raw !== undefined && raw !== '') defaults[col.name] = typedDefault(raw, col)
      } else if (mode === 'uuid') generated[col.name] = '__uuid'
      else if (mode === 'now') generated[col.name] = '__now'
    }
    if (Object.keys(generated).length) config.generated = generated
    if (Object.keys(defaults).length) config.defaults = defaults
  }
  return config
}

/** Rebuild a draft from a saved endpoint's config, to edit it. */
export function configToDraft(c: EndpointConfig, table: TableSchema | undefined): Draft {
  const d: Draft = {
    ...emptyDraft(),
    suffix: c.name.startsWith(ENDPOINT_PREFIX) ? c.name.slice(ENDPOINT_PREFIX.length) : c.name,
    description: c.description, kind: c.kind, table: c.table, scope: c.scope,
    ownerColumn: c.owner_column ?? '', appRoles: c.app_roles ?? [],
  }
  if (c.kind === 'read') {
    return { ...d, readColumns: c.columns, filters: c.filters ?? [], sort: c.sort ?? null, pageSize: c.page_size ?? 50, paginate: c.paginate ?? false }
  }
  const insertModes: Record<string, InsertMode> = {}
  for (const col of table?.columns ?? []) {
    if (col.name === d.ownerColumn) continue
    insertModes[col.name] = c.columns.includes(col.name) ? 'param' : c.generated?.[col.name] === '__uuid' ? 'uuid' : c.generated?.[col.name] === '__now' ? 'now' : 'skip'
  }
  const defaults = Object.fromEntries(Object.entries(c.defaults ?? {}).map(([k, v]) => [k, String(v)]))
  return { ...d, insertModes, defaults }
}

/** Why the draft cannot be saved yet, checked before the server is asked; empty when it can. */
export function canSave(d: Draft): string[] {
  const reasons: string[] = []
  if (!ENDPOINT_SUFFIX_RE.test(d.suffix)) reasons.push('Name: start with a letter; use lowercase letters, digits and _ (up to 56 characters).')
  if (!d.description.trim()) reasons.push('Add a description.')
  if (!d.table) reasons.push('Pick a table.')
  if (d.scope === 'own' && !d.ownerColumn) reasons.push('Pick the owner column.')
  if (d.scope === 'all' && d.appRoles.length === 0) reasons.push('All rows needs at least one app role.')
  if (d.kind === 'insert' && d.scope !== 'own') reasons.push('Insert endpoints write the caller\'s own rows only.')
  if (d.kind === 'read') {
    if (d.readColumns.length === 0) reasons.push('Pick at least one column.')
    const max = maxPageSize(d.scope)
    if (!Number.isInteger(d.pageSize) || d.pageSize < 1 || d.pageSize > max) reasons.push(`Page size must be 1 to ${max}.`)
  } else if (!Object.values(d.insertModes).some((m) => m === 'param')) reasons.push('Pick at least one column to write.')
  return reasons
}

const sampleValue = (p: ToolParam): unknown => (p.type === 'integer' || p.type === 'number' ? 1 : p.type === 'boolean' ? true : 'value')

/** A copy-paste curl for the endpoint. Public endpoints get no Authorization header. */
export function curlFor(appId: string, name: string, params: Record<string, ToolParam>, scope: EndpointScope, values: Record<string, unknown> = {}): string {
  const body: Record<string, unknown> = {}
  for (const [k, p] of Object.entries(params)) {
    if (values[k] !== undefined && values[k] !== '') body[k] = values[k]
    else if (!p.optional && p.default === undefined) body[k] = sampleValue(p)
  }
  const data = JSON.stringify({ params: body }).replace(/'/g, `'\\''`)
  const headers = scope === 'public'
    ? '-H "Content-Type: application/json"'
    : '-H "Authorization: Bearer $PAS_TOKEN" -H "Content-Type: application/json"'
  return `curl -X POST ${actionUrl(appId, name)} \\\n  ${headers} \\\n  -d '${data}'`
}

/** Whether a param must be supplied (not optional, no default). */
export const paramRequired = (p: ToolParam) => !p.optional && p.default === undefined
