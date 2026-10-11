/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProvisionView } from './ProvisionView'
import type { ProvisionPlan, ProvisionOperation } from './provisioningApi'

const API = 'https://api.proappstore.online/v1'

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

function plan(overrides: Partial<ProvisionPlan> = {}, appId = 'school-clubs'): ProvisionPlan {
  return {
    version: 1,
    appId,
    name: 'School Clubs',
    description: 'Coordinate school clubs.',
    action: 'create',
    repository: { owner: 'proappstore-online', name: appId, url: `https://github.com/proappstore-online/${appId}`, exists: false, private: true },
    appRecord: 'none',
    template: {
      id: 'template-marketplace', repo: 'proappstore-online/template-marketplace', ref: 'main', status: 'approved',
      reviewedCommit: 'aaaaaaa1111111', requestedRevision: null, revision: 'bbbbbbb2222222', revisionSource: 'template_head',
    },
    changes: ['create private GitHub repository proappstore-online/' + appId, 'run normal compliance'],
    compliance: { required: true },
    blockers: [],
    warnings: [],
    ...overrides,
  }
}

function op(overrides: Partial<ProvisionOperation> = {}): ProvisionOperation {
  return { receipt: 'rcpt-1', appId: 'school-clubs', status: 'pending', steps: [{ name: 'repo_created', status: 'ok', detail: 'created' }], ...overrides }
}

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>

