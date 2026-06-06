import { describe, it, expect, vi } from 'vitest'
import { handleEvent, type TicketLiveEntry } from './useAgentWebSocket'

function makeOpts() {
  return {
    appId: 'test-app',
    token: 'tok',
    notStarted: false,
    setProject: vi.fn(),
    setTickets: vi.fn(),
    setChat: vi.fn(),
    setKbChat: vi.fn(),
    setActivity: vi.fn(),
    setAgentWork: vi.fn(),
    setTicketLive: vi.fn(),
    setSelTicket: vi.fn(),
    setFilesVersion: vi.fn(),
    syncLive: vi.fn(),
    refreshTickets: vi.fn(),
    loadMemory: vi.fn(),
    loadFileList: vi.fn(),
    memOpenRef: { current: false },
    fileListOpenRef: { current: false },
  }
}

describe('handleEvent — agent events', () => {
  it('agent-run-started sets ticketLive with startedAt and resets text', () => {
    const opts = makeOpts()
    handleEvent({ type: 'agent-run-started', ticketId: 't1', role: 'Dev', costUsd: 0, tokensIn: 0, tokensOut: 0 }, opts)
    expect(opts.setAgentWork).toHaveBeenCalled()
    expect(opts.setTicketLive).toHaveBeenCalled()
    // Call the setter function to verify the update
    const setter = opts.setTicketLive.mock.calls[0][0] as (prev: Record<string, TicketLiveEntry>) => Record<string, TicketLiveEntry>
    const result = setter({})
    expect(result.t1.text).toBe('Dev starting...')
    expect(result.t1.startedAt).toBeGreaterThan(0)
    expect(result.t1.role).toBe('Dev')
  })

  it('agent-text accumulates text without clobbering', () => {
    const opts = makeOpts()
    handleEvent({ type: 'agent-text', ticketId: 't1', role: 'Dev', text: 'writing code' }, opts)
    const setter = opts.setTicketLive.mock.calls[0][0] as (prev: Record<string, TicketLiveEntry>) => Record<string, TicketLiveEntry>
    const prev = { t1: { text: 'existing ', role: 'Dev', at: 1, startedAt: 100, costUsd: 0.5 } }
    const result = setter(prev)
    expect(result.t1.text).toBe('existing writing code')
    expect(result.t1.startedAt).toBe(100) // preserved
    expect(result.t1.costUsd).toBe(0.5) // preserved (no cost on text event)
  })

  it('agent-tool-call preserves existing text and updates cost', () => {
    const opts = makeOpts()
    handleEvent({ type: 'agent-tool-call', ticketId: 't1', role: 'Dev', name: 'write_file', costUsd: 1.5, tokensIn: 5000, tokensOut: 2000 }, opts)
    const setter = opts.setTicketLive.mock.calls[0][0] as (prev: Record<string, TicketLiveEntry>) => Record<string, TicketLiveEntry>
    const prev = { t1: { text: 'I am writing', role: 'Dev', at: 1, startedAt: 100, costUsd: 0.5 } }
    const result = setter(prev)
    expect(result.t1.text).toBe('I am writing') // NOT overwritten
    expect(result.t1.costUsd).toBe(1.5) // updated from event
    expect(result.t1.tokensIn).toBe(5000)
    expect(result.t1.startedAt).toBe(100) // preserved
  })

  it('agent-tool-call shows tool name when no prior text exists', () => {
    const opts = makeOpts()
    handleEvent({ type: 'agent-tool-call', ticketId: 't1', role: 'Dev', name: 'read_file' }, opts)
    const setter = opts.setTicketLive.mock.calls[0][0] as (prev: Record<string, TicketLiveEntry>) => Record<string, TicketLiveEntry>
    const result = setter({})
    expect(result.t1.text).toBe('Dev: read_file()')
  })

  it('agent-heartbeat updates cost without clobbering text', () => {
    const opts = makeOpts()
    handleEvent({ type: 'agent-heartbeat', ticketId: 't1', role: 'Dev', costUsd: 2.0, tokensIn: 8000, tokensOut: 3000 }, opts)
    const setter = opts.setTicketLive.mock.calls[0][0] as (prev: Record<string, TicketLiveEntry>) => Record<string, TicketLiveEntry>
    const prev = { t1: { text: 'working on i18n', role: 'Dev', at: 1, costUsd: 0.5 } }
    const result = setter(prev)
    expect(result.t1.text).toBe('working on i18n') // preserved
    expect(result.t1.costUsd).toBe(2.0) // updated
    expect(result.t1.tokensIn).toBe(8000)
  })
})

