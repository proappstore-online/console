import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { highlightCode } from './highlight-langs'

/**
 * Renders agent/chat/ticket text as GitHub-flavored Markdown (tables, code
 * fences, lists, headings) with syntax-highlighted fenced code. Styling lives in
 * `.md` / `.hljs` in index.css so it themes with the rest of the console.
 * `compact` trims vertical rhythm for chat bubbles.
 */
export function Markdown({ children, compact }: { children: string; compact?: boolean }) {
  return (
    <div className={compact ? 'md md-compact' : 'md'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          code({ node: _node, className, children, ...props }) {
            // Fenced blocks carry a `language-xxx` class; inline code does not.
            const lang = /language-(\w+)/.exec(className ?? '')?.[1]
            const text = String(children ?? '')
            if (!lang) return <code className={className} {...props}>{children}</code>
            return <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightCode(text.replace(/\n$/, ''), lang) }} />
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
