/**
 * Custom-domains section for AppDetail. Split out of AppDetailSections.tsx.
 */
import { useState, useEffect, useCallback } from "react"
import {
  listDomains,
  attachDomain,
  verifyDomain,
  removeDomain,
  cnameTarget,
  type Domain,
} from "./domains"

// ─── Custom domains ─────────────────────────────────────────────────────────
//
// Owner-facing UI for BYO custom domains. Wraps the same /v1/apps/:id/domains
// endpoints the `pas domain` CLI hits. No background polling — Verify is an
// explicit user action, matching the owner-pays-for-refresh model.
// Buying a domain isn't supported yet; see docs/custom-domain-purchase-plan.md.

export function DomainsSection({
  appId,
  getToken,
}: {
  appId: string
  getToken: () => string | null
}) {
  const [domains, setDomains] = useState<Domain[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [attachState, setAttachState] = useState<'idle' | 'attaching' | { error: string }>('idle')

  const reload = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const { domains } = await listDomains(token, appId)
      setDomains(domains)
      setLoadError(null)
    } catch (e) {
      setLoadError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [appId, getToken])

  useEffect(() => {
    setLoading(true)
    reload()
  }, [reload])

  const onAttach = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = getToken()
    if (!token) return
    const trimmed = input.trim().toLowerCase()
    if (!trimmed) return
    setAttachState('attaching')
    try {
      await attachDomain(token, appId, trimmed)
      setInput('')
      setAttachState('idle')
      await reload()
    } catch (err) {
      setAttachState({ error: (err as Error).message })
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <h3 className="display-font text-lg font-bold text-[var(--ink)] mb-1">Custom domains</h3>
      <p className="text-sm text-[var(--muted)] mb-4">
        Bring a domain you already own. Cloudflare provisions the SSL cert automatically
        once your DNS points to the project. We don't sell domains — use Cloudflare
        Registrar, Porkbun, or Namecheap.
      </p>

      {loading && <p className="text-sm text-[var(--muted)]">Loading…</p>}

      {!loading && loadError && (
        <p className="text-sm text-[var(--error)]">Couldn't load domains. {loadError}</p>
      )}

      {!loading && !loadError && domains && domains.length === 0 && (
        <p className="text-sm text-[var(--muted)] italic mb-4">No custom domains attached yet.</p>
      )}

      {!loading && !loadError && domains && domains.length > 0 && (
        <ul className="space-y-3 mb-6">
          {domains.map((d) => (
            <DomainRow
              key={d.domain}
              appId={appId}
              d={d}
              getToken={getToken}
              onChange={reload}
            />
          ))}
        </ul>
      )}

      <form onSubmit={onAttach} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="app.yourdomain.com"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={attachState === 'attaching'}
          className="flex-1 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm font-mono text-[var(--ink)] placeholder:text-[var(--muted)]/60 focus:outline-none focus:border-[var(--ink)] disabled:opacity-50"
        />
        <button type="submit"
          disabled={!input.trim() || attachState === 'attaching'}
          className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-[var(--paper)] hover:opacity-90 disabled:opacity-50"
        >
          {attachState === 'attaching' ? 'Attaching…' : 'Attach'}
        </button>
      </form>
      {typeof attachState === 'object' && (
        <p className="mt-2 text-sm text-[var(--error)]">{attachState.error}</p>
      )}
    </section>
  )
}

