import { useState, useEffect, useCallback } from 'react'
import { API_BASE, requestJson } from './api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoleAssignment {
  userId: string
  roleName: string
  grantedBy: string | null
  grantedAt: number | null
  userLogin: string | null
  userAvatarUrl: string | null
  grantedByLogin: string | null
  grantedByAvatarUrl: string | null
}

type RoleAssignmentApi = Partial<RoleAssignment> & {
  user_id?: string
  role_name?: string
  granted_by?: string | null
  granted_at?: string | number | null
  user_login?: string | null
  user_avatar_url?: string | null
  granted_by_login?: string | null
  granted_by_avatar_url?: string | null
}

// What each role means, shown where a role is picked or listed (console#19).
const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: 'Full control. Belongs to the app creator and cannot be removed.',
  moderator: 'Can moderate content and manage community features.',
  editor: 'Can edit app content, listings, and configuration.',
  viewer: 'Read-only access to app analytics and settings.',
  member: 'Signed in to the app. No extra permissions.',
}

const ASSIGNABLE_ROLES = ['moderator', 'editor', 'viewer']

/** `member` is given automatically to everyone who signs in to the app (platform roles.ts ensure-member). */
const SIGNED_IN_ROLE = 'member'

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchRoles(token: string, appId: string): Promise<RoleAssignment[]> {
  const data = await requestJson<{ roles: RoleAssignmentApi[] }>(
    `${API_BASE}/apps/${encodeURIComponent(appId)}/roles`,
    { token },
  )
  return (data.roles ?? []).map(normalizeRoleAssignment).filter((r): r is RoleAssignment => r !== null)
}

async function assignRole(token: string, appId: string, userId: string, role: string): Promise<void> {
  const res = await fetch(`${API_BASE}/apps/${encodeURIComponent(appId)}/roles`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId, role }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(body || `Failed to assign role (${res.status})`)
  }
}

async function revokeRole(token: string, appId: string, userId: string, role: string): Promise<void> {
  const res = await fetch(`${API_BASE}/apps/${encodeURIComponent(appId)}/roles`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId, role }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(body || `Failed to revoke role (${res.status})`)
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  appId: string
  getToken: () => string | null
}

