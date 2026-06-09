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

const DEFAULT_ROLES: { name: string; description: string }[] = [
  { name: 'owner', description: 'Full control. Cannot be revoked from the app creator.' },
  { name: 'moderator', description: 'Can moderate content and manage community features.' },
  { name: 'editor', description: 'Can edit app content, listings, and configuration.' },
  { name: 'viewer', description: 'Read-only access to app analytics and settings.' },
]

const ASSIGNABLE_ROLES = ['moderator', 'editor', 'viewer']

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

  // Add-role form state
  const [userId, setUserId] = useState('')
  const [selectedRole, setSelectedRole] = useState(ASSIGNABLE_ROLES[0]!)
  const [customRole, setCustomRole] = useState('')
  const [addState, setAddState] = useState<'idle' | 'saving' | { error: string }>('idle')

  // Revoke state keyed by "userId:roleName"
  const [revoking, setRevoking] = useState<Record<string, boolean>>({})
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
    const uid = userId.trim()
    if (!uid) return
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
    const key = `${uid}:${roleName}`
    setRevoking((prev) => ({ ...prev, [key]: true }))
    setRevokeError(null)
    try {
      await revokeRole(token, appId, uid, roleName)
      await reload()
    } catch (err) {
      setRevokeError((err as Error).message)
    } finally {
      setRevoking((prev) => ({ ...prev, [key]: false }))
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <h3 className="display-font text-lg font-bold text-[var(--ink)] mb-1">Team</h3>
      <p className="text-sm text-[var(--muted)] mb-4">
        Manage who has access to this app and what they can do.
      </p>

      {/* Default role descriptions */}
      <div className="mb-6">
        <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Available roles
        </h4>
        <div className="grid gap-2 sm:grid-cols-2">
          {DEFAULT_ROLES.map((r) => (
            <div
              key={r.name}
              className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2"
            >
              <span className="text-sm font-semibold text-[var(--ink)] capitalize">{r.name}</span>
              <p className="text-xs text-[var(--muted)] mt-0.5">{r.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Current assignments */}
      <div className="mb-6">
        <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Current members
        </h4>

        {loading && (
          <p className="text-sm text-[var(--muted)]">Loading...</p>
        )}

        {!loading && loadError && (
          <p className="text-sm text-[var(--error)]">{loadError}</p>
        )}

        {!loading && !loadError && roles.length === 0 && (
          <p className="text-sm text-[var(--muted)] italic">
            No role assignments yet. The app owner is implicit.
          </p>
        )}

        {!loading && !loadError && roles.length > 0 && (
          <ul className="space-y-2">
            {roles.map((r) => {
              const key = `${r.userId}:${r.roleName}`
              const isOwner = r.roleName === 'owner'
              const isRevoking = revoking[key] ?? false
              const userLabel = r.userLogin ? `@${r.userLogin}` : r.userId
              const grantorLabel = r.grantedByLogin ? `@${r.grantedByLogin}` : (r.grantedBy ?? 'platform')
              return (
                <li
                  key={key}
                  className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--paper)] px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      {r.userAvatarUrl && (
                        <img src={r.userAvatarUrl} alt="" className="h-8 w-8 rounded-full border border-[var(--line)]" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[var(--ink)] truncate">
                            {userLabel}
                          </span>
                          <RoleBadge role={r.roleName} />
                        </div>
                        <p className="text-[11px] text-[var(--muted)] font-mono truncate">
                          UID {r.userId}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      Granted by {grantorLabel} on {formatGrantedDate(r.grantedAt)}
                    </p>
                  </div>
                  {isOwner ? (
                    <span className="text-xs text-[var(--muted)] italic shrink-0 ml-3">
                      Cannot revoke
                    </span>
                  ) : (
                    <button
                      onClick={() => handleRevoke(r.userId, r.roleName)}
                      disabled={isRevoking}
                      className="shrink-0 ml-3 rounded-lg border border-[var(--error)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--error)] hover:bg-[var(--error)]/10 disabled:opacity-50"
                    >
                      {isRevoking ? 'Revoking...' : 'Revoke'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {revokeError && (
          <p className="mt-2 text-sm text-[var(--error)]">{revokeError}</p>
        )}
      </div>

      {/* Add role form */}
      <div>
        <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Add role
        </h4>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="flex gap-2 flex-col sm:flex-row">
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="User ID (GitHub login or numeric ID)"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={addState === 'saving'}
              className="flex-1 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm font-mono text-[var(--ink)] placeholder:text-[var(--muted)]/60 focus:outline-none focus:border-[var(--ink)] disabled:opacity-50"
            />
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              disabled={addState === 'saving'}
              className="rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] disabled:opacity-50"
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
              <option value="custom">Custom...</option>
            </select>
          </div>

          {selectedRole === 'custom' && (
            <input
              type="text"
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
              placeholder="Custom role name (e.g. tester, translator)"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={addState === 'saving'}
              className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm font-mono text-[var(--ink)] placeholder:text-[var(--muted)]/60 focus:outline-none focus:border-[var(--ink)] disabled:opacity-50"
            />
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={
                addState === 'saving' ||
                !userId.trim() ||
                (selectedRole === 'custom' && !customRole.trim())
              }
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {addState === 'saving' ? 'Assigning...' : 'Assign role'}
            </button>
            {typeof addState === 'object' && (
              <span className="text-xs text-[var(--error)]">{addState.error}</span>
            )}
          </div>
        </form>
      </div>
    </section>
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
  return date.toLocaleDateString()
}
