import { formatViewCount } from "./analytics"

export function RankedList({
  title,
  rows,
  onPick,
}: {
  title: string
  rows: Array<{ label: string; value: number }>
  /** When provided, each row becomes a button that calls onPick(label).
   *  Used by the Top pages list to drill into a specific path. */
  onPick?: (label: string) => void
}) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  const renderRow = (r: { label: string; value: number }, i: number) => {
    const inner = (
      <>
        <div className="flex justify-between mb-0.5">
          <span className="text-[var(--ink)] truncate">{r.label}</span>
          <span className="text-[var(--muted)] tabular-nums">{formatViewCount(r.value)}</span>
        </div>
        <div className="h-1 bg-[var(--line)] rounded overflow-hidden">
          <div className="h-1 bg-[var(--accent)]" style={{ width: `${(r.value / max) * 100}%` }} />
        </div>
      </>
    )
    return (
      <li key={i} className="text-xs">
        {onPick ? (
          <button type="button"
            onClick={() => onPick(r.label)}
            className="w-full text-left rounded px-1.5 py-1 -mx-1.5 hover:bg-[var(--panel)] transition-colors"
            title={`Drill into ${r.label}`}
          >
            {inner}
          </button>
        ) : (
          inner
        )}
      </li>
    )
  }
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
        {title}
      </h4>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">No data.</p>
      ) : (
        <ul className="space-y-1">{rows.slice(0, 5).map(renderRow)}</ul>
      )}
    </div>
  )
}
