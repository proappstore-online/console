// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { SchemaTab } from './SchemaTab'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SchemaTab', () => {
  it('renders tables, columns, and declared foreign-key relationships as a graph', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        rows: [
          { name: 'orgs', sql: 'CREATE TABLE orgs (id TEXT PRIMARY KEY)' },
          { name: 'members', sql: 'CREATE TABLE members (org_id TEXT REFERENCES orgs(id))' },
        ],
      }))
      .mockResolvedValueOnce(Response.json({
        rows: [
          { cid: 0, name: 'id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 1 },
        ],
      }))
      .mockResolvedValueOnce(Response.json({ rows: [] }))
      .mockResolvedValueOnce(Response.json({
        rows: [
          { cid: 0, name: 'org_id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
        ],
      }))
      .mockResolvedValueOnce(Response.json({
        rows: [
          {
            id: 0,
            seq: 0,
            table: 'orgs',
            from: 'org_id',
            to: 'id',
            on_update: 'NO ACTION',
            on_delete: 'CASCADE',
            match: 'NONE',
          },
        ],
      }))
    vi.stubGlobal('fetch', fetchMock)

    render(<SchemaTab appId="interns" getToken={() => 'tok'} />)

    await waitFor(() => {
      expect(screen.getByText('Relational schema')).toBeTruthy()
    })

    expect(screen.getByText('2 tables · 1 declared · 0 inferred')).toBeTruthy()
    expect(screen.getAllByText('orgs').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('members').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('org_id')).toBeTruthy()
    expect(screen.getByText('org_id -> id')).toBeTruthy()
    expect(screen.getByText('CREATE TABLE statements')).toBeTruthy()
  })

  it('renders inferred relationships for conventional *_id columns without declared foreign keys', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        rows: [
          { name: 'orgs', sql: 'CREATE TABLE orgs (id TEXT PRIMARY KEY)' },
          { name: 'members', sql: 'CREATE TABLE members (org_id TEXT)' },
        ],
      }))
      .mockResolvedValueOnce(Response.json({
        rows: [
          { cid: 0, name: 'id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 1 },
        ],
      }))
      .mockResolvedValueOnce(Response.json({ rows: [] }))
      .mockResolvedValueOnce(Response.json({
        rows: [
          { cid: 0, name: 'org_id', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
        ],
      }))
      .mockResolvedValueOnce(Response.json({ rows: [] }))
    vi.stubGlobal('fetch', fetchMock)

    render(<SchemaTab appId="interns" getToken={() => 'tok'} />)

    await waitFor(() => {
      expect(screen.getByText('2 tables · 0 declared · 1 inferred')).toBeTruthy()
    })

    expect(screen.getByText('org_id -> id')).toBeTruthy()
    expect(screen.getByText('REL')).toBeTruthy()
  })
})
