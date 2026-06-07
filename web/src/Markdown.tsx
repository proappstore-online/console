import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import rehypeRaw from 'rehype-raw'
import { highlightCode } from './highlight-langs'

/**
 * Renders markdown as GitHub-flavored HTML with:
 * - GFM tables, strikethrough, task lists
 * - Syntax-highlighted fenced code blocks
 * - Raw HTML pass-through (for KB wireframes, diagrams, etc.)
 * - YAML frontmatter stripping (KB files have Jekyll-style frontmatter)
 *
 * The `{::nomarkdown}` / `{: .class}` Zensical/Jekyll directives are stripped
 * before rendering since they're not standard markdown.
 *
 * Styling lives in `.md` / `.hljs` in index.css.
 */

function stripDirectives(md: string): string {
  return md
    .replace(/\{::nomarkdown\}/g, '')
    .replace(/\{:\/nomarkdown\}/g, '')
    .replace(/\{:[\s.][^}]*\}/g, '') // {: .class .class} attribute lists
}

export function Markdown({ children, compact }: { children: string; compact?: boolean }) {
  return (
    <div className={compact ? 'md md-compact' : 'md'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkFrontmatter]}
        rehypePlugins={[rehypeRaw]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          code({ node: _node, className, children, ...props }) {
            const lang = /language-(\w+)/.exec(className ?? '')?.[1]
            const text = String(children ?? '')
            if (!lang) return <code className={className} {...props}>{children}</code>
            return <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightCode(text.replace(/\n$/, ''), lang) }} />
          },
        }}
      >
        {stripDirectives(children)}
      </ReactMarkdown>
    </div>
  )
}
