import { useState, useEffect, useCallback, useRef } from 'react'
import { Markdown } from './Markdown'
import { api } from './agents/lib'

// Live Knowledge Base preview for the Research tab. Shows the Architect's
// KNOWLEDGE.md + docs/*.md rendered as markdown, GitHub/Copilot-style — a file
// rail on the left, the rendered doc on the right — and refreshes itself as the
// Architect writes (driven by the `version` bump from `files-synced` WS events,
// plus a slow poll as a safety net). No literal iframe: the docs aren't served
// as HTML anywhere, so we render the repo markdown directly.

interface KbFile { path: string; size: number }

// A file belongs to the KB if it's the root KNOWLEDGE.md or a markdown doc under docs/.
function isKbFile(path: string): boolean {
  if (path === 'KNOWLEDGE.md') return true
  return /^docs\/.+\.(md|markdown)$/i.test(path)
}

// Sort: KNOWLEDGE.md first, then docs/ alphabetically.
function sortKb(a: KbFile, b: KbFile): number {
  if (a.path === 'KNOWLEDGE.md') return -1
  if (b.path === 'KNOWLEDGE.md') return 1
  return a.path.localeCompare(b.path)
}

const prettyName = (path: string) =>
  path === 'KNOWLEDGE.md' ? 'KNOWLEDGE.md' : path.replace(/^docs\//, '').replace(/\.(md|markdown)$/i, '')

export function KbPreview({
  appId, token, version, kbStarted, building, onBuildKb, working,
}: {
  appId: string
  token: string | null
  /** Bumped by the parent on `files-synced` WS events to trigger a live refetch. */
  version: number
  /** True once a research ticket exists (the Architect has been asked to build the KB). */
  kbStarted: boolean
  building: boolean
  onBuildKb: () => void
  /** The live "agent working" signal from the parent, so we can show "Architect writing…". */
  working: { role: string; at: number } | null
}) {
  const [files, setFiles] = useState<KbFile[] | null>(null)
  const [selected, setSelected] = useState<string>('KNOWLEDGE.md')
  const [content, setContent] = useState<string>('')
  const [loadingDoc, setLoadingDoc] = useState(false)
  // Keep the latest selection in a ref so the content-load effect can read it
  // without re-subscribing every time the user clicks a different doc.
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  const loadList = useCallback(async () => {
    if (!token) return
    try {
      const r = await api(`/projects/${appId}/files`, token) as { files: KbFile[] }
      const kb = r.files.filter(f => isKbFile(f.path)).sort(sortKb)
      setFiles(kb)
      // If the current selection vanished (or none yet), fall back to the first KB doc.
      setSelected(prev => kb.some(f => f.path === prev) ? prev : (kb[0]?.path ?? 'KNOWLEDGE.md'))
    } catch { setFiles([]) }
  }, [token, appId])

  const loadDoc = useCallback(async (path: string) => {
    if (!token) return
    setLoadingDoc(true)
    try {
      const r = await api(`/projects/${appId}/files/content?path=${encodeURIComponent(path)}`, token) as { content: string }
      // Only apply if the user hasn't switched docs while this was in flight.
      if (selectedRef.current === path) setContent(r.content)
    } catch (err) {
      if (selectedRef.current === path) setContent(`Could not load ${path}: ${(err as Error).message}`)
    }
    setLoadingDoc(false)
  }, [token, appId])

  // (Re)load the file list on mount, and whenever the repo changes (version bump).
  useEffect(() => { loadList() }, [loadList, version])

  // Load the selected doc's content; re-load it on every version bump too, so the
  // open doc updates live as the Architect rewrites it.
  useEffect(() => { if (selected) loadDoc(selected) }, [selected, version, loadDoc])

  // Slow poll as a safety net (WS push is the instant path). Paused when hidden.
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) loadList() }, 6000)
    return () => clearInterval(id)
  }, [loadList])

  const hasKb = (files?.length ?? 0) > 0
  const architectWorking = working?.role === 'Architect'

  return (
    <div className="flex-1 flex flex-col min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--line)] flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-500 flex-shrink-0"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
          <h3 className="text-sm font-bold text-[var(--ink)]">Knowledge Base</h3>
          {architectWorking && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-teal-600 dark:text-teal-400" title="The Architect is writing the Knowledge Base right now">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-500 opacity-60"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
              </span>
              Architect writing…
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={loadList}
            className="text-[10px] text-[var(--muted)] hover:text-[var(--ink)] px-1.5 py-0.5 rounded border border-[var(--line)] hover:border-[var(--accent)]"
            title="Refresh the Knowledge Base from the repo">
            Refresh
          </button>
          {!kbStarted && (
            <button type="button" onClick={onBuildKb} disabled={building}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 hover:bg-teal-200 disabled:opacity-50 transition-colors"
              title="Have the Architect research the app + write the Knowledge Base (once). Brainstorm in chat first; building starts when you ask the PO to build.">
              {building ? 'Starting…' : '📖 Build KB'}
            </button>
          )}
        </div>
      </div>

      {!hasKb ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
          <span className="text-3xl">📖</span>
          <p className="text-sm text-[var(--ink)] font-semibold">No Knowledge Base yet</p>
          <p className="text-xs text-[var(--muted)] max-w-sm">
            {kbStarted
              ? 'The Architect is researching your app and writing KNOWLEDGE.md + docs/. This panel updates live as it writes.'
              : 'Brainstorm what you want in the chat, then press 📖 Build KB. The Architect will research the app and write its KNOWLEDGE.md + docs/ — the source of truth the rest of the team builds from.'}
          </p>
          {!kbStarted && (
            <button type="button" onClick={onBuildKb} disabled={building}
              className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 hover:bg-teal-200 disabled:opacity-50 transition-colors">
              {building ? 'Starting…' : '📖 Build the Knowledge Base'}
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* File rail */}
          <div className="w-44 flex-shrink-0 border-r border-[var(--line)] overflow-y-auto py-1">
            {files!.map(f => (
              <button key={f.path} type="button" onClick={() => setSelected(f.path)}
                className={`flex items-center gap-1.5 w-full px-3 py-1.5 text-left text-xs transition-colors ${
                  selected === f.path ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-semibold' : 'text-[var(--ink)] hover:bg-[var(--panel-hover)]'
                }`} title={f.path}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 opacity-60"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                <span className="truncate">{prettyName(f.path)}</span>
              </button>
            ))}
          </div>
          {/* Rendered doc */}
          <div className="flex-1 overflow-y-auto min-h-0 p-5">
            {loadingDoc && !content
              ? <p className="text-xs text-[var(--muted)]">Loading…</p>
              : <div className="text-sm"><Markdown>{content}</Markdown></div>}
          </div>
        </div>
      )}
    </div>
  )
}
