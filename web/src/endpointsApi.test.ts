import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import type { SchemaColumn, TableSchema } from './dbSchema'
import {
  callAction, canSave, configToDraft, curlFor, defaultOwnerColumn, deleteEndpoint, draftForTable, draftToConfig,
  emptyDraft, endpointErrorMessage, insertColumnState, listEndpoints, maxPageSize, previewEndpoint, saveEndpoint,
  type Draft, type EndpointConfig,
} from './endpointsApi'

const col = (name: string, type: string, extra: Partial<SchemaColumn> = {}): SchemaColumn =>
  ({ name, type, notNull: false, defaultValue: null, primaryKeyPosition: 0, ...extra })
const table = (name: string, columns: SchemaColumn[]): TableSchema => ({ name, sql: '', columns, foreignKeys: [] })

const tasks = table('tasks', [
  col('id', 'TEXT', { primaryKeyPosition: 1, notNull: true }),
  col('owner_id', 'TEXT', { notNull: true }),
  col('title', 'TEXT', { notNull: true }),
  col('status', 'TEXT', { notNull: true, defaultValue: "'open'" }),
  col('note', 'TEXT'),
  col('created_at', 'INTEGER', { notNull: true }),
])

const readConfig: EndpointConfig = {
  name: 'api_list_tasks', description: 'List my tasks', kind: 'read', table: 'tasks', scope: 'own',
  owner_column: 'owner_id', columns: ['id', 'title'], page_size: 50, paginate: true,
}

function mockFetch(status = 200, body: unknown = {}) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('endpointsApi requests', () => {
  it('sends each route with the session bearer and the config wrapped as {config}', async () => {
    const f = mockFetch(200, { endpoints: [], manifest: {}, endpoint: {}, ok: true })
    await listEndpoints('crm', 'tok')
    await previewEndpoint('crm', readConfig, 'tok')
    await saveEndpoint('crm', readConfig, 'tok')
    await deleteEndpoint('crm', 'api_list_tasks', 'tok')
    await callAction('crm', 'api_list_tasks', { status: 'open' }, 'tok')

    const calls = f.mock.calls.map(([url, init]) => ({ path: new URL(url).pathname, method: init?.method ?? 'GET', body: init?.body }))
    expect(calls).toEqual([
      { path: '/v1/apps/crm/endpoints', method: 'GET', body: undefined },
      { path: '/v1/apps/crm/endpoints/preview', method: 'POST', body: JSON.stringify({ config: readConfig }) },
      { path: '/v1/apps/crm/endpoints/api_list_tasks', method: 'PUT', body: JSON.stringify({ config: readConfig }) },
      { path: '/v1/apps/crm/endpoints/api_list_tasks', method: 'DELETE', body: undefined },
      { path: '/v1/apps/crm/actions/api_list_tasks', method: 'POST', body: JSON.stringify({ params: { status: 'open' } }) },
    ])
    expect(f.mock.calls.every(([, init]) => (init?.headers as Record<string, string>).Authorization === 'Bearer tok')).toBe(true)
  })
})

