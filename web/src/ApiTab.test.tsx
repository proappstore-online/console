// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { DatabaseSchema } from './dbSchema'

vi.mock('./sdk', () => ({ pro: { auth: { user: { login: 'serge-ivo' } } } }))
const schema: DatabaseSchema = {
  tables: [{
    name: 'tasks', sql: '', foreignKeys: [], columns: [
      { name: 'id', type: 'TEXT', notNull: true, defaultValue: null, primaryKeyPosition: 1 },
      { name: 'owner_id', type: 'TEXT', notNull: true, defaultValue: null, primaryKeyPosition: 0 },
      { name: 'title', type: 'TEXT', notNull: true, defaultValue: null, primaryKeyPosition: 0 },
      { name: 'status', type: 'TEXT', notNull: true, defaultValue: "'open'", primaryKeyPosition: 0 },
    ],
  }],
}
vi.mock('./dbBrowserApi', () => ({ fetchDatabaseSchema: async () => schema }))

import { ApiTab } from './ApiTab'

const readManifest = {
  name: 'api_my_tasks', description: 'My tasks', operation: 'query', requires_auth: true,
  sql: 'SELECT "id","title" FROM "tasks" WHERE "owner_id" = :__user_id LIMIT 50 OFFSET :offset',
  params: { offset: { type: 'integer', optional: true, default: 0 } },
}
const saved = {
  name: 'api_my_tasks', status: 'ok', updated_at: 1, updated_by: 'gh:1', manifest: readManifest,
  config: { name: 'api_my_tasks', description: 'My tasks', kind: 'read', table: 'tasks', scope: 'own', owner_column: 'owner_id', columns: ['id', 'title'], page_size: 50, paginate: true },
}

type Route = (init: RequestInit | undefined, url: URL) => Response | Promise<Response>
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function mockApi(routes: Record<string, Route>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url)
    const key = `${init?.method ?? 'GET'} ${u.pathname}`
    const route = routes[key] ?? (u.pathname.endsWith('/roles') ? () => json({ roles: [{ role_name: 'reviewer' }] }) : null)
    return route ? route(init, u) : json({ error: `unexpected ${key}` }, 500)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const LIST = 'GET /v1/apps/crm/endpoints'
const PREVIEW = 'POST /v1/apps/crm/endpoints/preview'

async function openNewForm() {
  fireEvent.click(await screen.findByRole('button', { name: 'New endpoint' }))
  await waitFor(() => expect(screen.getByRole('option', { name: 'tasks' })).toBeTruthy())
  fireEvent.change(screen.getByLabelText('Table'), { target: { value: 'tasks' } })
}

