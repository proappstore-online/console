import { useEffect, useMemo, useState } from 'react'
import { fetchDatabaseSchema } from './dbBrowserApi'
import { buildSchemaGraphLayout, buildSchemaRelationships, type DatabaseSchema, type TableSchema } from './dbSchema'

// ---------------------------------------------------------------------------
// Schema tab
// ---------------------------------------------------------------------------

export function SchemaTab({
  appId,
  getToken,
}: {
  appId: string
  getToken: () => string | null
}) {
  const [schema, setSchema] = useState<DatabaseSchema | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const token = getToken()
    if (!token) { setLoading(false); return }
    setLoading(true)
    setError(null)
    fetchDatabaseSchema(token, appId)
      .then((nextSchema) => {
        if (!cancelled) setSchema(nextSchema)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [appId, getToken])

  if (loading) return <p className="text-sm text-[var(--muted)]">Loading schema...</p>
  if (error) return <p className="text-sm text-[var(--error)]">Couldn't load schema. {error}</p>
  if (!schema || schema.tables.length === 0) {
    return <p className="text-sm text-[var(--muted)] italic">No tables found.</p>
  }

  const relationships = buildSchemaRelationships(schema.tables)
  const declaredRelationshipCount = relationships.filter((relationship) => relationship.source === 'declared').length
  const inferredRelationshipCount = relationships.filter((relationship) => relationship.source === 'inferred').length
  const relationshipCount = relationships.length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
            Relational schema
          </h4>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {schema.tables.length} table{schema.tables.length === 1 ? '' : 's'} · {declaredRelationshipCount} declared · {inferredRelationshipCount} inferred
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-px w-8 bg-[var(--accent)]" />
          declared foreign key
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-px w-8 border-t border-dashed border-[var(--accent)]" />
          inferred by naming
        </span>
      </div>

      {relationshipCount === 0 && (
        <p className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--muted)]">
          No declared or inferred relationships found. The graph still shows tables and columns.
        </p>
      )}

      <SchemaGraph tables={schema.tables} />
      <CreateTableStatements tables={schema.tables} />
    </div>
  )
}

function SchemaGraph({ tables }: { tables: TableSchema[] }) {
  const layout = useMemo(() => buildSchemaGraphLayout(tables), [tables])
  const tableByName = useMemo(() => new Map(tables.map((table) => [table.name, table])), [tables])
  const relatedColumnSource = useMemo(() => {
    const sources = new Map<string, 'declared' | 'inferred'>()
    for (const edge of layout.edges) {
      const key = `${edge.fromTable}.${edge.fromColumn}`
      const current = sources.get(key)
      if (current === 'declared') continue
      sources.set(key, edge.source)
    }
    return sources
  }, [layout.edges])

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--paper)]">
      <div
        className="relative"
        style={{ width: layout.width, height: layout.height }}
      >
        <svg
          className="absolute inset-0 pointer-events-none"
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          aria-hidden="true"
        >
          <defs>
            <marker
              id="schema-arrow"
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)" />
            </marker>
          </defs>
          {layout.edges.map((edge) => {
            const sameTable = edge.fromTable === edge.toTable
            const path = sameTable
              ? `M ${edge.startX} ${edge.startY} C ${edge.startX + 72} ${edge.startY}, ${edge.endX + 72} ${edge.endY}, ${edge.endX} ${edge.endY}`
              : `M ${edge.startX} ${edge.startY} C ${edge.startX} ${edge.labelY}, ${edge.endX} ${edge.labelY}, ${edge.endX} ${edge.endY}`
            return (
              <g key={edge.key}>
                <path
                  d={path}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="1.5"
                  strokeOpacity="0.7"
                  strokeDasharray={edge.source === 'inferred' ? '6 5' : undefined}
                  markerEnd="url(#schema-arrow)"
                />
                <text
                  x={edge.labelX}
                  y={edge.labelY}
                  textAnchor="middle"
                  className="fill-[var(--muted)] text-[10px] font-mono"
                >
                  {edge.fromColumn} {'->'} {edge.toColumn}
                </text>
              </g>
            )
          })}
        </svg>

        {layout.nodes.map((node) => {
          const table = tableByName.get(node.name)
          if (!table) return null
          return (
            <div
              key={node.name}
              className="absolute overflow-hidden rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] shadow-sm"
              style={{ left: node.x, top: node.y, width: node.width, minHeight: node.height }}
            >
              <div className="border-b border-[var(--line)] bg-[var(--ink)] px-3 py-2">
                <span className="block truncate font-mono text-sm font-semibold text-[var(--paper)]">
                  {table.name}
                </span>
              </div>
              <div className="divide-y divide-[var(--line)]">
                {table.columns.slice(0, 8).map((column) => {
                  const relatedSource = relatedColumnSource.get(`${table.name}.${column.name}`)
                  return (
                    <div key={column.name} className="flex min-h-6 items-center gap-2 px-3 py-1 text-xs">
                      <span className="min-w-0 flex-1 truncate font-mono text-[var(--ink)]">
                        {column.name}
                      </span>
                      {column.primaryKeyPosition > 0 && <SchemaBadge label="PK" />}
                      {relatedSource === 'declared' && <SchemaBadge label="FK" />}
                      {relatedSource === 'inferred' && <SchemaBadge label="REL" />}
                      <span className="max-w-20 truncate font-mono text-[var(--muted)]">
                        {column.type || 'ANY'}
                      </span>
                    </div>
                  )
                })}
                {table.columns.length > 8 && (
                  <div className="px-3 py-1 text-xs text-[var(--muted)]">
                    +{table.columns.length - 8} more column{table.columns.length - 8 === 1 ? '' : 's'}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SchemaBadge({ label }: { label: string }) {
  return (
    <span className="rounded border border-[var(--line-strong)] px-1 py-0.5 text-[10px] font-semibold leading-none text-[var(--muted)]">
      {label}
    </span>
  )
}

function CreateTableStatements({ tables }: { tables: TableSchema[] }) {
  return (
    <details className="rounded-lg border border-[var(--line)] bg-[var(--paper)]">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        CREATE TABLE statements
      </summary>
      <div className="space-y-3 border-t border-[var(--line)] p-3">
        {tables.map((table) => (
          <div key={table.name} className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
            <div className="border-b border-[var(--line)] px-3 py-2">
              <span className="font-mono text-sm font-semibold text-[var(--ink)]">{table.name}</span>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs text-[var(--ink)]">
              {table.sql}
            </pre>
          </div>
        ))}
      </div>
    </details>
  )
}
