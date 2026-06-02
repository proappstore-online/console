import { formatCellValue } from './dbBrowserHelpers'

// ---------------------------------------------------------------------------
// Shared results table
// ---------------------------------------------------------------------------

export function ResultsTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--line)] bg-[var(--panel)]">
            {columns.map((col) => (
              <th
                key={col}
                className="px-3 py-2 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--panel-hover)]"
            >
              {columns.map((col) => (
                <td
                  key={col}
                  className={`px-3 py-2 font-mono text-xs whitespace-nowrap max-w-[300px] truncate ${
                    row[col] === null || row[col] === undefined
                      ? 'text-[var(--muted)] italic'
                      : 'text-[var(--ink)]'
                  }`}
                  title={formatCellValue(row[col])}
                >
                  {formatCellValue(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
