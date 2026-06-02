import { useState, useEffect } from "react"
import { updateAnalyticsConfig, type AnalyticsConfig } from "./analytics"
import type { SaveState } from "./AppDetailSections"

export function AnalyticsConfigForm({
  appId,
  config,
  onSaved,
  getToken,
}: {
  appId: string
  config: AnalyticsConfig | null
  onSaved: (c: AnalyticsConfig) => void
  getToken: () => string | null
}) {
  const [ga4, setGa4] = useState(config?.ga4 ?? '')
  const [plausible, setPlausible] = useState(config?.plausible ?? '')
  const [customHead, setCustomHead] = useState(config?.customHead ?? '')
  const [state, setState] = useState<SaveState>('idle')

  useEffect(() => {
    setGa4(config?.ga4 ?? '')
    setPlausible(config?.plausible ?? '')
    setCustomHead(config?.customHead ?? '')
  }, [config])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = getToken()
    if (!token) return
    setState('saving')
    try {
      const fresh = await updateAnalyticsConfig(token, appId, {
        ga4: ga4.trim() || null,
        plausible: plausible.trim() || null,
        custom_head: customHead.trim() || null,
      })
      onSaved(fresh)
      setState('saved')
      setTimeout(() => setState('idle'), 2000)
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : 'failed' })
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
        Add your own tags (optional)
      </h4>
      <p className="text-xs text-[var(--muted)]">
        Wire Google Analytics, Plausible, or a custom &lt;head&gt; snippet on top of the
        cookieless first-party tracking already in place. The platform CF Web Analytics token
        {config?.cfBeaconToken ? ' is active' : ' will be auto-provisioned at next publish'}.
      </p>
      <label className="block">
        <span className="text-xs text-[var(--muted)]">Google Analytics 4 ID</span>
        <input
          type="text"
          placeholder="G-XXXXXXXXXX"
          value={ga4}
          onChange={(e) => setGa4(e.target.value)}
          className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] placeholder-[var(--muted)]"
        />
      </label>
      <label className="block">
        <span className="text-xs text-[var(--muted)]">Plausible domain</span>
        <input
          type="text"
          placeholder="mysite.com"
          value={plausible}
          onChange={(e) => setPlausible(e.target.value)}
          className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] placeholder-[var(--muted)]"
        />
      </label>
      <label className="block">
        <span className="text-xs text-[var(--muted)]">Custom &lt;head&gt; snippet (max 4 KB)</span>
        <textarea
          rows={3}
          placeholder='<meta name="custom" content="..." />'
          value={customHead}
          onChange={(e) => setCustomHead(e.target.value)}
          className="mt-1 w-full px-3 py-2 font-mono text-xs rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] placeholder-[var(--muted)]"
        />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit"
          disabled={state === 'saving'}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--accent)] text-[var(--paper)] disabled:opacity-50"
        >
          {state === 'saving' ? 'Saving…' : 'Save analytics tags'}
        </button>
        {state === 'saved' && <span className="text-xs text-[var(--success)]">Saved.</span>}
        {typeof state === 'object' && state.error && (
          <span className="text-xs text-[var(--error)]">{state.error}</span>
        )}
      </div>
    </form>
  )
}
