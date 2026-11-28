/**
 * The console's one table (console#27): a real table from the `sm` breakpoint
 * up, sized to its container — long values wrap, a fixed layout truncates —
 * and below it each row as a stacked card of label/value pairs, so no page
 * ever scrolls sideways. The table keeps table semantics (a name, column
 * headers); the cards are a list with the same name, each value
 * labelled by its column.
 */

import { useSyncExternalStore, type HTMLAttributes, type ReactNode } from 'react'
import { InlineCopy } from './agents/components'

export interface ResponsiveColumn<T> {
  key: string
  /** The column header; also the card label unless `label` says otherwise. */
  header: ReactNode
  /** The card label, when the header is not plain text. '' renders the value without a label (e.g. row actions). */
  label?: string
  cell: (row: T, index: number) => ReactNode
  /** Extra classes for this column's header and cells on the table (e.g. text-right, whitespace-nowrap). */
  className?: string
  /** This column's cells head their rows (`<th scope="row">`) on the table. */
  rowHeader?: boolean
}

const WIDE = '(min-width: 640px)' // Tailwind's `sm`

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(WIDE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
// Without matchMedia (no layout, e.g. jsdom) the table is the default.
const wideNow = () => typeof window === 'undefined' || typeof window.matchMedia !== 'function' || window.matchMedia(WIDE).matches

/** True from the `sm` breakpoint up. */
export function useWideScreen(): boolean {
  return useSyncExternalStore(subscribe, wideNow, () => true)
}

export function ResponsiveTable<T>({ caption, columns, rows, rowKey, rowProps, foot, fixed = false, className = 'text-sm', headClassName = 'text-xs uppercase tracking-wide text-[var(--muted)]' }: {
  /** The accessible name of the table and of the card list. */
  caption: string
  columns: ResponsiveColumn<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string | number
  /** Extra props for a row (table row or card): click handlers, highlight classes. */
  rowProps?: (row: T, index: number) => HTMLAttributes<HTMLElement>
  /** A totals row, one cell per column: the table's footer, or a last card. */
  foot?: ReactNode[]
  /** A fixed table layout: columns share the width evenly and long cell content truncates instead of widening its column. */
  fixed?: boolean
  /** Text size and colour of the table and cards. */
  className?: string
  /** Classes for the header row. */
  headClassName?: string
}) {
  const wide = useWideScreen()

  if (!wide) {
    return (
      <ul aria-label={caption} className={`space-y-2 ${className}`}>
        {rows.map((row, i) => {
          const extra = rowProps?.(row, i) ?? {}
          return (
            <li key={rowKey(row, i)} {...extra} className={`min-w-0 rounded-xl border border-[var(--line)] p-3 ${extra.className ?? ''}`}>
              <Fields columns={columns} cells={columns.map((col) => col.cell(row, i))} />
            </li>
          )
        })}
        {foot && (
          <li className="min-w-0 rounded-xl border border-[var(--line-strong)] p-3 font-semibold">
            <Fields columns={columns} cells={foot} />
          </li>
        )}
      </ul>
    )
  }

  return (
    <table aria-label={caption} className={`w-full ${fixed ? 'table-fixed' : ''} ${className}`}>
      <thead>
        <tr className={`text-left ${headClassName}`}>
          {columns.map((col) => (
            <th key={col.key} scope="col" className={`py-2 pr-4 last:pr-0 font-semibold ${fixed ? 'truncate' : ''} ${col.className ?? ''}`}>{col.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const extra = rowProps?.(row, i) ?? {}
          return (
            <tr key={rowKey(row, i)} {...extra} className={`border-t border-[var(--line)] align-top ${extra.className ?? ''}`}>
              {columns.map((col) => {
                const cls = `py-2 pr-4 last:pr-0 ${fixed ? 'truncate' : 'wrap-anywhere'} ${col.className ?? ''}`
                return col.rowHeader
                  ? <th key={col.key} scope="row" className={`text-left font-normal ${cls}`}>{col.cell(row, i)}</th>
                  : <td key={col.key} className={cls}>{col.cell(row, i)}</td>
              })}
            </tr>
          )
        })}
      </tbody>
      {foot && (
        <tfoot>
          <tr className="border-t border-[var(--line-strong)] align-top font-semibold">
            {foot.map((c, k) => <td key={columns[k]?.key ?? k} className={`py-2 pr-4 last:pr-0 wrap-anywhere ${columns[k]?.className ?? ''}`}>{c}</td>)}
          </tr>
        </tfoot>
      )}
    </table>
  )
}

/** One card's label/value pairs; a column without a label (row actions) spans the card. */
function Fields<T>({ columns, cells }: { columns: ResponsiveColumn<T>[]; cells: ReactNode[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-1">
      {columns.map((col, k) => {
        const label = col.label ?? (typeof col.header === 'string' ? col.header : '')
        return label
          ? (
            <div key={col.key} className="contents">
              <dt className="text-xs font-semibold text-[var(--muted)]">{label}</dt>
              <dd className="min-w-0 wrap-anywhere">{cells[k]}</dd>
            </div>
          )
          : <div key={col.key} className="col-span-2 min-w-0 wrap-anywhere">{cells[k]}</div>
      })}
    </dl>
  )
}

/** A long id shown on one line: truncated to fit, the full value in its title, with a Copy control. */
export function TruncatedId({ value, label = 'id' }: { value: string; label?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate font-mono" title={value}>{value}</span>
      <span className="shrink-0"><InlineCopy text={value} title={`Copy ${label}`} /></span>
    </span>
  )
}