describe('endpointErrorMessage', () => {
  const err = (status: number, body: unknown) => new ApiError(status, body)

  it('keeps the server error and details on 400', () => {
    expect(endpointErrorMessage(err(400, { error: 'invalid endpoint config', details: ['description is required'] })))
      .toEqual({ message: 'invalid endpoint config', details: ['description is required'] })
  })
  it('explains a 409 name clash with mcp.json', () => {
    expect(endpointErrorMessage(err(409, { error: '"api_x" is already registered by the app\'s code (mcp.json)' })).message)
      .toMatch(/already used by an action in the repo's mcp\.json/)
  })
  it('lists the coherence details on 422', () => {
    const r = endpointErrorMessage(err(422, { error: 'schema coherence: 1 action(s)…', details: ['tool "api_x": no such column: due_at'] }))
    expect(r.message).toMatch(/does not match the live database schema/)
    expect(r.details).toEqual(['tool "api_x": no such column: due_at'])
  })
  it('asks to retry on 503', () => {
    expect(endpointErrorMessage(err(503, { error: 'could not read the app schema' })))
      .toEqual({ message: 'Couldn\'t read the database schema. Try again.', details: [] })
  })
  it('passes other statuses through and handles a network failure', () => {
    expect(endpointErrorMessage(err(403, { error: 'forbidden' })).message).toBe('forbidden')
    expect(endpointErrorMessage(new TypeError('Failed to fetch')).message).toMatch(/Could not reach the platform/)
  })
})

describe('form logic', () => {
  it('preselects the first of user_id, owner_id, created_by the table has', () => {
    expect(defaultOwnerColumn(tasks)).toBe('owner_id')
    expect(defaultOwnerColumn(table('t', [col('created_by', 'TEXT'), col('user_id', 'TEXT')]))).toBe('user_id')
    expect(defaultOwnerColumn(table('t', [col('author', 'TEXT')]))).toBeUndefined()
    expect(draftForTable({ ...emptyDraft(), scope: 'own' }, tasks).ownerColumn).toBe('owner_id')
  })

  it('locks required insert columns, excludes the owner, and generates a TEXT primary key as a UUID by default', () => {
    expect(insertColumnState(tasks.columns[0]!, 'owner_id')).toMatchObject({ canUuid: true, initial: 'uuid' })
    expect(insertColumnState(tasks.columns[1]!, 'owner_id')).toMatchObject({ owner: true, initial: 'server' })
    expect(insertColumnState(tasks.columns[2]!, 'owner_id')).toMatchObject({ required: true, initial: 'param' })
    expect(insertColumnState(tasks.columns[3]!, 'owner_id')).toMatchObject({ required: false, hasDefault: true })
    expect(insertColumnState(tasks.columns[5]!, 'owner_id')).toMatchObject({ required: true, canNow: true })
    expect(insertColumnState(col('id', 'INTEGER', { primaryKeyPosition: 1, notNull: true }), 'owner_id')).toMatchObject({ required: false, initial: 'skip' })
  })

  it('builds an insert config the server accepts: owner from the caller, UUID id, defaults typed', () => {
    const d: Draft = { ...draftForTable({ ...emptyDraft(), kind: 'insert', suffix: 'add_task', description: 'Add a task' }, tasks), defaults: { status: 'open' } }
    d.insertModes.created_at = 'now'
    expect(draftToConfig(d, tasks)).toEqual({
      name: 'api_add_task', description: 'Add a task', kind: 'insert', table: 'tasks', scope: 'own', owner_column: 'owner_id',
      columns: ['title', 'status', 'note'], generated: { id: '__uuid', created_at: '__now' }, defaults: { status: 'open' },
    })
  })

  it('round-trips a saved config back into an editable draft', () => {
    const d = draftForTable({ ...emptyDraft(), kind: 'insert', suffix: 'add_task', description: 'Add' }, tasks)
    const config = draftToConfig(d, tasks)
    expect(draftToConfig(configToDraft(config, tasks), tasks)).toEqual(config)
    expect(draftToConfig(configToDraft(readConfig, tasks), tasks)).toEqual(readConfig)
  })

  it('caps page size at 500 for public and 100 otherwise, and refuses insert on any scope but own', () => {
    expect(maxPageSize('public')).toBe(500)
    expect(maxPageSize('own')).toBe(100)
    const read = { ...draftForTable({ ...emptyDraft(), suffix: 'feed', description: 'Feed' }, tasks), scope: 'public' as const, ownerColumn: '', pageSize: 500 }
    expect(canSave(read)).toEqual([])
    expect(canSave({ ...read, pageSize: 501 })).toContain('Page size must be 1 to 500.')
    expect(canSave({ ...read, scope: 'own', ownerColumn: 'owner_id' })).toContain('Page size must be 1 to 100.')
    expect(canSave({ ...read, kind: 'insert' })).toContain('Insert endpoints write the caller\'s own rows only.')
  })

  it('cannot save All rows without a role', () => {
    const d = { ...draftForTable({ ...emptyDraft(), suffix: 'all_tasks', description: 'All' }, tasks), scope: 'all' as const, ownerColumn: '' }
    expect(canSave(d)).toContain('All rows needs at least one app role.')
    expect(canSave({ ...d, appRoles: ['moderator'] })).toEqual([])
    expect(draftToConfig({ ...d, appRoles: ['moderator'] }, tasks).app_roles).toEqual(['moderator'])
  })

  it('validates the name suffix', () => {
    const d = draftForTable({ ...emptyDraft(), description: 'x' }, tasks)
    expect(canSave({ ...d, suffix: 'Bad-Name' })[0]).toMatch(/^Name:/)
    expect(canSave({ ...d, suffix: 'good_name1' })).toEqual([])
  })
})

describe('curlFor', () => {
  const params = { status: { type: 'string' }, limit: { type: 'integer', optional: true } }

  it('sends the bearer for own/all endpoints and fills required params', () => {
    const curl = curlFor('crm', 'api_list_tasks', params, 'own')
    expect(curl).toContain('curl -X POST https://api.proappstore.online/v1/apps/crm/actions/api_list_tasks')
    expect(curl).toContain('-H "Authorization: Bearer $PAS_TOKEN"')
    expect(curl).toContain(`-d '{"params":{"status":"value"}}'`)
  })

  it('omits the Authorization line for a public endpoint', () => {
    expect(curlFor('crm', 'api_feed', params, 'public', { status: 'open' })).not.toContain('Authorization')
    expect(curlFor('crm', 'api_feed', params, 'public', { status: 'open' })).toContain(`{"params":{"status":"open"}}`)
  })
})
