/**
 * Publishing panel (Settings → Publishing). The at-a-glance "where does this app
 * live" surface: its live URL, GitHub repo, CI/deploys, and data API — each with
 * copy + open. Pairs with DomainsSection (custom domains) under the same sub-tab.
 * All URLs are derived from the app id (the platform's fixed conventions), so no
 * extra backend call is needed.
 */

const GH_ORG = 'proappstore-online'

function CopyOpen({ url, openable = true }: { url: string; openable?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <button type="button" onClick={() => navigator.clipboard?.writeText(url)} title="Copy"
        className="text-[11px] text-[var(--muted)] hover:text-[var(--ink)] px-2 py-0.5 rounded border border-[var(--line)] hover:border-[var(--accent)]">
        Copy
      </button>
      {openable && (
        <a href={url} target="_blank" rel="noopener noreferrer" title="Open"
          className="text-[11px] text-[var(--muted)] hover:text-[var(--ink)] px-2 py-0.5 rounded border border-[var(--line)] hover:border-[var(--accent)]">
          Open ↗
        </a>
      )}
    </div>
  )
}

function Row({ label, url, hint, openable }: { label: string; url: string; hint?: string; openable?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-[var(--line)] last:border-0">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-[var(--ink)]">{label}</div>
        <div className="text-[11px] text-[var(--muted)] font-mono truncate">{url}</div>
        {hint && <div className="text-[11px] text-[var(--muted)]">{hint}</div>}
      </div>
      <CopyOpen url={url} openable={openable} />
    </div>
  )
}

export function AppPublishing({ appId }: { appId: string }) {
  const live = `https://${appId}.proappstore.online`
  const repo = `https://github.com/${GH_ORG}/${appId}`
  const actions = `${repo}/actions`
  const dataApi = `https://data-${appId}.proappstore.online`

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">Publishing</h3>
      <p className="text-xs text-[var(--muted)] mb-3">
        Where {appId} is published. Every push to the repo's main branch auto-deploys via GitHub Actions.
      </p>
      <div className="rounded-xl border border-[var(--line)] px-3">
        <Row label="Live site" url={live} />
        <Row label="GitHub repo" url={repo} />
        <Row label="Deploys (CI)" url={actions} hint="GitHub Actions — build + deploy status per commit" />
        <Row label="Data API" url={dataApi} hint="Per-app D1 endpoint (app.db). Auth required." openable={false} />
      </div>
    </div>
  )
}
