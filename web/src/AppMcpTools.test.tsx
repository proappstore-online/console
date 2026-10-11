// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { AppMcpTools } from './AppMcpTools'

const ENDPOINT = 'https://mcp.proappstore.online/mcp/apps/crm'
const CLIENTS = ['Claude Code', 'Claude Desktop', 'Cursor']

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function mockTools(tools: unknown[]) {
  const fetchMock = vi.fn(async (_url: string) => Response.json({ tools }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('AppMcpTools', () => {
  it("shows the app's own MCP endpoint, never the shared /mcp, in the endpoint and every client snippet", async () => {
    mockTools([])
    render(<AppMcpTools appId="crm" getToken={() => 'tok'} />)
    await screen.findByText(/No tools registered yet/)

    expect(screen.getByTestId('mcp-endpoint').textContent).toBe(ENDPOINT)
    for (const client of CLIENTS) {
      const snippet = screen.getByTestId(`mcp-snippet-${client}`).textContent!
      expect(snippet).toContain(ENDPOINT)
      expect(snippet).not.toContain('mcp.proappstore.online/mcp"')
      expect(snippet).not.toContain('mcp.proappstore.online/mcp ')
    }
    expect(screen.getByTestId('mcp-snippet-Claude Code').textContent).toBe(`claude mcp add --transport http crm ${ENDPOINT}`)
    expect(JSON.parse(screen.getByTestId('mcp-snippet-Claude Desktop').textContent!))
      .toEqual({ mcpServers: { crm: { command: 'npx', args: ['mcp-remote', ENDPOINT] } } })
    expect(JSON.parse(screen.getByTestId('mcp-snippet-Cursor').textContent!))
      .toEqual({ mcpServers: { crm: { url: ENDPOINT } } })
  })

  it('copies the exact snippet text', async () => {
    mockTools([])
    const writeText = vi.fn()
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<AppMcpTools appId="crm" getToken={() => 'tok'} />)
    await screen.findByText(/No tools registered yet/)
    const block = screen.getByTestId('mcp-snippet-Claude Code').parentElement!
    fireEvent.click(within(block).getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith(`claude mcp add --transport http crm ${ENDPOINT}`)
  })

  it('labels a batch tool as writes and shows all its statements as atomic SQL', async () => {
    const fetchMock = mockTools([{
      name: 'move_deal', description: 'Move a deal', operation: 'batch',
      statements: ['INSERT INTO deal_events (deal_id) VALUES (:id)', 'UPDATE deals SET stage = :stage WHERE id = :id'],
    }])
    render(<AppMcpTools appId="crm" getToken={() => 'tok'} />)
    const name = await screen.findByText('move_deal')
    expect(new URL(fetchMock.mock.calls[0]![0]).pathname).toBe('/v1/apps/crm/tools')
    expect(screen.queryByText('crm/move_deal')).toBeNull()
    const card = name.closest('div.rounded-xl') as HTMLElement
    expect(within(card).getByText('writes')).toBeTruthy()
    expect(within(card).queryByText('reads')).toBeNull()
    expect(within(card).getByText('atomic, 2 statements')).toBeTruthy()

    fireEvent.click(within(card).getByRole('button', { name: /show SQL/ }))
    const sql = card.querySelector('pre')!.textContent!
    expect(sql).toContain('INSERT INTO deal_events (deal_id) VALUES (:id)')
    expect(sql).toContain('UPDATE deals SET stage = :stage WHERE id = :id')
  })

  it('labels query tools reads and execute tools writes', async () => {
    mockTools([
      { name: 'list_deals', description: 'List', operation: 'query', sql: 'SELECT 1' },
      { name: 'close_deal', description: 'Close', operation: 'execute', sql: 'UPDATE deals SET closed = 1' },
    ])
    render(<AppMcpTools appId="crm" getToken={() => 'tok'} />)
    const read = (await screen.findByText('list_deals')).closest('div.rounded-xl') as HTMLElement
    const write = screen.getByText('close_deal').closest('div.rounded-xl') as HTMLElement
    expect(within(read).getByText('reads')).toBeTruthy()
    expect(within(write).getByText('writes')).toBeTruthy()
    expect(within(write).queryByText(/atomic/)).toBeNull()
  })

  it('badges endpoints created in Data → API as console, and code tools (or a missing source) without it', async () => {
    mockTools([
      { name: 'api_my_tasks', description: 'Mine', operation: 'query', sql: 'SELECT 1', source: 'console' },
      { name: 'list_deals', description: 'List', operation: 'query', sql: 'SELECT 1', source: 'code' },
      { name: 'old_tool', description: 'Old', operation: 'query', sql: 'SELECT 1' },
    ])
    render(<AppMcpTools appId="crm" getToken={() => 'tok'} />)
    const card = (n: string) => screen.getByText(n).closest('div.rounded-xl') as HTMLElement
    await screen.findByText('api_my_tasks')
    expect(within(card('api_my_tasks')).getByText('console')).toBeTruthy()
    expect(within(card('list_deals')).queryByText('console')).toBeNull()
    expect(within(card('old_tool')).queryByText('console')).toBeNull()
    expect(screen.getByText(/or created in Data → API/)).toBeTruthy()
  })
})
