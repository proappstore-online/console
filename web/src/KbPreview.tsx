import { useState, useEffect, useCallback } from 'react'
import { Markdown } from './Markdown'
import { api } from './agents/lib'

interface KbShare { id: string; accessType: string; label: string | null; viewCount: number; createdAt: number }

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
  const [loadError, setLoadError] = useState<string | null>(null)
  // 'docs' = live markdown render (updates as the Architect writes, pre-publish);
  // 'site' = iframe of the real published Zensical site (exactly what visitors see).
  const [view, setView] = useState<'docs' | 'site'>('docs')
  const [selected, setSelected] = useState<string>('KNOWLEDGE.md')
  const [content, setContent] = useState<string>('')
  // The doc that `content` currently belongs to. When it differs from `selected`
  // (a fresh click), we show a loading state instead of the previous doc's body.
  const [loadedPath, setLoadedPath] = useState<string | null>(null)
  // Share link management
  const [showShare, setShowShare] = useState(false)
  const [shares, setShares] = useState<KbShare[]>([])
  const [shareLoading, setShareLoading] = useState(false)
  const [shareLabel, setShareLabel] = useState('')
  const [shareCreated, setShareCreated] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)

  const loadList = useCallback(async () => {
    if (!token) return
    try {
      const r = await api(`/projects/${appId}/files`, token) as { files: KbFile[] }
      const kb = r.files.filter(f => isKbFile(f.path)).sort(sortKb)
      setFiles(kb)
      setLoadError(null)
      // If the current selection vanished (or none yet), fall back to the first KB doc.
      setSelected(prev => kb.some(f => f.path === prev) ? prev : (kb[0]?.path ?? 'KNOWLEDGE.md'))
    } catch (err) {
      // Record the error and DON'T wipe a KB we've already shown — a transient
      // fetch failure must not falsely display "No Knowledge Base yet".
      setLoadError((err as Error).message)
      setFiles(prev => prev ?? [])
    }
  }, [token, appId])

  const loadDoc = useCallback(async (path: string, isStale: () => boolean) => {
    if (!token) return
    try {
      const r = await api(`/projects/${appId}/files/content?path=${encodeURIComponent(path)}`, token) as { content: string }
      if (isStale()) return // user switched docs / unmounted while this was in flight
      setContent(r.content); setLoadedPath(path)
    } catch (err) {
      if (isStale()) return
      setContent(`Could not load ${path}: ${(err as Error).message}`); setLoadedPath(path)
    }
  }, [token, appId])

  // (Re)load the file list on mount, and whenever the repo changes (version bump).
  useEffect(() => { loadList() }, [loadList, version])

  // Load the selected doc's content; re-load it on every version bump too, so the
  // open doc updates live as the Architect rewrites it. The cancelled flag drops
  // a stale/in-flight fetch when the user switches docs (or the component unmounts),
  // so a slow earlier request can't clobber a newer one or set state after unmount.
  useEffect(() => {
    if (!selected) return
    let cancelled = false
    loadDoc(selected, () => cancelled)
    return () => { cancelled = true }
  }, [selected, version, loadDoc])

  const hasKb = (files?.length ?? 0) > 0

  // Load share links when panel opens
  useEffect(() => {
    if (!showShare || !token) return
    setShareLoading(true)
    api(`/projects/${appId}/shares`, token)
      .then((r) => setShares((r as { shares: KbShare[] }).shares))
      .catch(() => {})
      .finally(() => setShareLoading(false))
  }, [showShare, token, appId])

  const createShare = async () => {
    if (!token) return
    setShareError(null)
    try {
      const r = await api(`/projects/${appId}/shares`, token, {
        method: 'POST', body: { accessType: 'open', label: shareLabel || undefined },
      }) as { id: string; url: string }
      setShareCreated(r.url)
      setShareLabel('')
      // Refresh list
      const list = await api(`/projects/${appId}/shares`, token) as { shares: KbShare[] }
      setShares(list.shares)
    } catch (e) { setShareError((e as Error).message) }
  }

  const revokeShare = async (shareId: string) => {
    if (!token) return
    try {
      await api(`/projects/${appId}/shares/${shareId}`, token, { method: 'DELETE' })
      setShares((prev) => prev.filter((s) => s.id !== shareId))
    } catch { /* */ }
  }
  const architectWorking = working?.role === 'Architect'

  // Poll ONLY while the Architect is actively writing — to catch its live writes.
  // When idle, the KB is static, so we don't background-poll: the `files-synced`
  // WS push (version bump) and the manual Refresh button cover any later change.
  useEffect(() => {
    if (!architectWorking) return
    const id = setInterval(() => { if (!document.hidden) loadList() }, 4000)
    return () => clearInterval(id)
  }, [architectWorking, loadList])

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
          {/* Docs/Site toggle removed — KB is private, no public site. Share links serve content directly. */}
          <button type="button" onClick={loadList}
            className="text-[10px] text-[var(--muted)] hover:text-[var(--ink)] px-1.5 py-0.5 rounded border border-[var(--line)] hover:border-[var(--accent)]"
            title="Refresh the Knowledge Base from the repo">
            Refresh
          </button>
          {hasKb && (
            <button type="button" onClick={() => setShowShare(!showShare)}
              className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors ${showShare ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--accent)]'}`}
              title="Create a share link for this Knowledge Base">
              Share
            </button>
          )}
          {!hasKb && (
            <button type="button" onClick={onBuildKb} disabled={building}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 hover:bg-teal-200 disabled:opacity-50 transition-colors"
              title="Have the Architect research the app + write the Knowledge Base. Brainstorm in chat first; if a build looks stuck, this retries it.">
              {building ? 'Starting…' : kbStarted ? '↻ Retry' : '📖 Build KB'}
            </button>
          )}
        </div>
      </div>

      {/* Share panel */}
      {showShare && (
        <div className="border-b border-[var(--line)] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input type="text" value={shareLabel} onChange={(e) => setShareLabel(e.target.value)}
              placeholder="Label (optional, e.g. 'For investors')"
              aria-label="Share link label"
              className="flex-1 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1.5 text-xs" />
            <button type="button" onClick={createShare}
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
              Create link
            </button>
          </div>
          {shareCreated && (
            <div className="rounded-lg bg-[var(--success)]/10 p-2 flex items-center gap-2">
              <input type="text" readOnly value={shareCreated}
                className="flex-1 text-xs font-mono bg-transparent border-none outline-none text-[var(--ink)]"
                onFocus={(e) => e.target.select()} />
              <button type="button" onClick={() => { navigator.clipboard.writeText(shareCreated); }}
                className="text-[10px] font-semibold text-[var(--accent)] hover:underline">Copy</button>
            </div>
          )}
          {shareError && <p className="text-xs text-[var(--error)]">{shareError}</p>}
          {shareLoading && <p className="text-xs text-[var(--muted)]">Loading shares...</p>}
          {!shareLoading && shares.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-[var(--muted)] uppercase tracking-wide font-semibold">Active links</p>
              {shares.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs py-1 border-b border-[var(--line)] last:border-0">
                  <div className="min-w-0">
                    <span className="font-mono text-[var(--ink)]">.../{s.id}</span>
                    {s.label && <span className="text-[var(--muted)] ml-2">{s.label}</span>}
                    <span className="text-[var(--muted)] ml-2">{s.viewCount} views</span>
                  </div>
                  <button type="button" onClick={() => revokeShare(s.id)}
                    className="text-[10px] text-[var(--error)] hover:underline flex-shrink-0 ml-2">Revoke</button>
                </div>
              ))}
            </div>
          )}
          {!shareLoading && shares.length === 0 && (
            <p className="text-xs text-[var(--muted)]">No share links yet. Create one above.</p>
          )}
        </div>
      )}

      {!hasKb ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
          <span className="text-3xl">{loadError ? '⚠️' : '📖'}</span>
          <p className="text-sm text-[var(--ink)] font-semibold">{loadError ? "Couldn't load the Knowledge Base" : 'No Knowledge Base yet'}</p>
          {loadError && (
            <p className="text-xs text-[var(--error)] max-w-sm">
              {loadError}. If you just signed in, sign out and back in, then hard-refresh. The KB may already exist — this is a load error, not an empty KB.
            </p>
          )}
          <p className="text-xs text-[var(--muted)] max-w-sm">
            {kbStarted
              ? 'The Architect is researching your app and writing KNOWLEDGE.md + docs/ — this panel updates live as it writes. If nothing appears after a minute, press Retry to re-run it.'
              : 'Brainstorm what you want in the chat, then press 📖 Build KB. The Architect will research the app and write its KNOWLEDGE.md + docs/ — the source of truth the rest of the team builds from.'}
          </p>
          <button type="button" onClick={onBuildKb} disabled={building}
            className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 hover:bg-teal-200 disabled:opacity-50 transition-colors">
            {building ? 'Starting…' : kbStarted ? '↻ Retry — run the Architect' : '📖 Build the Knowledge Base'}
          </button>
        </div>
      ) : view === 'site' ? (
        // The real published Zensical site — exactly what a visitor sees (branding,
        // theme, dark-mode toggle). Reflects the LAST publish, not in-flight edits;
        // switch to Docs for the live view while the Architect is writing.
        <iframe
          src={`https://kb.proappstore.online/${appId}/`}
          title="Published Knowledge Base site"
          className="flex-1 min-h-0 w-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
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
            {selected !== loadedPath
              ? <p className="text-xs text-[var(--muted)]">Loading…</p>
              : <div className="text-sm"><Markdown>{content}</Markdown></div>}
          </div>
        </div>
      )}
    </div>
  )
}