describe('ApiTab', () => {
  it('lists endpoints with their status and shows a broken one\'s server error', async () => {
    mockApi({
      [LIST]: () => json({ endpoints: [saved, { ...saved, name: 'api_due', status: 'broken', error: 'no such column: due_at' }] }),
    })
    render(<ApiTab appId="crm" getToken={() => 'tok'} />)
    const ok = await screen.findByTestId('endpoint-api_my_tasks')
    expect(within(ok).getByText('ok')).toBeTruthy()
    expect(within(ok).getByText('own rows')).toBeTruthy()
    const broken = screen.getByTestId('endpoint-api_due')
    expect(within(broken).getByText('broken')).toBeTruthy()
    expect(within(broken).getByText('no such column: due_at')).toBeTruthy()
    expect(within(broken).getByRole('button', { name: 'Edit' })).toBeTruthy()
  })

  it('says "Not available yet" when the platform has no endpoint routes (404)', async () => {
    mockApi({ [LIST]: () => json({ error: 'not found' }, 404) })
    render(<ApiTab appId="crm" getToken={() => 'tok'} />)
    await screen.findByText(/Not available yet/)
  })

  it('preselects owner_id and previews the generated SQL from the config it sends', async () => {
    const f = mockApi({ [LIST]: () => json({ endpoints: [] }), [PREVIEW]: () => json({ manifest: readManifest }) })
    render(<ApiTab appId="crm" getToken={() => 'tok'} />)
    await openNewForm()
    expect((screen.getByLabelText('Owner column') as HTMLSelectElement).value).toBe('owner_id')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'my_tasks' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'My tasks' } })

    const sql = await screen.findByTestId('preview-sql', {}, { timeout: 2000 })
    expect(sql.textContent).toContain('WHERE "owner_id" = :__user_id')
    const body = JSON.parse(f.mock.calls.find(([u, i]) => i?.method === 'POST' && String(u).endsWith('/preview'))![1]!.body as string)
    expect(body.config).toMatchObject({ name: 'api_my_tasks', kind: 'read', scope: 'own', owner_column: 'owner_id', table: 'tasks' })
    expect(within(screen.getByRole('table', { name: 'Parameters' })).getByText('offset')).toBeTruthy()
  })

  it('shows server validation details inline next to the form', async () => {
    mockApi({ [LIST]: () => json({ endpoints: [] }), [PREVIEW]: () => json({ error: 'invalid endpoint config', details: ['filters: column "due" does not exist on "tasks"'] }, 400) })
    render(<ApiTab appId="crm" getToken={() => 'tok'} />)
    await openNewForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'my_tasks' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'My tasks' } })
    await screen.findByText('filters: column "due" does not exist on "tasks"', {}, { timeout: 2000 })
  })

  it('Public disables Insert, warns, and allows page size up to 500; All rows needs a role to save', async () => {
    mockApi({ [LIST]: () => json({ endpoints: [] }), [PREVIEW]: () => json({ manifest: readManifest }) })
    render(<ApiTab appId="crm" getToken={() => 'tok'} />)
    await openNewForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'feed' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Feed' } })

    fireEvent.click(screen.getByLabelText('Public'))
    expect((screen.getByLabelText('Insert') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText(/Anyone on the internet can call this/)).toBeTruthy()
    expect(screen.getByLabelText('Page size').getAttribute('max')).toBe('500')

    fireEvent.click(screen.getByLabelText('All rows (app role required)'))
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(screen.getByText('All rows needs at least one app role.')).toBeTruthy()
    fireEvent.click(await screen.findByLabelText('Role reviewer'))
    expect(save.disabled).toBe(false)
  })

  it('turns on UUID generation for a TEXT primary key and locks required insert columns', async () => {
    mockApi({ [LIST]: () => json({ endpoints: [] }), [PREVIEW]: () => json({ manifest: readManifest }) })
    render(<ApiTab appId="crm" getToken={() => 'tok'} />)
    await openNewForm()
    fireEvent.click(screen.getByLabelText('Insert'))
    expect((screen.getByLabelText('Generate id') as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText(/filled by the server/).textContent).toContain('owner_id')
    const title = screen.getByLabelText('Column title') as HTMLInputElement
    expect(title.checked && title.disabled).toBe(true)
    expect(screen.getByLabelText('Default for status')).toBeTruthy()
  })

  it('test call runs the action as the signed-in user and shows a 403 from the server', async () => {
    const f = mockApi({
      [LIST]: () => json({ endpoints: [saved] }),
      [PREVIEW]: () => json({ manifest: readManifest }),
      'POST /v1/apps/crm/actions/api_my_tasks': () => json({ error: 'this action requires app role moderator' }, 403),
    })
    render(<ApiTab appId="crm" getToken={() => 'tok'} />)
    fireEvent.click(within(await screen.findByTestId('endpoint-api_my_tasks')).getByRole('button', { name: 'Edit' }))
    expect(screen.getByText(/Running as you \(serge-ivo\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect((await screen.findByText(/403: this action requires app role moderator/)).getAttribute('role')).toBe('alert')
    expect(f.mock.calls.some(([u, i]) => String(u).endsWith('/actions/api_my_tasks') && i?.method === 'POST')).toBe(true)
  })

  it('test call renders the returned rows', async () => {
    mockApi({
      [LIST]: () => json({ endpoints: [saved] }),
      [PREVIEW]: () => json({ manifest: readManifest }),
      'POST /v1/apps/crm/actions/api_my_tasks': () => json({ rows: [{ id: 't1', title: 'Ship #3' }] }),
    })
    render(<ApiTab appId="crm" getToken={() => 'tok'} />)
    fireEvent.click(within(await screen.findByTestId('endpoint-api_my_tasks')).getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await screen.findByText('OK · 1 row')
    expect(screen.getAllByText('Ship #3').length).toBeGreaterThan(0)
  })

  it('docs show the action URL, MCP name and curl, with no Authorization line for a public endpoint', async () => {
    const pub = { ...saved, name: 'api_feed', manifest: { ...readManifest, name: 'api_feed', requires_auth: false }, config: { ...saved.config, name: 'api_feed', scope: 'public', owner_column: undefined } }
    mockApi({ [LIST]: () => json({ endpoints: [saved, pub] }), [PREVIEW]: () => json({ manifest: readManifest }) })
    render(<ApiTab appId="crm" getToken={() => 'tok'} />)
    fireEvent.click(within(await screen.findByTestId('endpoint-api_my_tasks')).getByRole('button', { name: 'Edit' }))
    expect(screen.getByTestId('docs-curl').textContent).toContain('Authorization: Bearer $PAS_TOKEN')
    expect(screen.getByText('https://api.proappstore.online/v1/apps/crm/actions/api_my_tasks')).toBeTruthy()
    expect(screen.getByText('crm/api_my_tasks')).toBeTruthy()
    expect(screen.getByText('https://mcp.proappstore.online/mcp/apps/crm')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back to list' }))
    fireEvent.click(within(await screen.findByTestId('endpoint-api_feed')).getByRole('button', { name: 'Edit' }))
    expect(screen.getByTestId('docs-curl').textContent).not.toContain('Authorization')
  })
})
