import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Renders agent/chat/ticket text as GitHub-flavored Markdown (tables, code
 * fences, lists, headings). Styling lives in `.md` in index.css so it themes
 * with the rest of the console. `compact` trims vertical rhythm for chat bubbles.
 */
export function Markdown({ children, compact }: { children: string; compact?: boolean }) {
  return (
    <div className={compact ? 'md md-compact' : 'md'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Open links in a new tab, safely.
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