export function RolesManager({ appId, getToken }: Props) {
  const [roles, setRoles] = useState<RoleAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Add-person form state
  const [userId, setUserId] = useState('')
  const [selectedRole, setSelectedRole] = useState(ASSIGNABLE_ROLES[0]!)
  const [customRole, setCustomRole] = useState('')
  const [addState, setAddState] = useState<'idle' | 'saving' | { error: string }>('idle')

  // Remove state keyed by "userId:roleName": the row asking to confirm, and the one in flight.
  const [confirming, setConfirming] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const token = getToken()
    if (!token) { setLoadError('Not signed in.'); setLoading(false); return }
    try {
      const r = await fetchRoles(token, appId)
      setRoles(r)
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

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = getToken()
    if (!token) return
    const typed = userId.trim()
    if (!typed) return
    // A name picked from the suggestions resolves to that person's ID, so nobody needs to know it.
    const uid = roles.find((r) => r.userLogin === typed.replace(/^@/, ''))?.userId ?? typed
    const role = selectedRole === 'custom' ? customRole.trim().toLowerCase() : selectedRole
    if (!role) return
    setAddState('saving')
    try {
      await assignRole(token, appId, uid, role)
      setUserId('')
      setCustomRole('')
      setSelectedRole(ASSIGNABLE_ROLES[0]!)
      setAddState('idle')
      await reload()
    } catch (err) {
      setAddState({ error: (err as Error).message })
    }
  }

  const handleRevoke = async (uid: string, roleName: string) => {
    const token = getToken()
    if (!token) return
    setRevoking(`${uid}:${roleName}`)
    setRevokeError(null)
    try {
      await revokeRole(token, appId, uid, roleName)
      setConfirming(null)
      await reload()
    } catch (err) {
      setRevokeError((err as Error).message)
    } finally {
      setRevoking(null)
    }
  }

  // Grant the new role, then drop the old one — unless the old one is the automatic signed-in role (console#23).
  const handleChangeRole = async (r: RoleAssignment, role: string) => {
    const token = getToken()
    if (!token || role === r.roleName) return
    setRevokeError(null)
    try {
      await assignRole(token, appId, r.userId, role)
      if (r.roleName !== SIGNED_IN_ROLE) await revokeRole(token, appId, r.userId, r.roleName)
    } catch (err) {
      setRevokeError((err as Error).message)
    }
    await reload()
  }

  const team = roles.filter((r) => r.roleName !== SIGNED_IN_ROLE)
  const teamIds = new Set(team.map((r) => r.userId))
  // Someone with a team role is listed once, in the team — not again as a signed-in user.
  const signedIn = roles.filter((r) => r.roleName === SIGNED_IN_ROLE && !teamIds.has(r.userId))
  const pickedDescription = selectedRole === 'custom'
    ? 'A role your app checks for itself. It grants nothing in the console.'
    : ROLE_DESCRIPTIONS[selectedRole]
  const field = 'rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--muted)]/60 focus:outline-none focus:border-[var(--ink)] disabled:opacity-50'

  const row = (r: RoleAssignment) => {
    const key = `${r.userId}:${r.roleName}`
    return (
      <MemberRow key={key} r={r} confirming={confirming === key} revoking={revoking === key}
        onAskRemove={() => { setConfirming(key); setRevokeError(null) }}
        onCancel={() => setConfirming(null)}
        onRemove={() => void handleRevoke(r.userId, r.roleName)}
        onChangeRole={(role) => void handleChangeRole(r, role)} />
    )
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 space-y-5">
      <div>
        <h3 className="display-font text-lg font-bold text-[var(--ink)]">Team</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">People who help run this app, and what each of them can do.</p>
      </div>

      <form onSubmit={handleAdd} className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4 space-y-2" aria-label="Add a person">
        <div className="flex gap-2 flex-col sm:flex-row">
          <input
            aria-label="Person"
            type="text"
            list="roles-people"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Name of someone who signed in, or a GitHub login"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={addState === 'saving'}
            className={`flex-1 ${field}`}
          />
          <datalist id="roles-people">
            {signedIn.filter((r) => r.userLogin).map((r) => <option key={r.userId} value={r.userLogin!} />)}
          </datalist>
          <select aria-label="Role" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}
            disabled={addState === 'saving'} className={field}>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
            ))}
            <option value="custom">Custom…</option>
          </select>
          <button
            aria-label={addState === 'saving' ? 'Adding...' : 'Assign role'}
            type="submit"
            disabled={addState === 'saving' || !userId.trim() || (selectedRole === 'custom' && !customRole.trim())}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
          >
            {addState === 'saving' ? 'Adding…' : 'Add person'}
          </button>
        </div>
        {selectedRole === 'custom' && (
          <input
            aria-label="Custom role name"
            type="text"
            value={customRole}
            onChange={(e) => setCustomRole(e.target.value)}
            placeholder="Custom role name (e.g. tester, translator)"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={addState === 'saving'}
            className={`w-full font-mono ${field}`}
          />
        )}
        <p className="text-xs text-[var(--muted)]">{pickedDescription}</p>
        {typeof addState === 'object' && <p role="alert" className="text-xs text-[var(--error)]">{addState.error}</p>}
      </form>

      {loading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
      {!loading && loadError && <p className="text-sm text-[var(--error)]">{loadError}</p>}

      {!loading && !loadError && (
        <>
          {team.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Only you so far. Add someone above to give them access.</p>
          ) : (
            <ul className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">{team.map(row)}</ul>
          )}

          {signedIn.length > 0 && (
            <details className="rounded-xl border border-[var(--line)]">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[var(--ink)]">
                {signedIn.length} signed-in {signedIn.length === 1 ? 'user' : 'users'}
                <span className="ml-2 font-normal text-[var(--muted)]">{ROLE_DESCRIPTIONS[SIGNED_IN_ROLE]}</span>
              </summary>
              <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">{signedIn.map(row)}</ul>
            </details>
          )}
        </>
      )}

      {revokeError && <p role="alert" className="text-sm text-[var(--error)]">{revokeError}</p>}
    </section>
  )
}

