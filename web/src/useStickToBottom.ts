import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/**
 * Chat/log scroll behavior, the way good chat UIs do it:
 * - If the user is at the bottom, new items auto-scroll into view.
 * - If the user has scrolled up to read history, DON'T yank them down — instead
 *   count how many new items arrived and surface a "↓ N new" pill they can click
 *   to jump back to the bottom.
 *
 * `count` is the total number of items in the list. Wire `ref` to the scroll
 * container and `onScroll` to its onScroll. Render the pill when `unseen > 0`.
 */
export function useStickToBottom(count: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(true)
  const [unseen, setUnseen] = useState(0)
  const prevCount = useRef(count)

  const onScroll = useCallback(() => {
    const el = ref.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    setStuck(atBottom)
    if (atBottom) setUnseen(0)
  }, [])

  const jumpToBottom = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    setUnseen(0)
    setStuck(true)
  }, [])

  useLayoutEffect(() => {
    const el = ref.current
    const added = count - prevCount.current
    prevCount.current = count
    if (!el || added <= 0) return
    if (stuck) el.scrollTop = el.scrollHeight
    else setUnseen((u) => u + added)
  }, [count, stuck])

  return { ref, onScroll, unseen, jumpToBottom, stuck }
}
