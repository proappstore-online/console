import { useState, useEffect, useCallback } from 'react'
import type { User } from '@proappstore/sdk'
import { pro } from './sdk'
import { API_BASE as API } from './api'

interface Provider { id: string; name: string; docs_url: string | null; key_prefix: string | null }
interface KeyStatus { provider: string; label: string | null; createdAt: number; lastUsedAt: number | null }
type Theme = 'system' | 'light' | 'dark'

function applyTheme(t: Theme) {
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  if (dark) document.documentElement.dataset.theme = 'dark'
  else delete document.documentElement.dataset.theme
}

/**
 * Full profile/account page: API key vault (BYO Anthropic/OpenAI keys that power
 * the agents), theme, and account actions. Reached from the avatar.
 */
export function ProfileView({ user }: { user: User }) {
  const displayName = user.login || user.id
  return (
    <div className="space-y-8 max-w-2xl">
      <header className="flex items-center gap-4">
        {user.avatarUrl && <img src={user.avatarUrl} alt="" className="h-14 w-14 rounded-full ring-2 ring-[var(--line-strong)]" />}
        <div>
          <h2 className="display-font text-2xl font-bold text-[var(--ink)]">{displayName}</h2>
          <p className="text-sm text-[var(--muted)]">Your ProAppStore account</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            UID <span className="font-mono text-[var(--ink)]">{user.id}</span>
          </p>
        </div>
      </header>

      <ApiKeysSection />
      <NotificationsSection />
      <ThemeSection />
      <TextSizeSection />
      <AccountSection />
    </div>
  )
}

// ── Push notifications (so you don't have to watch the board) ──

function NotificationsSection() {
  const [state, setState] = useState<'loading' | 'on' | 'off' | 'denied' | 'unsupported'>('loading')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') { setState('unsupported'); return }
      if (Notification.permission === 'denied') { setState('denied'); return }
      try { setState((await pro.notifications.isSubscribed()) ? 'on' : 'off') } catch { setState('off') }
    })()
  }, [])

  const enable = async () => {
    setBusy(true); setErr(null)
    try {
      // Reuse the SW vite-plugin-pwa already registered (path differs between the
      // console domain and proappstore.online/app/).
      const reg = await navigator.serviceWorker.getRegistration()
      const swPath = reg?.active?.scriptURL ? new URL(reg.active.scriptURL).pathname : '/sw.js'
      await pro.notifications.subscribe(swPath)
      setState('on')
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Could not enable notifications.'
      setErr(/denied/i.test(m) ? 'Permission blocked — allow notifications for this site in your browser settings.' : m)
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') setState('denied')
    } finally { setBusy(false) }
  }

  const disable = async () => {
    setBusy(true)
    try { await pro.notifications.unsubscribe(); setState('off') } catch { /* ignore */ } finally { setBusy(false) }
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">Notifications</h3>
      <p className="text-sm text-[var(--muted)] mb-4">
        Get a push when an agent task needs your input, finishes, or fails — so you don't have to watch the board while agents work.
      </p>
      {state === 'unsupported' && <p className="text-sm text-[var(--muted)]">Not supported in this browser.</p>}
      {state === 'denied' && <p className="text-sm text-[var(--error)]">Notifications are blocked. Allow them for this site in your browser settings, then reload.</p>}
      {(state === 'on' || state === 'off') && (
        <button
          type="button"
          onClick={state === 'on' ? disable : enable}
          disabled={busy}
          className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50 transition-colors ${
            state === 'on'
              ? 'border border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--ink)]'
              : 'bg-[var(--accent)] text-white hover:opacity-90'
          }`}
        >
          {busy ? 'Working…' : state === 'on' ? 'Disable notifications' : 'Enable notifications'}
        </button>
      )}
      {err && <p className="text-xs text-[var(--error)] mt-2">{err}</p>}
    </section>
  )
}

// ── Text size (accessibility — scales the whole UI) ──────────

type TextSize = 'sm' | 'md' | 'lg' | 'xl'
const TEXT_KEY = 'console-text'

export function applyTextSize(s: TextSize) {
  if (s === 'md') delete document.documentElement.dataset.text
  else document.documentElement.dataset.text = s
}

function TextSizeSection() {
  const [size, setSize] = useState<TextSize>(() => (localStorage.getItem(TEXT_KEY) as TextSize) || 'md')

  const choose = (s: TextSize) => {
    setSize(s)
    applyTextSize(s)
    try { localStorage.setItem(TEXT_KEY, s) } catch { /* ignore */ }
  }

  const OPTIONS: { value: TextSize; label: string }[] = [
    { value: 'sm', label: 'Small' },
    { value: 'md', label: 'Default' },
    { value: 'lg', label: 'Large' },
    { value: 'xl', label: 'Larger' },
  ]

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">Text size</h3>
      <p className="text-sm text-[var(--muted)] mb-4">Scales the entire console. Useful for dense screens like the agents board.</p>
      <div className="flex gap-2">
        {OPTIONS.map((o) => (
          <button key={o.value} type="button" onClick={() => choose(o.value)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              size === o.value ? 'bg-[var(--accent)] text-white' : 'border border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--ink)]'
            }`}>
            {o.label}
          </button>
        ))}
      </div>
    </section>
  )
}

