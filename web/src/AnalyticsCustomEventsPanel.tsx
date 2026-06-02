import { formatViewCount, type EventKindSummary } from "./analytics"

/**
 * Lists custom event kinds (anything except 'pageview') sorted by count.
 * Empty state explains how to fire one — most creators don't realise the
 * SDK exposes window.pasAnalytics.event() until they're told.
 */
export function CustomEventsPanel({
  events,
  days,
  onPickKind,
}: {
  events: EventKindSummary[]
  days: number
  onPickKind: (kind: string) => void
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
        Custom events
      </h4>
      {events.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">
          No custom events fired in the last {days} days. Fire one from your app code:
          <code className="block mt-1 px-2 py-1 bg-[var(--panel)] rounded text-[10px] font-mono">
            window.pasAnalytics.event('purchase', {`{ amount: 999 }`})
          </code>
        </p>
      ) : (
        <ul className="space-y-1">
          {events.map((e) => (
            <li key={e.kind}>
              <button type="button"
                onClick={() => onPickKind(e.kind)}
                className="w-full text-left rounded px-2 py-1.5 hover:bg-[var(--panel)] transition-colors flex items-baseline justify-between"
              >
                <span className="font-mono text-sm text-[var(--ink)]">{e.kind}</span>
                <span className="text-xs text-[var(--muted)] tabular-nums">{formatViewCount(e.count)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