function MemberRow({ r, confirming, revoking, onAskRemove, onCancel, onRemove, onChangeRole }: {
  r: RoleAssignment; confirming: boolean; revoking: boolean
  onAskRemove: () => void; onCancel: () => void; onRemove: () => void; onChangeRole: (role: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const name = r.userLogin ? `@${r.userLogin}` : r.userId
  const isOwner = r.roleName === 'owner'
  const copy = () => {
    void navigator.clipboard?.writeText(r.userId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }, () => {})
  }
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {r.userAvatarUrl
        ? <img src={r.userAvatarUrl} alt="" className="h-8 w-8 rounded-full border border-[var(--line)] shrink-0" />
        : <span aria-hidden="true" className="h-8 w-8 rounded-full bg-[var(--line)] shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-[var(--ink)] truncate" title={r.userId}>{name}</span>
          <RoleBadge role={r.roleName} />
        </div>
        <p className="text-xs text-[var(--muted)] truncate">
          {ROLE_DESCRIPTIONS[r.roleName] ?? 'Custom role.'}{r.grantedAt ? ` Added ${formatGrantedDate(r.grantedAt)}.` : ''}
        </p>
      </div>
      <button type="button" onClick={copy} title={r.userId} aria-label={`Copy user ID ${r.userId}`}
        className="shrink-0 rounded-lg px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--panel-hover)]">
        {copied ? 'Copied' : 'Copy ID'}
      </button>
      {!isOwner && (
        <select aria-label={`Role for ${name}`} value={r.roleName} onChange={(e) => onChangeRole(e.target.value)}
          className="shrink-0 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1.5 text-xs text-[var(--ink)]">
          {r.roleName === SIGNED_IN_ROLE && <option value={SIGNED_IN_ROLE}>Give a role…</option>}
          {!ASSIGNABLE_ROLES.includes(r.roleName) && r.roleName !== SIGNED_IN_ROLE && <option value={r.roleName}>{r.roleName}</option>}
          {ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>)}
        </select>
      )}
      {isOwner ? null : confirming ? (
        <span className="shrink-0 flex items-center gap-1">
          <button type="button" onClick={onRemove} disabled={revoking}
            className="rounded-lg bg-[var(--error)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {revoking ? 'Removing…' : `Remove ${r.roleName}`}
          </button>
          <button type="button" onClick={onCancel} disabled={revoking}
            className="rounded-lg px-2 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--ink)]">Cancel</button>
        </span>
      ) : (
        <button type="button" onClick={onAskRemove} aria-label={`Remove ${name}`}
          className="shrink-0 rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:text-[var(--error)] hover:border-[var(--error)]/40">
          Remove
        </button>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function RoleBadge({ role }: { role: string }) {
  let cls: string
  switch (role) {
    case 'owner':
      cls = 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30'
      break
    case 'moderator':
      cls = 'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/30'
      break
    case 'editor':
      cls = 'bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]/30'
      break
    case 'viewer':
    case 'member':
      cls = 'bg-[var(--line)] text-[var(--muted)] border-[var(--line-strong)]'
      break
    default:
      cls = 'bg-[var(--ink)]/10 text-[var(--ink)] border-[var(--ink)]/20'
      break
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}
    >
      {role}
    </span>
  )
}

function normalizeRoleAssignment(raw: RoleAssignmentApi): RoleAssignment | null {
  const userId = raw.userId ?? raw.user_id
  const roleName = raw.roleName ?? raw.role_name
  if (!userId || !roleName) return null
  return {
    userId,
    roleName,
    grantedBy: raw.grantedBy ?? raw.granted_by ?? null,
    grantedAt: normalizeTime(raw.grantedAt ?? raw.granted_at),
    userLogin: raw.userLogin ?? raw.user_login ?? null,
    userAvatarUrl: raw.userAvatarUrl ?? raw.user_avatar_url ?? null,
    grantedByLogin: raw.grantedByLogin ?? raw.granted_by_login ?? null,
    grantedByAvatarUrl: raw.grantedByAvatarUrl ?? raw.granted_by_avatar_url ?? null,
  }
}

function normalizeTime(value: string | number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function formatGrantedDate(value: number | null): string {
  if (!value) return 'unknown date'
  const ms = value < 10_000_000_000 ? value * 1000 : value
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return 'unknown date'
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
