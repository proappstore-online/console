import { useMemo } from 'react'
import { highlightCode } from './highlight-langs'

/** Syntax-highlighted, read-only code view (selectable text). */
export function CodeView({ code, path }: { code: string; path: string }) {
  const ext = path.split('.').pop()
  const html = useMemo(() => highlightCode(code, ext), [code, ext])
  return (
    <pre className="text-[11px] leading-relaxed p-4 font-mono whitespace-pre">
      <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  )
}