/** fetch stub routing the three provisioning endpoints; anything else fails the test. */
function stubApi(handlers: { preview?: Handler; confirm?: Handler; operation?: Handler }) {
  // apiFetch always passes init; typing it as required keeps mock.calls[i][1] defined.
  const fetchMock = vi.fn(async (input: string, init: RequestInit) => {
    const url = new URL(input)
    if (url.pathname === '/v1/provisioning/plans' && handlers.preview) return handlers.preview(url, init)
    if (/^\/v1\/provisioning\/plans\/[^/]+\/confirm$/.test(url.pathname) && handlers.confirm) return handlers.confirm(url, init)
    if (url.pathname.startsWith('/v1/provision-operations/') && handlers.operation) return handlers.operation(url, init)
    throw new Error(`unexpected request ${init.method ?? 'GET'} ${input}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const previewCalls = (m: ReturnType<typeof stubApi>) => m.mock.calls.filter(([u]) => new URL(u).pathname === '/v1/provisioning/plans')
const confirmCalls = (m: ReturnType<typeof stubApi>) => m.mock.calls.filter(([u]) => new URL(u).pathname.endsWith('/confirm'))

function fill(values: Partial<{ appId: string; name: string; description: string; template: RegExp | null; templateRev: string }> = {}) {
  const v = { appId: 'school-clubs', name: 'School Clubs', description: 'Coordinate school clubs.', template: /Two-sided listings/, templateRev: '', ...values }
  fireEvent.change(screen.getByLabelText('App id'), { target: { value: v.appId } })
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: v.name } })
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: v.description } })
  if (v.template) fireEvent.click(screen.getByRole('radio', { name: v.template }))
  fireEvent.change(screen.getByLabelText('Template revision (optional)'), { target: { value: v.templateRev } })
}

const previewButton = () => screen.getByRole('button', { name: 'Preview plan' })
const confirmButton = () => screen.queryByRole('button', { name: 'Confirm and provision' })

function renderView(token = 'tok') {
  return render(<ProvisionView getToken={() => token} pollIntervalMs={5} />)
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('ProvisionView draft', () => {
  it('requires every field and an approved template, and sends nothing while invalid', () => {
    const fetchMock = stubApi({})
    renderView()
    fireEvent.click(previewButton())
    expect(screen.getByText('App id is required.')).toBeTruthy()
    expect(screen.getByText('Name is required.')).toBeTruthy()
    expect(screen.getByText('Description is required.')).toBeTruthy()
    expect(screen.getByText('Choose an approved template.')).toBeTruthy()
    expect(screen.getByLabelText('App id').getAttribute('aria-invalid')).toBe('true')

    fill({ appId: '1clubs', name: 'x'.repeat(81), description: 'y'.repeat(301), templateRev: 'NOT-HEX' })
    fireEvent.click(previewButton())
    expect(screen.getByText('Must start with a letter.')).toBeTruthy()
    expect(screen.getByText('Max 80 characters.')).toBeTruthy()
    expect(screen.getByText('Max 300 characters.')).toBeTruthy()
    expect(screen.getByText('7–40 lowercase hex characters (a git commit id).')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('offers only the approved catalogue templates and derives the one allowed repository', () => {
    stubApi({})
    renderView()
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['template-app', 'template-marketplace'])
    fireEvent.change(screen.getByLabelText('App id'), { target: { value: 'School-Clubs' } })
    expect(screen.getByText('https://github.com/proappstore-online/school-clubs')).toBeTruthy()
  })
})

describe('ProvisionView preview', () => {
  it('sends exactly the reviewed intent with the session header, and does not confirm', async () => {
    const fetchMock = stubApi({ preview: () => response({ planId: 'p1', expiresAt: Date.now() + 600_000, plan: plan() }, 201) })
    renderView('secret-session')
    fill({ name: '  School Clubs ', templateRev: 'abcdef1' })
    fireEvent.click(previewButton())
    await screen.findByText('Plan to confirm')

    expect(previewCalls(fetchMock)).toHaveLength(1)
    const [url, init] = previewCalls(fetchMock)[0]!
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      appId: 'school-clubs',
      name: 'School Clubs',
      description: 'Coordinate school clubs.',
      template: 'template-marketplace',
      repoUrl: 'https://github.com/proappstore-online/school-clubs',
      templateRev: 'abcdef1',
    })
    expect(init.headers).toMatchObject({ Authorization: 'Bearer secret-session' })
    expect(url).not.toContain('secret-session')
    expect(confirmCalls(fetchMock)).toHaveLength(0)
  })

  it('omits templateRev when none is given and never sends overrides', async () => {
    const fetchMock = stubApi({ preview: () => response({ planId: 'p1', expiresAt: Date.now() + 600_000, plan: plan() }, 201) })
    renderView()
    fill()
    fireEvent.click(previewButton())
    await screen.findByText('Plan to confirm')
    const body = JSON.parse(previewCalls(fetchMock)[0]![1].body as string)
    expect(Object.keys(body).sort()).toEqual(['appId', 'description', 'name', 'repoUrl', 'template'])
  })

  it('shows the server plan exactly: action, repository, template, proven revision, changes, compliance, warnings, expiry', async () => {
    const expiresAt = Date.now() + 600_000
    stubApi({
      preview: () => response({
        planId: 'p1', expiresAt,
        plan: plan({
          action: 'adopt_untouched',
          repository: { owner: 'proappstore-online', name: 'school-clubs', url: 'https://github.com/proappstore-online/school-clubs', exists: true, private: false, headSha: 'c0ffee1', untouchedScaffold: true },
          template: { id: 'template-marketplace', repo: 'proappstore-online/template-marketplace', ref: 'main', status: 'approved', reviewedCommit: '4b000c99aaaa', requestedRevision: '4b000c9', revision: '4b000c99ffff', revisionSource: 'scaffold_tree_match' },
          changes: ['commit app-name replacements'],
          warnings: ['template head differs from the reviewed commit'],
        }),
      }, 201),
    })
    renderView()
    fill()
    fireEvent.click(previewButton())
    const section = (await screen.findByText('Plan to confirm')).closest('section')!
    const text = section.textContent!
    expect(text).toContain('Adopt an untouched template scaffold')
    expect(text).toContain('https://github.com/proappstore-online/school-clubs')
    expect(text).toContain('Exists · visibility public')
    expect(text).toContain('proappstore-online/template-marketplace@main · approved')
    expect(text).toContain('4b000c99ffff')
    expect(text).toContain('proven: the scaffold matches this template commit')
    expect(text).toContain('4b000c9')
    expect(text).toContain('4b000c99aaaa')
    expect(text).toContain('commit app-name replacements')
    expect(text).toContain('Required: the normal compliance checks run')
    expect(text).toContain('template head differs from the reviewed commit')
    expect(text).toContain(new Date(expiresAt).toLocaleTimeString())
  })

  it('shows an unproven revision as unknown, never a revision taken from the bundled catalogue', async () => {
    stubApi({
      preview: () => response({
        planId: 'p1', expiresAt: Date.now() + 600_000,
        plan: plan({ action: 'reuse_owned', template: { ...plan().template, id: 'template-app', repo: 'proappstore-online/template-app', revision: null, revisionSource: 'unknown' } }),
      }, 201),
    })
    renderView()
    fill({ template: /ProAppStore app template/ })
    fireEvent.click(previewButton())
    const section = (await screen.findByText('Plan to confirm')).closest('section')!
    expect(section.textContent).toContain('unknown — not proven')
    expect(section.textContent).not.toContain('d8c2e08')
  })

  it('surfaces an unknown or withdrawn template refusal and shows no plan', async () => {
    const fetchMock = stubApi({ preview: () => response({ error: 'unknown or withdrawn template: template-app' }, 400) })
    renderView()
    fill({ template: /ProAppStore app template/ })
    fireEvent.click(previewButton())
    expect((await screen.findByRole('alert')).textContent).toContain('The platform refused this preview: unknown or withdrawn template: template-app')
    expect(screen.queryByText('Plan to confirm')).toBeNull()
    expect(confirmButton()).toBeNull()
    expect(confirmCalls(fetchMock)).toHaveLength(0)
  })

  it('flags a plan template that is no longer approved', async () => {
    stubApi({
      preview: () => response({ planId: 'p1', expiresAt: Date.now() + 600_000, plan: plan({ template: { ...plan().template, status: 'deprecated' }, warnings: ['template-marketplace is deprecated'] }) }, 201),
    })
    renderView()
    fill()
    fireEvent.click(previewButton())
    await screen.findByText('Plan to confirm')
    expect(screen.getByText('This template is deprecated, not approved.')).toBeTruthy()
    expect(screen.getByText('template-marketplace is deprecated')).toBeTruthy()
  })

  it('joins a duplicate pending preview into one request', async () => {
    const gate = deferred<Response>()
    const fetchMock = stubApi({ preview: () => gate.promise })
    renderView()
    fill()
    fireEvent.click(previewButton())
    fireEvent.click(screen.getByRole('button', { name: 'Previewing…' }))
    fireEvent.submit(screen.getByRole('form', { name: 'Provisioning draft' }))
    expect(previewCalls(fetchMock)).toHaveLength(1)
    await act(async () => { gate.resolve(response({ planId: 'p1', expiresAt: Date.now() + 600_000, plan: plan() }, 201)) })
    await screen.findByText('Plan to confirm')
    expect(previewCalls(fetchMock)).toHaveLength(1)
  })

  it('keeps the draft after a failed preview and succeeds on retry', async () => {
    let n = 0
    const fetchMock = stubApi({
      preview: () => (++n === 1 ? response({ error: 'provisioning preview is unavailable — retry later' }, 502) : response({ planId: 'p1', expiresAt: Date.now() + 600_000, plan: plan() }, 201)),
    })
    renderView()
    fill()
    fireEvent.click(previewButton())
    expect((await screen.findByRole('alert')).textContent).toContain('Nothing was changed')
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('School Clubs')
    expect((screen.getByRole('radio', { name: /Two-sided listings/ }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(previewButton())
    await screen.findByText('Plan to confirm')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(previewCalls(fetchMock)).toHaveLength(2)
  })

  it('drops a delayed response for an older draft, whichever order the responses arrive', async () => {
    const first = deferred<Response>()
    const second = deferred<Response>()
    let n = 0
    const fetchMock = stubApi({
      preview: () => (++n === 1 ? first.promise : second.promise),
      confirm: () => response(op({ appId: 'school-clubs-two', status: 'completed', steps: [{ name: 'host', status: 'ok', detail: '' }] })),
    })
    renderView()
    fill()
    fireEvent.click(previewButton())
    fireEvent.change(screen.getByLabelText('App id'), { target: { value: 'school-clubs-two' } })
    fireEvent.click(previewButton())
    expect(previewCalls(fetchMock)).toHaveLength(2)

    await act(async () => { second.resolve(response({ planId: 'p2', expiresAt: Date.now() + 600_000, plan: plan({}, 'school-clubs-two') }, 201)) })
    await screen.findByText('Plan to confirm')
    await act(async () => { first.resolve(response({ planId: 'p1', expiresAt: Date.now() + 600_000, plan: plan() }, 201)) })

    const section = screen.getByText('Plan to confirm').closest('section')!
    expect(section.textContent).toContain('proappstore-online/school-clubs-two')
    fireEvent.click(confirmButton()!)
    await waitFor(() => expect(confirmCalls(fetchMock)).toHaveLength(1))
    expect(confirmCalls(fetchMock)[0]![0]).toBe(`${API}/provisioning/plans/p2/confirm`)
  })

  it('isolates an old account: a response for the previous session is never shown', async () => {
    const gate = deferred<Response>()
    stubApi({ preview: () => gate.promise })
    const view = render(<ProvisionView key="user-a" getToken={() => 'tok-a'} pollIntervalMs={5} />)
    fill()
    fireEvent.click(previewButton())
    view.rerender(<ProvisionView key="user-b" getToken={() => 'tok-b'} pollIntervalMs={5} />)
    await act(async () => { gate.resolve(response({ planId: 'p1', expiresAt: Date.now() + 600_000, plan: plan() }, 201)) })
    expect(screen.queryByText('Plan to confirm')).toBeNull()
    expect((screen.getByLabelText('App id') as HTMLInputElement).value).toBe('')
  })
})

describe('ProvisionView confirmation', () => {
  async function previewed(fetchHandlers: Parameters<typeof stubApi>[0], planOverrides: Partial<ProvisionPlan> = {}) {
    let n = 0
    const fetchMock = stubApi({
      preview: () => response({ planId: `p${++n}`, expiresAt: Date.now() + 600_000, plan: plan(planOverrides) }, 201),
      ...fetchHandlers,
    })
    renderView()
    fill()
    fireEvent.click(previewButton())
    await screen.findByText('Plan to confirm')
    return fetchMock
  }

  it('confirms only on an explicit click, exactly once, for the reviewed plan id with an empty body', async () => {
    const gate = deferred<Response>()
    const fetchMock = await previewed({ confirm: () => gate.promise, operation: () => response(op()) })
    expect(confirmCalls(fetchMock)).toHaveLength(0)
    fireEvent.click(confirmButton()!)
    fireEvent.click(screen.getByRole('button', { name: 'Confirming…' }))
    expect(confirmCalls(fetchMock)).toHaveLength(1)
    const [url, init] = confirmCalls(fetchMock)[0]!
    expect(url).toBe(`${API}/provisioning/plans/p1/confirm`)
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{}')
    expect(screen.getByLabelText('App id').closest('fieldset')!.disabled).toBe(true)
    await act(async () => { gate.resolve(response({ planId: 'p1', joined: false, ...op() })) })
    await screen.findByText('In progress. This page checks again every few seconds.')
    expect(confirmCalls(fetchMock)).toHaveLength(1)
  })

  it('invalidates the preview when any field changes; the old plan id is never confirmed', async () => {
    const fetchMock = await previewed({ confirm: () => response({ planId: 'p2', joined: false, ...op({ status: 'completed', steps: [{ name: 'host', status: 'ok', detail: '' }] }) }) })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Coordinate clubs and events.' } })
    expect(screen.queryByText('Plan to confirm')).toBeNull()
    expect(confirmButton()).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Preview again before confirming')

    fireEvent.click(previewButton())
    await screen.findByText('Plan to confirm')
    expect(JSON.parse(previewCalls(fetchMock)[1]![1].body as string).description).toBe('Coordinate clubs and events.')
    fireEvent.click(confirmButton()!)
    await waitFor(() => expect(confirmCalls(fetchMock)).toHaveLength(1))
    expect(confirmCalls(fetchMock).map(([u]) => u)).toEqual([`${API}/provisioning/plans/p2/confirm`])
  })

  it('disables confirmation for a blocked or refused plan', async () => {
    const fetchMock = await previewed({}, { action: 'refused', blockers: [{ code: 'owned_by_another_account', message: 'This app belongs to another account.' }] })
    const button = confirmButton() as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(screen.getByText('owned_by_another_account')).toBeTruthy()
    expect(screen.getByText('This plan has blockers and cannot be confirmed.')).toBeTruthy()
    expect(confirmCalls(fetchMock)).toHaveLength(0)
  })

  it('on 409 shows the fresh plan for review only and requires a new stored preview before confirming', async () => {
    const fresh = plan({ action: 'reuse_owned', repository: { ...plan().repository, exists: true, private: true }, appRecord: 'owner' })
    let confirms = 0
    const fetchMock = await previewed({
      confirm: () => (++confirms === 1 ? response({ error: 'plan_changed', plan: fresh }, 409) : response({ planId: 'p2', joined: false, ...op() })),
      operation: () => response(op()),
    })
    fireEvent.click(confirmButton()!)
    await screen.findByText('Current plan (preview again to confirm)')
    expect(screen.getByRole('status').textContent).toContain('The plan changed since your preview, so nothing ran')
    expect(screen.getByText('Reuse your existing app')).toBeTruthy()
    expect(confirmButton()).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Preview again' }))
    await screen.findByText('Plan to confirm')
    expect(previewCalls(fetchMock)).toHaveLength(2)
    expect(confirmCalls(fetchMock)).toHaveLength(1)
    fireEvent.click(confirmButton()!)
    await waitFor(() => expect(confirmCalls(fetchMock)).toHaveLength(2))
    expect(confirmCalls(fetchMock).map(([u]) => u)).toEqual([`${API}/provisioning/plans/p1/confirm`, `${API}/provisioning/plans/p2/confirm`])
  })

  it('on 422 shows the blocked plan and offers no confirmation', async () => {
    const blocked = plan({ blockers: [{ code: 'repository_edited', message: 'The repository was edited.' }] })
    const fetchMock = await previewed({ confirm: () => response({ error: 'plan_blocked', plan: blocked }, 422) })
    fireEvent.click(confirmButton()!)
    await screen.findByText('repository_edited')
    expect(confirmButton()).toBeNull()
    expect(confirmCalls(fetchMock)).toHaveLength(1)
  })

  it('on 410 drops the expired plan and asks for a new preview', async () => {
    const fetchMock = await previewed({ confirm: () => response({ error: 'plan_expired' }, 410) })
    fireEvent.click(confirmButton()!)
    await screen.findByText(/This preview expired before it was confirmed/)
    expect(screen.queryByText('Plan to confirm')).toBeNull()
    expect(confirmButton()).toBeNull()
    expect((screen.getByLabelText('App id') as HTMLInputElement).value).toBe('school-clubs')
    expect(confirmCalls(fetchMock)).toHaveLength(1)
  })

  it('stops offering confirmation once the preview expires locally', async () => {
    const fetchMock = stubApi({ preview: () => response({ planId: 'p1', expiresAt: Date.now() + 20, plan: plan() }, 201) })
    renderView()
    fill()
    fireEvent.click(previewButton())
    await screen.findByText('Plan to confirm')
    await screen.findByText('This preview expired. Preview again to get a plan you can confirm.')
    expect(confirmButton()).toBeNull()
    expect(confirmCalls(fetchMock)).toHaveLength(0)
  })

  it('keeps the plan after a failed confirmation and retries the same plan id, joining its receipt', async () => {
    let confirms = 0
    const fetchMock = await previewed({
      confirm: () => (++confirms === 1
        ? response({ error: 'provisioning service is unreachable — retry later' }, 503)
        : response({ planId: 'p1', joined: true, ...op({ status: 'completed', steps: [{ name: 'host', status: 'ok', detail: '' }] }) })),
    })
    fireEvent.click(confirmButton()!)
    expect((await screen.findByRole('alert')).textContent).toContain('Nothing ran')
    expect(screen.getByText('Plan to confirm')).toBeTruthy()
    fireEvent.click(confirmButton()!)
    await screen.findByText('Live: provisioning completed and the app responds.')
    expect(confirmCalls(fetchMock).map(([u]) => u)).toEqual([`${API}/provisioning/plans/p1/confirm`, `${API}/provisioning/plans/p1/confirm`])
    expect(screen.getByText(/joined an operation that had already started/)).toBeTruthy()
    expect(screen.getByText('rcpt-1')).toBeTruthy()
  })
})

describe('ProvisionView progress', () => {
  async function confirmed(confirmBody: ProvisionOperation, polls: (ProvisionOperation | Response)[]) {
    let i = 0
    const fetchMock = stubApi({
      preview: () => response({ planId: 'p1', expiresAt: Date.now() + 600_000, plan: plan() }, 201),
      confirm: () => response({ planId: 'p1', joined: false, ...confirmBody }),
      operation: () => {
        const next = polls[Math.min(i++, polls.length - 1)]!
        return next instanceof Response ? next : response(next)
      },
    })
    renderView()
    fill()
    fireEvent.click(previewButton())
    await screen.findByText('Plan to confirm')
    fireEvent.click(confirmButton()!)
    return fetchMock
  }

  it('polls a pending receipt and reports provisioned-but-not-live honestly', async () => {
    const fetchMock = await confirmed(op(), [
      response({ error: 'provisioning operation not found' }, 404),
      op({ steps: [{ name: 'repo_created', status: 'ok', detail: '' }, { name: 'compliance', status: 'pending', detail: '' }] }),
      op({ status: 'completed', steps: [{ name: 'repo_created', status: 'ok', detail: '' }, { name: 'host', status: 'pending', detail: 'first deploy not served' }] }),
    ])
    await screen.findByText('Provisioned, not live yet: the first deploy has not served.')
    const pollUrls = fetchMock.mock.calls.filter(([u]) => u.includes('/provision-operations/')).map(([u]) => u)
    expect(pollUrls.length).toBeGreaterThanOrEqual(3)
    expect(new Set(pollUrls)).toEqual(new Set([`${API}/provision-operations/school-clubs`]))
    const count = pollUrls.length
    await new Promise((r) => setTimeout(r, 30))
    expect(fetchMock.mock.calls.filter(([u]) => u.includes('/provision-operations/'))).toHaveLength(count)
    expect(screen.getByText('first deploy not served')).toBeTruthy()
  })

  it('shows a live app with read-back URLs from the receipt', async () => {
    await confirmed(op(), [op({
      status: 'completed',
      steps: [{ name: 'host', status: 'ok', detail: '' }],
      result: { success: true, appUrl: 'https://school-clubs.proappstore.online', dataWorkerUrl: 'https://data-school-clubs.proappstore.online' },
    })])
    await screen.findByText('Live: provisioning completed and the app responds.')
    expect(screen.getByRole('link', { name: 'https://school-clubs.proappstore.online' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'https://github.com/proappstore-online/school-clubs' })).toBeTruthy()
    expect(screen.getByText('https://data-school-clubs.proappstore.online')).toBeTruthy()
  })

  it('reports a partial failure with its evidence and retries through a new preview', async () => {
    const fetchMock = await confirmed(
      op({ status: 'failed', steps: [{ name: 'repo_created', status: 'ok', detail: '' }, { name: 'compliance', status: 'fail', detail: 'missing privacy policy' }] }),
      [],
    )
    // The confirmation already carried the terminal state: no polling.
    await screen.findByText(/^Failed\./)
    expect(screen.getByText('missing privacy policy')).toBeTruthy()
    expect(fetchMock.mock.calls.filter(([u]) => u.includes('/provision-operations/'))).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Preview again to retry' }))
    expect((screen.getByLabelText('App id') as HTMLInputElement).value).toBe('school-clubs')
    expect(screen.getByLabelText('App id').closest('fieldset')!.disabled).toBe(false)
    expect(confirmButton()).toBeNull()
  })

  it('reports an exhausted receipt as stopped', async () => {
    await confirmed(op(), [op({ status: 'exhausted' })])
    await screen.findByText('Stopped: the maximum number of attempts was reached.')
  })
})

describe('ProvisionView keyboard and structure', () => {
  it('submits the preview from the form (Enter), keeps a logical tab order, and focuses the plan', async () => {
    const fetchMock = stubApi({ preview: () => response({ planId: 'p1', expiresAt: Date.now() + 600_000, plan: plan() }, 201) })
    const { container } = renderView()
    fill()
    fireEvent.submit(screen.getByRole('form', { name: 'Provisioning draft' }))
    await screen.findByText('Plan to confirm')
    expect(previewCalls(fetchMock)).toHaveLength(1)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Plan to confirm' })))

    const order = [...container.querySelectorAll('input, textarea, button')]
      .filter((el) => !(el as HTMLElement).hasAttribute('tabindex') || (el as HTMLElement).tabIndex >= 0)
      .map((el) => el.getAttribute('id') ?? (el as HTMLInputElement).value ?? el.textContent)
    expect(order.slice(0, 6)).toEqual(['prov-app-id', 'prov-name', 'prov-description', 'template-app', 'template-marketplace', 'prov-template-rev'])
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Preview plan', 'Confirm and provision'])
    // Radios share a name so arrow keys move between them.
    expect(new Set(screen.getAllByRole('radio').map((r) => r.getAttribute('name')))).toEqual(new Set(['prov-template']))
  })
})
