import { describe, expect, it } from 'vitest'
import { buildSchemaGraphLayout, buildSchemaRelationships, quoteSqlIdentifier, tableSchemaFromRows } from './dbSchema'

describe('quoteSqlIdentifier', () => {
  it('quotes identifiers for SQLite pragmas', () => {
    expect(quoteSqlIdentifier('users')).toBe('"users"')
    expect(quoteSqlIdentifier('weird"name')).toBe('"weird""name"')
  })
})

describe('tableSchemaFromRows', () => {
  it('normalizes PRAGMA table_info and foreign_key_list rows', () => {
    const schema = tableSchemaFromRows(
      { name: 'members', sql: 'CREATE TABLE members (...)' },
      [
        { cid: 0, name: 'id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 1 },
        { cid: 1, name: 'org_id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
      ],
      [
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
    )

    expect(schema.columns).toEqual([
      { name: 'id', type: 'TEXT', notNull: true, defaultValue: null, primaryKeyPosition: 1 },
      { name: 'org_id', type: 'TEXT', notNull: true, defaultValue: null, primaryKeyPosition: 0 },
    ])
    expect(schema.foreignKeys).toEqual([
      {
        id: 0,
        sequence: 0,
        table: 'orgs',
        from: 'org_id',
        to: 'id',
        onUpdate: 'NO ACTION',
        onDelete: 'CASCADE',
        match: 'NONE',
      },
    ])
  })
})

describe('buildSchemaGraphLayout', () => {
  it('creates directed edges from foreign keys', () => {
    const layout = buildSchemaGraphLayout([
      {
        name: 'orgs',
        sql: '',
        columns: [{ name: 'id', type: 'TEXT', notNull: true, defaultValue: null, primaryKeyPosition: 1 }],
        foreignKeys: [],
      },
      {
        name: 'members',
        sql: '',
        columns: [
          { name: 'id', type: 'TEXT', notNull: true, defaultValue: null, primaryKeyPosition: 1 },
          { name: 'org_id', type: 'TEXT', notNull: true, defaultValue: null, primaryKeyPosition: 0 },
        ],
        foreignKeys: [{
          id: 0,
          sequence: 0,
          table: 'orgs',
          from: 'org_id',
          to: 'id',
          onUpdate: 'NO ACTION',
          onDelete: 'CASCADE',
          match: 'NONE',
        }],
      },
    ])

    expect(layout.nodes.map((node) => node.name)).toEqual(['orgs', 'members'])
    expect(layout.edges).toHaveLength(1)
    expect(layout.edges[0]).toMatchObject({
      source: 'declared',
      fromTable: 'members',
      fromColumn: 'org_id',
      toTable: 'orgs',
      toColumn: 'id',
    })
    expect(layout.edges[0]!.startY).toBe(72)
    expect(layout.edges[0]!.endY).toBe(48)
  })
})

describe('buildSchemaRelationships', () => {
  it('infers clear table relationships from *_id columns when no foreign key is declared', () => {
    const relationships = buildSchemaRelationships([
      {
        name: 'orgs',
        sql: '',
        columns: [{ name: 'id', type: 'TEXT', notNull: true, defaultValue: null, primaryKeyPosition: 1 }],
        foreignKeys: [],
      },
      {
        name: 'members',
        sql: '',
        columns: [
          { name: 'id', type: 'TEXT', notNull: true, defaultValue: null, primaryKeyPosition: 1 },
          { name: 'org_id', type: 'TEXT', notNull: true, defaultValue: null, primaryKeyPosition: 0 },
        ],
        foreignKeys: [],
      },
    ])

    expect(relationships).toEqual([
      {
        source: 'inferred',
        fromTable: 'members',
        fromColumn: 'org_id',
        toTable: 'orgs',
        toColumn: 'id',
        id: 0,
        sequence: 0,
      },
    ])
  })

  it('does not infer a duplicate relationship for declared foreign-key columns', () => {
    const relationships = buildSchemaRelationships([
      {
        name: 'orgs',
        sql: '',
        columns: [{ name: 'id', type: 'TEXT', notNull: true, defaultValue: null, primaryKeyPosition: 1 }],
        foreignKeys: [],
      },
      {
        name: 'members',
        sql: '',
        columns: [{ name: 'org_id', type: 'TEXT', notNull: true, defaultValue: null, primaryKeyPosition: 0 }],
        foreignKeys: [{
          id: 0,
          sequence: 0,
          table: 'orgs',
          from: 'org_id',
          to: 'id',
          onUpdate: 'NO ACTION',
          onDelete: 'CASCADE',
          match: 'NONE',
        }],
      },
    ])

    expect(relationships).toHaveLength(1)
    expect(relationships[0]).toMatchObject({ source: 'declared', fromColumn: 'org_id' })
  })
})
