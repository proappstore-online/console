import { useCallback, useState } from 'react'

/**
 * A "show the latest N, reveal older in steps" window for an unbounded list
 * (chat, activity, ticket messages, files). Render `list.slice(-limit)` (or
 * `.slice(0, limit)`), show a "load more" button when the list is longer than
 * `limit`, and wire it to `more`. `reset` snaps back to the first window (e.g.
 * when switching to a different ticket).
 */
export function useWindowedLimit(step: number) {
  const [limit, setLimit] = useState(step)
  const more = useCallback(() => setLimit((l) => l + step), [step])
  const reset = useCallback(() => setLimit(step), [step])
  return { limit, more, reset }
}
