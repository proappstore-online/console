import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchDatabaseSchema, fetchTables } from './dbBrowserApi'

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

describe('fetchDatabaseSchema', () => {
  it('loads table columns and foreign keys', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        rows: [
          { name: 'orgs', sql: 'CREATE TABLE orgs (id TEXT PRIMARY KEY)' },
        ],
      }))
      .mockResolvedValueOnce(Response.json({
        rows: [
          { cid: 0, name: 'id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 1 },
        ],
      }))
      .mockResolvedValueOnce(Response.json({ rows: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchDatabaseSchema('tok', 'interns')).resolves.toEqual({
      tables: [
        {
          name: 'orgs',
          sql: 'CREATE TABLE orgs (id TEXT PRIMARY KEY)',
          columns: [
            { name: 'id', type: 'TEXT', notNull: true, defaultValue: null, primaryKeyPosition: 1 },
          ],
          foreignKeys: [],
        },
      ],
    })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({
      sql: 'PRAGMA table_info("orgs")',
      params: [],
    })
    expect(JSON.parse(fetchMock.mock.calls[2]![1].body)).toEqual({
      sql: 'PRAGMA foreign_key_list("orgs")',
      params: [],
    })
  })
})