describe('handleEvent — activity events', () => {
  it('appends activity entries (deduped by id)', () => {
    const opts = makeOpts()
    handleEvent({ type: 'activity', entry: { id: 'a1', type: 'tool', detail: 'Dev: read_file x.ts', createdAt: 1000 } }, opts)
    expect(opts.setActivity).toHaveBeenCalled()
    const setter = opts.setActivity.mock.calls[0][0] as (prev: any[]) => any[]
    expect(setter([]).length).toBe(1)
    // Dedup: same id doesn't add again
    expect(setter([{ id: 'a1' }]).length).toBe(1)
  })

  it('activity does NOT overwrite existing ticketLive text', () => {
    const opts = makeOpts()
    handleEvent({ type: 'activity', entry: { id: 'a1', ticketId: 't1', type: 'tool', detail: 'Dev: read_file', createdAt: 1000 } }, opts)
    const setter = opts.setTicketLive.mock.calls[0][0] as (prev: Record<string, TicketLiveEntry>) => Record<string, TicketLiveEntry>
    const prev = { t1: { text: 'I am writing code', role: 'Dev', at: 1 } }
    const result = setter(prev)
    expect(result.t1.text).toBe('I am writing code') // NOT overwritten by activity
  })
})

describe('handleEvent — chat events', () => {
  it('routes build chat to setChat', () => {
    const opts = makeOpts()
    handleEvent({ type: 'chat', id: 'c1', role: 'po', body: 'hello', thread: 'build' }, opts)
    expect(opts.setChat).toHaveBeenCalled()
    expect(opts.setKbChat).not.toHaveBeenCalled()
  })

  it('routes research chat to setKbChat', () => {
    const opts = makeOpts()
    handleEvent({ type: 'chat', id: 'c1', role: 'Architect', body: 'hello', thread: 'research' }, opts)
    expect(opts.setKbChat).toHaveBeenCalled()
    expect(opts.setChat).not.toHaveBeenCalled()
  })

  it('ignores user chat (already shown optimistically)', () => {
    const opts = makeOpts()
    handleEvent({ type: 'chat', id: 'c1', role: 'user', body: 'hi' }, opts)
    expect(opts.setChat).not.toHaveBeenCalled()
    expect(opts.setKbChat).not.toHaveBeenCalled()
  })
})

describe('handleEvent — ticket lifecycle', () => {
  it('transition triggers refreshTickets', () => {
    const opts = makeOpts()
    handleEvent({ type: 'transition', ticketId: 't1' }, opts)
    expect(opts.refreshTickets).toHaveBeenCalled()
  })

  it('ticket-deleted filters the ticket out and clears matching selection', () => {
    const opts = makeOpts()
    handleEvent({ type: 'ticket-deleted', ticketId: 't1' }, opts)
    // Verify setTickets filters by id
    const ticketSetter = opts.setTickets.mock.calls[0][0] as (prev: any[]) => any[]
    const filtered = ticketSetter([{ id: 't1' }, { id: 't2' }])
    expect(filtered).toEqual([{ id: 't2' }])
    // Verify setSelTicket clears only if matching
    const selSetter = opts.setSelTicket.mock.calls[0][0] as (prev: any) => any
    expect(selSetter({ id: 't1' })).toBeNull()
    expect(selSetter({ id: 't2' })).toEqual({ id: 't2' }) // different ticket, keep it
  })

  it('cost-cap-reached sets project status to paused', () => {
    const opts = makeOpts()
    handleEvent({ type: 'cost-cap-reached' }, opts)
    const setter = opts.setProject.mock.calls[0][0] as (prev: any) => any
    const result = setter({ status: 'running', costCapMonthlyUsd: 50 })
    expect(result.status).toBe('paused')
    expect(opts.refreshTickets).toHaveBeenCalled()
  })
})

describe('handleEvent — agent-tool-result', () => {
  it('preserves existing text and updates cost', () => {
    const opts = makeOpts()
    handleEvent({ type: 'agent-tool-result', ticketId: 't1', role: 'Dev', ok: true, costUsd: 2.0, tokensIn: 5000, tokensOut: 2000 }, opts)
    const setter = opts.setTicketLive.mock.calls[0][0] as (prev: Record<string, any>) => Record<string, any>
    const prev = { t1: { text: 'writing code', role: 'Dev', at: 1, costUsd: 0.5 } }
    const result = setter(prev)
    expect(result.t1.text).toBe('writing code') // preserved
    expect(result.t1.costUsd).toBe(2.0) // updated
  })
})

describe('handleEvent — onAgentText callback', () => {
  it('calls onAgentText with role and text', () => {
    const opts = makeOpts()
    opts.onAgentText = vi.fn()
    handleEvent({ type: 'agent-text', ticketId: 't1', role: 'Architect', text: 'writing KB' }, opts)
    expect(opts.onAgentText).toHaveBeenCalledWith('Architect', 'writing KB')
  })
})
