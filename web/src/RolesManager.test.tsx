/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RolesManager } from './RolesManager'

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const roles = [
  { user_id: 'gh:1', role_name: 'owner', granted_by: null, granted_at: 1, user_login: 'ada' },
  { user_id: 'gh:2', role_name: 'editor', granted_by: 'gh:1', granted_at: 2, user_login: 'bob' },
  { user_id: 'google:9', role_name: 'member', granted_by: null, granted_at: 3, user_login: null },
]

/**
 * The roles API: `GET /roles` lists `list`, `GET /roles/declared` returns `declared`
 * (none by default), `GET /tools` returns `tools`; writes are recorded and answered by `write`.
 */
function serve({ list = roles, declared = [], tools = [], write = () => ({ ok: true }) }: {
  list?: unknown[] | (() => unknown[]); declared?: unknown[]; tools?: unknown[]
  write?: (method: string, body: { userId: string; role: string }) => unknown
} = {}) {
  const writes: Array<[string, unknown]> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (init?.method && init.method !== 'GET') {
      const body = JSON.parse(String(init.body))
      writes.push([init.method, body])
      return response(write(init.method, body))
    }
    if (path.endsWith('/roles/declared')) return response({ roles: declared })
    if (path.endsWith('/tools')) return response({ tools })
    return response({ roles: typeof list === 'function' ? list() : list })
  }))
  return writes
}

