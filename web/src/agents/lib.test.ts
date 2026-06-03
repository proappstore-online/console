import { describe, it, expect } from 'vitest'
import { mergeServerChat } from './lib'
import type { ChatMessage } from './types'

const msg = (id: string, role: ChatMessage['role'], text: string, pending = false): ChatMessage =>
  ({ id, role, text, timestamp: 0, ...(pending ? { pending: true } : {}) })

describe('mergeServerChat', () => {
  it('keeps an optimistic pending message the server snapshot lacks (no blink-out)', () => {
    const prev = [msg('s1', 'po', 'hi'), msg('tmp', 'user', 'build me a thing', true)]
    const server = [msg('s1', 'po', 'hi')] // stale — user message not persisted yet
    const merged = mergeServerChat(prev, server)
    expect(merged.map(m => m.text)).toEqual(['hi', 'build me a thing'])
  })

  it('drops the pending copy once the server echoes it (no duplicate)', () => {
    const prev = [msg('tmp', 'user', 'hello', true)]
    const server = [msg('srv', 'user', 'hello')] // server now has it with a real id
    const merged = mergeServerChat(prev, server)
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('srv')
    expect(merged[0].pending).toBeUndefined()
  })

  it('is server-authoritative for confirmed messages (returns the snapshot as-is)', () => {
    const prev = [msg('a', 'user', 'x'), msg('b', 'po', 'y')]
    const server = [msg('a', 'user', 'x'), msg('b', 'po', 'y'), msg('c', 'po', 'z')]
    expect(mergeServerChat(prev, server)).toBe(server) // no pending → identity
  })

  it('does NOT preserve non-pending client-only messages (welcome/errors clear on reload)', () => {
    const prev = [msg('0', 'system', 'welcome'), msg('e', 'system', 'Error: boom')]
    const server = [msg('s1', 'po', 'real')]
    expect(mergeServerChat(prev, server)).toEqual(server)
  })
})
