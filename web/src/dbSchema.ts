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

export interface SchemaRelationship {
  source: 'declared' | 'inferred'
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
  id: number
  sequence: number
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
  source: SchemaRelationship['source']
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
  const headerHeight = 36
  const rowHeight = 24
  const xGap = 56
  const yGap = 48
  const columns = tables.length <= 2 ? Math.max(tables.length, 1) : 3
  const nodes: SchemaNodeLayout[] = []
  const rowHeights: number[] = []

  for (let index = 0; index < tables.length; index += 1) {
    const table = tables[index]!
    const visibleColumns = Math.min(table.columns.length, 8)
    const height = headerHeight + (visibleColumns * rowHeight) + (table.columns.length > visibleColumns ? rowHeight : 0)
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
  const relationships = buildSchemaRelationships(tables)

  for (const relationship of relationships) {
    const fromNode = nodeByName.get(relationship.fromTable)
    const toNode = nodeByName.get(relationship.toTable)
    const fromTable = tables.find((table) => table.name === relationship.fromTable)
    const toTable = tables.find((table) => table.name === relationship.toTable)
    if (!fromNode || !toNode) continue

    const sameTable = fromNode.name === toNode.name
    const fromColumnY = columnAnchorY(fromNode, fromTable, relationship.fromColumn, headerHeight, rowHeight)
    const toColumnY = columnAnchorY(toNode, toTable, relationship.toColumn, headerHeight, rowHeight)
    const fromIsLeftOfTarget = fromNode.x + fromNode.width / 2 <= toNode.x + toNode.width / 2
    const startX = sameTable || fromIsLeftOfTarget ? fromNode.x + fromNode.width : fromNode.x
    const endX = sameTable || fromIsLeftOfTarget ? toNode.x : toNode.x + toNode.width
    const startY = fromColumnY
    const endY = toColumnY

    edges.push({
      key: `${relationship.source}-${relationship.fromTable}.${relationship.fromColumn}-${relationship.toTable}.${relationship.toColumn}-${relationship.id}-${relationship.sequence}`,
      source: relationship.source,
      fromTable: relationship.fromTable,
      fromColumn: relationship.fromColumn,
      toTable: relationship.toTable,
      toColumn: relationship.toColumn,
      startX,
      startY,
      endX,
      endY,
      labelX: sameTable ? fromNode.x + fromNode.width + 28 : (startX + endX) / 2,
      labelY: sameTable ? (startY + endY) / 2 : (startY + endY) / 2 - 8,
    })
  }

  const width = Math.max(640, Math.min(tables.length, columns) * nodeWidth + (Math.min(tables.length, columns) - 1) * xGap)
  const height = Math.max(260, rowHeights.reduce((total, rowHeight, index) => (
    total + rowHeight + (index === rowHeights.length - 1 ? 0 : yGap)
  ), 0))

  return { width, height, nodes, edges }
}

function columnAnchorY(
  node: SchemaNodeLayout,
  table: TableSchema | undefined,
  columnName: string,
  headerHeight: number,
  rowHeight: number,
): number {
  const columnIndex = table?.columns.findIndex((column) => column.name === columnName) ?? -1
  if (columnIndex >= 0 && columnIndex < 8) {
    return node.y + headerHeight + (columnIndex * rowHeight) + (rowHeight / 2)
  }
  return node.y + Math.max(headerHeight + (rowHeight / 2), node.height - (rowHeight / 2))
}

export function buildSchemaRelationships(tables: TableSchema[]): SchemaRelationship[] {
  const relationships: SchemaRelationship[] = []
  const declaredColumns = new Set<string>()
  const tableByAlias = buildTableAliasMap(tables)

  for (const table of tables) {
    for (const foreignKey of table.foreignKeys) {
      declaredColumns.add(`${table.name}.${foreignKey.from}`)
      relationships.push({
        source: 'declared',
        fromTable: table.name,
        fromColumn: foreignKey.from,
        toTable: foreignKey.table,
        toColumn: foreignKey.to,
        id: foreignKey.id,
        sequence: foreignKey.sequence,
      })
    }
  }

  let inferredId = 0
  for (const table of tables) {
    for (const column of table.columns) {
      const columnKey = `${table.name}.${column.name}`
      if (declaredColumns.has(columnKey)) continue
      const targetAlias = foreignKeyColumnAlias(column.name)
      if (!targetAlias) continue
      const targetTable = tableByAlias.get(targetAlias)
      if (!targetTable || targetTable.name === table.name) continue
      const targetColumn = primaryKeyColumn(targetTable)
      if (!targetColumn) continue
      relationships.push({
        source: 'inferred',
        fromTable: table.name,
        fromColumn: column.name,
        toTable: targetTable.name,
        toColumn: targetColumn.name,
        id: inferredId,
        sequence: 0,
      })
      inferredId += 1
    }
  }

  return relationships
}

function buildTableAliasMap(tables: TableSchema[]): Map<string, TableSchema> {
  const aliases = new Map<string, TableSchema>()
  for (const table of tables) {
    for (const alias of tableAliases(table.name)) {
      if (!aliases.has(alias)) aliases.set(alias, table)
    }
  }
  return aliases
}

function tableAliases(tableName: string): string[] {
  const normalized = normalizeName(tableName)
  const singular = singularize(normalized)
  return [...new Set([normalized, singular])]
}

function foreignKeyColumnAlias(columnName: string): string | null {
  const normalized = normalizeName(columnName)
  if (normalized.length <= 2) return null
  if (normalized.endsWith('id')) {
    const alias = normalized.slice(0, -2)
    return alias.length > 0 ? singularize(alias) : null
  }
  return null
}

function primaryKeyColumn(table: TableSchema): SchemaColumn | null {
  const primaryKeys = table.columns
    .filter((column) => column.primaryKeyPosition > 0)
    .sort((a, b) => a.primaryKeyPosition - b.primaryKeyPosition)
  return primaryKeys[0] ?? table.columns.find((column) => normalizeName(column.name) === 'id') ?? null
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function singularize(name: string): string {
  if (name.endsWith('ies') && name.length > 3) return `${name.slice(0, -3)}y`
  if (name.endsWith('ses') && name.length > 3) return name.slice(0, -2)
  if (name.endsWith('s') && name.length > 1) return name.slice(0, -1)
  return name
}