const DECLARED = [
  { id: 'ops', label: 'Operations', description: 'Dispatch and trip support', requires: [] },
  { id: 'ops_pii', label: 'Rider details', description: 'Sees rider phone numbers', requires: ['ops'] },
]
const groups = (el: Element) => [...el.querySelectorAll('optgroup')].map((g) => [g.label, [...g.querySelectorAll('option')].map((o) => o.value)])

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('RolesManager (console#19)', () => {
  it('lists the team, and counts signed-in users separately with what member means', async () => {
    serve()
    render(<RolesManager appId="a" getToken={() => 't'} />)
    expect(await screen.findByText('@bob')).toBeTruthy()
    expect(screen.getByText(/1 signed-in user/).textContent).toContain('No extra permissions')
    expect(screen.getByText('google:9').closest('details')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove @ada' })).toBeNull() // the owner can't be removed
    expect(screen.getByText(/Full control\. Belongs to the app creator/)).toBeTruthy()
  })

  it('explains the picked role, and removes only after a confirm', async () => {
    const writes = serve()
    render(<RolesManager appId="a" getToken={() => 't'} />)
    await screen.findByText('@bob')
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'viewer' } })
    expect(screen.getByText('Read-only access to app analytics and settings.', { selector: 'form p' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove @bob' }))
    expect(writes).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Remove editor' }))
    await waitFor(() => expect(writes).toEqual([['DELETE', { userId: 'gh:2', role: 'editor' }]]))
  })

  it('changes a member\'s role from their row: grants the new one, then revokes the old (console#23)', async () => {
    const writes = serve()
    render(<RolesManager appId="a" getToken={() => 't'} />)
    await screen.findByText('@bob')
    fireEvent.change(screen.getByLabelText('Role for @bob'), { target: { value: 'moderator' } })
    await waitFor(() => expect(writes).toEqual([
      ['POST', { userId: 'gh:2', role: 'moderator' }],
      ['DELETE', { userId: 'gh:2', role: 'editor' }],
    ]))
  })

  it('gives a signed-in user a role from their row without revoking member (console#23)', async () => {
    const writes = serve()
    render(<RolesManager appId="a" getToken={() => 't'} />)
    await screen.findByText('@bob')
    fireEvent.change(screen.getByLabelText('Role for google:9'), { target: { value: 'editor' } })
    await waitFor(() => expect(writes).toEqual([['POST', { userId: 'google:9', role: 'editor' }]]))
  })

  it('adds a signed-in person by name, sending their ID, and lists a team member only once (console#23)', async () => {
    const writes = serve({ list: [...roles,
      { user_id: 'google:7', role_name: 'member', granted_at: 4, user_login: 'cara' },
      { user_id: 'gh:2', role_name: 'member', granted_at: 5, user_login: 'bob' },
    ] })
    render(<RolesManager appId="a" getToken={() => 't'} />)
    await screen.findByText('@bob')
    expect(screen.getAllByText('@bob')).toHaveLength(1)
    expect(screen.getByText(/2 signed-in users/)).toBeTruthy()
    expect(document.querySelector('#roles-people option[value="cara"]')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Person'), { target: { value: 'cara' } })
    fireEvent.click(screen.getByRole('button', { name: 'Assign role' }))
    await waitFor(() => expect(writes).toEqual([['POST', { userId: 'google:7', role: 'moderator' }]]))
  })

  it("without declared roles, offers the roles the app's actions check first, and defaults to the first (console#24)", async () => {
    const writes = serve({
      list: [...roles, { user_id: 'gh:3', role_name: 'tester', granted_at: 4, user_login: 'cy' }],
      tools: [
        { name: 'op_a', auth: { app_roles: ['ops'] } },
        { name: 'op_b', auth: { app_roles: ['ops', 'ops_pii', 'owner'] } },
        { name: 'pub' },
      ],
    })
    render(<RolesManager appId="a" getToken={() => 't'} />)
    await screen.findByText('@bob')
    const select = screen.getByLabelText('Role') as HTMLSelectElement
    await waitFor(() => expect(select.value).toBe('ops'))
    expect(groups(select)).toEqual([["This app's roles", ['ops', 'ops_pii']], ['More roles', ['moderator', 'editor', 'viewer', 'custom']]])
    expect(screen.getByText("A role this app's actions check.", { selector: 'form p' })).toBeTruthy()
    expect(groups(screen.getByLabelText('Role for @bob'))).toEqual([["This app's roles", ['ops', 'ops_pii']], ['More roles', ['moderator', 'editor', 'viewer']]])
    // A role in neither list is still shown as the row's current role.
    expect((screen.getByLabelText('Role for @cy') as HTMLSelectElement).value).toBe('tester')
    // Found in actions only, so the owner is not said to hold them.
    expect(screen.getByText(/Full control\. Belongs to the app creator/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Person'), { target: { value: 'gh:5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Assign role' }))
    await waitFor(() => expect(writes).toEqual([['POST', { userId: 'gh:5', role: 'ops' }]]))
  })

  it('offers only the platform roles when the manifest cannot be read (console#24)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      /\/(tools|roles\/declared)$/.test(String(url)) ? response({ error: 'nope' }, 500) : response({ roles })))
    render(<RolesManager appId="a" getToken={() => 't'} />)
    await screen.findByText('@bob')
    const select = screen.getByLabelText('Role') as HTMLSelectElement
    expect(select.value).toBe('moderator')
    expect(select.querySelector('optgroup')).toBeNull()
    expect([...select.options].map((o) => o.value)).toEqual(['moderator', 'editor', 'viewer', 'custom'])
  })
})

describe('RolesManager — declared roles (console#25)', () => {
  const opsTeam = [...roles, { user_id: 'gh:3', role_name: 'ops', granted_at: 4, user_login: 'cy' }]

  it('offers the declared roles by label with their description, generic ones under More roles, and ignores the actions', async () => {
    serve({ declared: DECLARED, tools: [{ name: 'x', auth: { app_roles: ['other'] } }], list: opsTeam })
    render(<RolesManager appId="a" getToken={() => 't'} />)
    await screen.findByText('@bob')
    const select = screen.getByLabelText('Role') as HTMLSelectElement
    await waitFor(() => expect(select.value).toBe('ops'))
    expect(groups(select)).toEqual([["This app's roles", ['ops', 'ops_pii']], ['More roles', ['moderator', 'editor', 'viewer', 'custom']]])
    expect([...select.querySelectorAll('optgroup')[0]!.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Operations', 'Rider details'])
    expect(screen.getByText('Dispatch and trip support', { selector: 'form p' })).toBeTruthy()
    fireEvent.change(select, { target: { value: 'ops_pii' } })
    expect(screen.getByText('Sees rider phone numbers (includes Operations)', { selector: 'form p' })).toBeTruthy()
    // The row shows the label and the description.
    const cy = screen.getByText('@cy').closest('li')!
    expect(within(cy).getByText('Operations', { selector: 'span' })).toBeTruthy()
    expect(within(cy).getByText(/^Dispatch and trip support/)).toBeTruthy()
  })

  it("says on the owner's row that they hold every declared role", async () => {
    serve({ declared: DECLARED })
    render(<RolesManager appId="a" getToken={() => 't'} />)
    const ada = (await screen.findByText('@ada')).closest('li')!
    expect(await within(ada).findByText(/^Owner — holds every role this app declares: Operations, Rider details\./)).toBeTruthy()
  })

  it('granting a role that requires another names it, and shows both rows after the reload', async () => {
    let granted = false
    const writes = serve({
      declared: DECLARED,
      list: () => granted ? [...roles, { user_id: 'gh:5', role_name: 'ops', granted_at: 9, user_login: 'dee' }, { user_id: 'gh:5', role_name: 'ops_pii', granted_at: 9, user_login: 'dee' }] : roles,
      write: () => { granted = true; return { ok: true, requiredRoles: ['ops'] } },
    })
    render(<RolesManager appId="a" getToken={() => 't'} />)
    await screen.findByText('@bob')
    const select = screen.getByLabelText('Role') as HTMLSelectElement
    await waitFor(() => expect(select.value).toBe('ops'))
    fireEvent.change(select, { target: { value: 'ops_pii' } })
    fireEvent.change(screen.getByLabelText('Person'), { target: { value: 'gh:5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Assign role' }))
    expect((await screen.findByRole('status')).textContent).toBe('Rider details also needs Operations, so that was granted too.')
    expect(writes).toEqual([['POST', { userId: 'gh:5', role: 'ops_pii' }]])
    await waitFor(() => expect(screen.getAllByText('@dee')).toHaveLength(2))
    expect(screen.getAllByText('@dee').map((el) => within(el.closest('li')!).getAllByText(/^(Operations|Rider details)$/, { selector: 'span' })[0]!.textContent))
      .toEqual(['Operations', 'Rider details'])
  })

  it('removing a role names the roles that needed it, which the platform removed too', async () => {
    const writes = serve({ declared: DECLARED, list: opsTeam, write: () => ({ ok: true, revoked: true, dependentRoles: ['ops_pii'] }) })
    render(<RolesManager appId="a" getToken={() => 't'} />)
    await screen.findByText('@cy')
    fireEvent.click(screen.getByRole('button', { name: 'Remove @cy' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Operations' }))
    expect((await screen.findByRole('status')).textContent).toBe('Rider details needs Operations, so it was removed too.')
    expect(writes).toEqual([['DELETE', { userId: 'gh:3', role: 'ops' }]])
  })

  it("changing a row to a role that requires the old one keeps the old one", async () => {
    const writes = serve({ declared: DECLARED, list: opsTeam, write: () => ({ ok: true, requiredRoles: ['ops'] }) })
    render(<RolesManager appId="a" getToken={() => 't'} />)
    await screen.findByText('@cy')
    const row = screen.getByLabelText('Role for @cy') as HTMLSelectElement
    await waitFor(() => expect(row.querySelector('optgroup')).toBeTruthy())
    fireEvent.change(row, { target: { value: 'ops_pii' } })
    expect((await screen.findByRole('status')).textContent).toBe('Rider details also needs Operations, so that was granted too.')
    expect(writes).toEqual([['POST', { userId: 'gh:3', role: 'ops_pii' }]])
  })
})
