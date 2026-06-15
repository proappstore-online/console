import type { QueryResult } from './dbBrowserTypes'

export interface SchemaColumn {
  name: string
  type: string
  notNull: boolean
  defaultValue: unknown
  primaryKeyPosition: number
}

export interface SchemaForeignKey {
  id: number
  sequence: number
  table: string
  from: string
  to: string
  onUpdate: string
  onDelete: string
  match: string
}

export interface TableSchema {
  name: string
  sql: string
  columns: SchemaColumn[]
  foreignKeys: SchemaForeignKey[]
}

export interface DatabaseSchema {
  tables: TableSchema[]
}

export function quoteSqlIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

export function tableSchemaFromRows(
  table: { name: string; sql: string },
  columnRows: QueryResult['rows'],
  foreignKeyRows: QueryResult['rows'],
): TableSchema {
  return {
    ...table,
    columns: columnRows.map((row) => ({
      name: String(row.name ?? ''),
      type: String(row.type ?? ''),
      notNull: Number(row.notnull ?? 0) === 1,
      defaultValue: row.dflt_value ?? null,
      primaryKeyPosition: Number(row.pk ?? 0),
    })).filter((column) => column.name.length > 0),
    foreignKeys: foreignKeyRows.map((row) => ({
      id: Number(row.id ?? 0),
      sequence: Number(row.seq ?? 0),
      table: String(row.table ?? ''),
      from: String(row.from ?? ''),
      to: String(row.to ?? ''),
      onUpdate: String(row.on_update ?? ''),
      onDelete: String(row.on_delete ?? ''),
      match: String(row.match ?? ''),
    })).filter((foreignKey) => (
      foreignKey.table.length > 0
      && foreignKey.from.length > 0
      && foreignKey.to.length > 0
    )),
  }
}

export interface SchemaNodeLayout {
  name: string
  x: number
  y: number
  width: number
  height: number
}

export interface SchemaEdgeLayout {
  key: string
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
  startX: number
  startY: number
  endX: number
  endY: number
  labelX: number
  labelY: number
}

export interface SchemaGraphLayout {
  width: number
  height: number
  nodes: SchemaNodeLayout[]
  edges: SchemaEdgeLayout[]
}

export function buildSchemaGraphLayout(tables: TableSchema[]): SchemaGraphLayout {
  const nodeWidth = 280
  const xGap = 56
  const yGap = 48
  const columns = tables.length <= 2 ? Math.max(tables.length, 1) : 3
  const nodes: SchemaNodeLayout[] = []
  const rowHeights: number[] = []

  for (let index = 0; index < tables.length; index += 1) {
    const table = tables[index]!
    const visibleColumns = Math.min(table.columns.length, 8)
    const height = 72 + (visibleColumns * 24) + (table.columns.length > visibleColumns ? 24 : 0)
    const row = Math.floor(index / columns)
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, height)
    nodes.push({
      name: table.name,
      x: (index % columns) * (nodeWidth + xGap),
      y: 0,
      width: nodeWidth,
      height,
    })
  }

  for (const node of nodes) {
    const index = nodes.indexOf(node)
    const row = Math.floor(index / columns)
    node.y = rowHeights.slice(0, row).reduce((total, rowHeight) => total + rowHeight + yGap, 0)
  }

  const nodeByName = new Map(nodes.map((node) => [node.name, node]))
  const edges: SchemaEdgeLayout[] = []

  for (const table of tables) {
    for (const foreignKey of table.foreignKeys) {
      const fromNode = nodeByName.get(table.name)
      const toNode = nodeByName.get(foreignKey.table)
      if (!fromNode || !toNode) continue

      const sameTable = fromNode.name === toNode.name
      const startX = sameTable ? fromNode.x + fromNode.width - 16 : fromNode.x + fromNode.width / 2
      const startY = sameTable ? fromNode.y + 44 : fromNode.y + fromNode.height / 2
      const endX = sameTable ? toNode.x + toNode.width - 16 : toNode.x + toNode.width / 2
      const endY = sameTable ? toNode.y + toNode.height - 16 : toNode.y + toNode.height / 2

      edges.push({
        key: `${table.name}.${foreignKey.from}-${foreignKey.table}.${foreignKey.to}-${foreignKey.id}-${foreignKey.sequence}`,
        fromTable: table.name,
        fromColumn: foreignKey.from,
        toTable: foreignKey.table,
        toColumn: foreignKey.to,
        startX,
        startY,
        endX,
        endY,
        labelX: sameTable ? fromNode.x + fromNode.width + 28 : (startX + endX) / 2,
        labelY: sameTable ? (startY + endY) / 2 : (startY + endY) / 2 - 8,
      })
    }
  }

  const width = Math.max(640, Math.min(tables.length, columns) * nodeWidth + (Math.min(tables.length, columns) - 1) * xGap)
  const height = Math.max(260, rowHeights.reduce((total, rowHeight, index) => (
    total + rowHeight + (index === rowHeights.length - 1 ? 0 : yGap)
  ), 0))

  return { width, height, nodes, edges }
}