function DomainRow({
  appId,
  d,
  getToken,
  onChange,
}: {
  appId: string
  d: Domain
  getToken: () => string | null
  onChange: () => Promise<void>
}) {
  const [verifyState, setVerifyState] = useState<'idle' | 'verifying' | { error: string }>('idle')
  const [removeState, setRemoveState] = useState<'idle' | 'confirm' | 'removing' | { error: string }>('idle')

  const onVerify = async () => {
    const token = getToken()
    if (!token) return
    setVerifyState('verifying')
    try {
      await verifyDomain(token, appId, d.domain)
      setVerifyState('idle')
      await onChange()
    } catch (err) {
      setVerifyState({ error: (err as Error).message })
    }
  }

  const onRemove = async () => {
    const token = getToken()
    if (!token) return
    setRemoveState('removing')
    try {
      await removeDomain(token, appId, d.domain)
      await onChange()
      // Component unmounts on successful remove via parent reload.
    } catch (err) {
      setRemoveState({ error: (err as Error).message })
    }
  }

  const badgeColor =
    d.status === 'active'
      ? 'bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]/30'
      : d.status === 'pending'
        ? 'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/30'
        : 'bg-[var(--error)]/15 text-[var(--error)] border-[var(--error)]/30'

  return (
    <li className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-[var(--ink)] truncate">{d.domain}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 border ${badgeColor}`}>
              {d.status === 'pending' ? 'pending DNS' : d.status}
            </span>
            {d.cfStatus && d.cfStatus !== d.status && (
              <span className="text-[10px] text-[var(--muted)] font-mono">CF: {d.cfStatus}</span>
            )}
          </div>
          {d.status === 'active' ? (
            <p className="text-xs text-[var(--muted)] mt-1">
              Verified {new Date(d.verifiedAt ?? d.addedAt).toLocaleString()} ·{' '}
              <a href={`https://${d.domain}`} target="_blank" rel="noreferrer" className="underline">
                open
              </a>
            </p>
          ) : (
            <p className="text-xs text-[var(--muted)] mt-1">
              Status as of {new Date(d.addedAt).toLocaleString()} — click Verify after adding DNS to refresh.
            </p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {d.status !== 'active' && (
            <button type="button"
              onClick={onVerify}
              disabled={verifyState === 'verifying'}
              className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--ink)]/5 disabled:opacity-50"
            >
              {verifyState === 'verifying' ? 'Checking…' : 'Verify'}
            </button>
          )}
          <button type="button"
            onClick={() => setRemoveState('confirm')}
            disabled={removeState === 'confirm' || removeState === 'removing'}
            className="rounded-lg border border-[var(--error)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--error)] hover:bg-[var(--error)]/10 disabled:opacity-50"
          >
            {removeState === 'removing' ? 'Detaching…' : 'Detach'}
          </button>
        </div>
      </div>

      {typeof verifyState === 'object' && (
        <p className="mt-2 text-xs text-[var(--error)]">{verifyState.error}</p>
      )}

      {removeState === 'confirm' && (
        <div className="mt-3 pt-3 border-t border-[var(--error)]/30 space-y-2">
          <p className="text-xs text-[var(--ink)]">
            Detach <span className="font-mono font-semibold">{d.domain}</span>?
            Cloudflare will stop serving the app at this hostname.
          </p>
          <p className="text-xs text-[var(--muted)]">
            <strong className="text-[var(--ink)]">Also remove the CNAME at your registrar</strong>{' '}
            ({d.domain} → {cnameTarget(appId)}) so the domain isn't left pointing at our infra.
            That DNS lives on your account — we can't touch it.
          </p>
          <div className="flex gap-2 pt-1">
            <button type="button"
              onClick={onRemove}
              disabled={removeState !== 'confirm'}
              className="rounded-lg bg-[var(--error)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Yes, detach
            </button>
            <button type="button"
              onClick={() => setRemoveState('idle')}
              className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {typeof removeState === 'object' && (
        <p className="mt-2 text-xs text-[var(--error)]">{removeState.error}</p>
      )}

      {d.status !== 'active' && <DomainDnsHint appId={appId} d={d} />}
    </li>
  )
}

function DomainDnsHint({ appId, d }: { appId: string; d: Domain }) {
  const target = cnameTarget(appId)
  const validation = d.validationData
  const errMsg = d.verificationData?.error_message || validation?.error_message
  return (
    <div className="mt-3 pt-3 border-t border-[var(--line)] space-y-3">
      <div>
        <p className="text-xs font-semibold text-[var(--ink)] mb-1">Add this DNS record at your registrar:</p>
        <div className="rounded-lg bg-[var(--ink)]/5 p-3 text-xs font-mono space-y-1">
          <div><span className="text-[var(--muted)]">Type:</span>  CNAME</div>
          <div><span className="text-[var(--muted)]">Name:</span>  {d.domain}</div>
          <div className="break-all"><span className="text-[var(--muted)]">Value:</span> {target}</div>
        </div>
        <p className="text-[11px] text-[var(--muted)] mt-1.5 italic">
          Apex domains (e.g. example.com without a subdomain) can't use a raw CNAME — use
          ALIAS / ANAME if your registrar supports it, or A/AAAA records pointing to Cloudflare.
        </p>
      </div>

      {validation?.method === 'txt' && validation.txt_name && validation.txt_value && (
        <div>
          <p className="text-xs font-semibold text-[var(--ink)] mb-1">Plus this TXT record for SSL validation:</p>
          <div className="rounded-lg bg-[var(--ink)]/5 p-3 text-xs font-mono space-y-1">
            <div><span className="text-[var(--muted)]">Type:</span>  TXT</div>
            <div className="break-all"><span className="text-[var(--muted)]">Name:</span>  {validation.txt_name}</div>
            <div className="break-all"><span className="text-[var(--muted)]">Value:</span> {validation.txt_value}</div>
          </div>
        </div>
      )}

      {errMsg && (
        <p className="text-xs text-[var(--error)]"><strong>Last check:</strong> {errMsg}</p>
      )}
    </div>
  )
}


