import { formatCellValue } from './dbBrowserHelpers'
import { ResponsiveTable } from './ResponsiveTable'

// ---------------------------------------------------------------------------
// Shared results table: columns share the width, long values truncate with the
// full value in their title (console#27).
// ---------------------------------------------------------------------------

export function ResultsTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] p-2">
      <ResponsiveTable<Record<string, unknown>> caption="Query results" fixed rows={rows} rowKey={(row, rowIdx) => (row[0] != null ? String(row[0]) : rowIdx)}
        className="text-sm" headClassName="text-xs uppercase tracking-wide text-[var(--muted)]"
        rowProps={() => ({ className: 'hover:bg-[var(--panel-hover)]' })}
        columns={columns.map((col) => ({
          key: col,
          header: <span title={col}>{col}</span>,
          label: col,
          cell: (row) => (
            <span title={formatCellValue(row[col])}
              className={`font-mono text-xs ${row[col] === null || row[col] === undefined ? 'text-[var(--muted)] italic' : 'text-[var(--ink)]'}`}>
              {formatCellValue(row[col])}
            </span>
          ),
        }))} />
    </div>
  )
}
