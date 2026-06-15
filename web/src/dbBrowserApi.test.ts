import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchTables } from './dbBrowserApi'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchTables', () => {
  it('accepts the data worker array response shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(['orgs', 'members'])))

    await expect(fetchTables('tok', 'interns')).resolves.toEqual(['orgs', 'members'])
  })

  it('accepts the object response shape for compatibility', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ tables: ['items'] })))

    await expect(fetchTables('tok', 'interns')).resolves.toEqual(['items'])
  })

  it('rejects malformed table responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ rows: [] })))

    await expect(fetchTables('tok', 'interns')).rejects.toThrow('Tables response was not an array')
  })
})