// ── API Keys (user key vault) ────────────────────────────────

function ApiKeysSection() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [configured, setConfigured] = useState<Record<string, KeyStatus>>({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  const headers = useCallback(() => ({
    Authorization: `Bearer ${pro.auth.token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }), [])

  const load = useCallback(async () => {
    try {
      const [pRes, sRes] = await Promise.all([
        fetch(`${API}/keys/providers`, { headers: headers() }),
        fetch(`${API}/keys/status`, { headers: headers() }),
      ])
      setProviders((await pRes.json()).providers ?? [])
      const keys: KeyStatus[] = (await sRes.json()).keys ?? []
      setConfigured(Object.fromEntries(keys.map((k) => [k.provider, k])))
    } catch { /* ignore */ }
    setLoading(false)
  }, [headers])

  useEffect(() => { load() }, [load])

  const save = async (id: string) => {
    const value = draft.trim()
    if (!value) return
    setStatus('Saving…')
    const res = await fetch(`${API}/keys/${id}`, { method: 'PUT', headers: headers(), body: JSON.stringify({ value }) })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.ok !== false) { setStatus('Saved'); setEditing(null); setDraft(''); load() }
    else setStatus(`Error: ${data.error ?? res.status}`)
  }

  const remove = async (id: string) => {
    if (!confirm(`Remove your ${id} API key?`)) return
    await fetch(`${API}/keys/${id}`, { method: 'DELETE', headers: headers() })
    load()
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">API Keys</h3>
      <p className="text-sm text-[var(--muted)] mb-4">
        Encrypted and stored on the platform — apps and agents never see them, they're used server-side.
        Add an <strong>Anthropic</strong> or <strong>OpenAI</strong> key to let your agent teams build.
      </p>
      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : (
        <div className="space-y-2">
          {providers.map((p) => {
            const has = configured[p.id]
            return (
              <div key={p.id} className="rounded-xl border border-[var(--line)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-[var(--ink)]">{p.name}</span>
                    {p.docs_url && (
                      <a href={p.docs_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-[var(--accent)] hover:underline">Get key ↗</a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {has
                      ? <span className="rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 text-[10px] font-bold uppercase">configured</span>
                      : <span className="rounded-full border border-[var(--line-strong)] text-[var(--muted)] px-2 py-0.5 text-[10px] font-semibold">not set</span>}
                    <button type="button" onClick={() => { setEditing(editing === p.id ? null : p.id); setDraft('') }}
                      className="text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] underline">
                      {has ? 'Update' : 'Add'}
                    </button>
                    {has && (
                      <button type="button" onClick={() => remove(p.id)} className="text-xs font-medium text-[var(--error)] hover:underline">Remove</button>
                    )}
                  </div>
                </div>
                {editing === p.id && (
                  <div className="mt-3 flex gap-2">
                    <input
                      type="password"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') save(p.id) }}
                      placeholder={`Paste your ${p.name} API key${p.key_prefix ? ` (${p.key_prefix}…)` : ''}`}
                      aria-label={`${p.name} API key`}
                      className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)]"
                    />
                    <button type="button" onClick={() => save(p.id)} disabled={!draft.trim()}
                      className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">Save</button>
                  </div>
                )}
              </div>
            )
          })}
          {providers.length === 0 && <p className="text-sm text-[var(--muted)]">No providers configured.</p>}
        </div>
      )}
      {status && <p className="mt-3 text-xs text-[var(--muted)]">{status}</p>}
    </section>
  )
}

// ── Theme ────────────────────────────────────────────────────

function ThemeSection() {
  const [theme, setTheme] = useState<Theme>('system')

  useEffect(() => {
    pro.kv.get<{ theme?: Theme }>('prefs').then((p) => { if (p?.theme) setTheme(p.theme) }).catch(() => {})
  }, [])

  const choose = (t: Theme) => {
    setTheme(t)
    applyTheme(t)
    pro.kv.set('prefs', { theme: t }).catch(() => {})
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">Theme</h3>
      <div className="flex gap-2">
        {(['system', 'light', 'dark'] as const).map((t) => (
          <button key={t} type="button" onClick={() => choose(t)}
            className={`rounded-lg px-4 py-2 text-sm font-medium capitalize ${
              theme === t ? 'bg-[var(--accent)] text-white' : 'border border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--ink)]'
            }`}>
            {t}
          </button>
        ))}
      </div>
    </section>
  )
}

// ── Account ──────────────────────────────────────────────────

function AccountSection() {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">Account</h3>
      <button type="button" onClick={() => pro.auth.signOut()}
        className="rounded-lg border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]">Sign out</button>
    </section>
  )
}
