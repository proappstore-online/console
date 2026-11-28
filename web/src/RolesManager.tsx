import { useState, useEffect, useCallback } from 'react'
import { API_BASE, apiFetch, requestJson } from './api'

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

const APP_ROLE_DESCRIPTION = "A role this app's actions check."

/**
 * A role the app itself checks (console#25): one it declares in mcp.json `roles`
 * (platform#695), or, when it declares none, one its actions name in
 * `auth.app_roles` (console#24), with the id as its label.
 */
export interface AppRole {
  id: string
  label: string
  description: string | null
  /** Roles a holder also needs; the platform grants them with this one. */
  requires: string[]
}

/** The app's roles, and whether they were declared (the owner then holds every one of them). */
interface AppRoles {
  roles: AppRole[]
  declared: boolean
}

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

/** The roles the app declares in mcp.json `roles`, in declared order (platform#695). Empty when it declares none. */
export async function fetchDeclaredRoles(token: string, appId: string): Promise<AppRole[]> {
  const data = await apiFetch<{ roles?: AppRole[] }>(`/apps/${encodeURIComponent(appId)}/roles/declared`, { token })
  return data.roles ?? []
}

/**
 * The app's own roles, so they can be offered by name: the declared ones, or,
 * for an app that declares none (or a platform without the route), the roles
 * its actions check (`auth.app_roles` in its manifest, console#24).
 */
async function fetchAppRoles(token: string, appId: string): Promise<AppRoles> {
  const declared = await fetchDeclaredRoles(token, appId).catch(() => [])
  if (declared.length > 0) return { roles: declared, declared: true }
  const data = await apiFetch<{ tools?: { auth?: { app_roles?: string[] } }[] }>(`/apps/${encodeURIComponent(appId)}/tools`, { token })
  const ids = new Set((data.tools ?? []).flatMap((t) => t.auth?.app_roles ?? []))
  ids.delete('owner')
  ids.delete(SIGNED_IN_ROLE)
  return { roles: [...ids].map((id) => ({ id, label: id, description: null, requires: [] })), declared: false }
}

/** Grant a role. The platform also grants the declared roles it requires, and names them (platform#695). */
export async function assignRole(token: string, appId: string, userId: string, role: string): Promise<{ requiredRoles: string[] }> {
  const data = await apiFetch<{ requiredRoles?: string[] }>(`/apps/${encodeURIComponent(appId)}/roles`, {
    token, method: 'POST', body: JSON.stringify({ userId, role }),
  })
  return { requiredRoles: data?.requiredRoles ?? [] }
}

/** Revoke a role. The platform also revokes the declared roles that require it, and names them (platform#695). */
async function revokeRole(token: string, appId: string, userId: string, role: string): Promise<{ dependentRoles: string[] }> {
  const data = await apiFetch<{ dependentRoles?: string[] }>(`/apps/${encodeURIComponent(appId)}/roles`, {
    token, method: 'DELETE', body: JSON.stringify({ userId, role }),
  })
  return { dependentRoles: data?.dependentRoles ?? [] }
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
  const [appRoles, setAppRoles] = useState<AppRoles>({ roles: [], declared: false })
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
  // What the platform granted or revoked alongside the last change (platform#695 `requires`).
  const [note, setNote] = useState<string | null>(null)

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

  // Without the manifest only the platform roles are offered.
  useEffect(() => {
    const token = getToken()
    if (!token) return
    let cancelled = false
    fetchAppRoles(token, appId).then((found) => {
      if (cancelled || found.roles.length === 0) return
      setAppRoles(found)
      setSelectedRole((cur) => (cur === ASSIGNABLE_ROLES[0] ? found.roles[0]!.id : cur))
    }, () => {})
    return () => { cancelled = true }
  }, [appId, getToken])

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
    setNote(null)
    try {
      const { requiredRoles } = await assignRole(token, appId, uid, role)
      setNote(requiredNote(role, requiredRoles, appRoles.roles))
      setUserId('')
      setCustomRole('')
      setSelectedRole(appRoles.roles[0]?.id ?? ASSIGNABLE_ROLES[0]!)
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
    setNote(null)
    try {
      const { dependentRoles } = await revokeRole(token, appId, uid, roleName)
      setNote(dependentNote(roleName, dependentRoles, appRoles.roles))
      setConfirming(null)
      await reload()
    } catch (err) {
      setRevokeError((err as Error).message)
    } finally {
      setRevoking(null)
    }
  }

  // Grant the new role, then drop the old one — unless the old one is the automatic signed-in role (console#23),
  // or one the new role requires (platform#695): revoking it would take the new role away again.
  const handleChangeRole = async (r: RoleAssignment, role: string) => {
    const token = getToken()
    if (!token || role === r.roleName) return
    setRevokeError(null)
    setNote(null)
    try {
      const { requiredRoles } = await assignRole(token, appId, r.userId, role)
      const notes = [requiredNote(role, requiredRoles, appRoles.roles)]
      if (r.roleName !== SIGNED_IN_ROLE && !requiredRoles.includes(r.roleName)) {
        const { dependentRoles } = await revokeRole(token, appId, r.userId, r.roleName)
        notes.push(dependentNote(r.roleName, dependentRoles, appRoles.roles))
      }
      setNote(notes.filter(Boolean).join(' ') || null)
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
    : roleDescription(selectedRole, appRoles)
  const field = 'rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--muted)]/60 focus:outline-none focus:border-[var(--ink)] disabled:opacity-50'

  const row = (r: RoleAssignment) => {
    const key = `${r.userId}:${r.roleName}`
    return (
      <MemberRow key={key} r={r} confirming={confirming === key} revoking={revoking === key}
        onAskRemove={() => { setConfirming(key); setRevokeError(null) }}
        onCancel={() => setConfirming(null)}
        onRemove={() => void handleRevoke(r.userId, r.roleName)}
        onChangeRole={(role) => void handleChangeRole(r, role)} appRoles={appRoles} />
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
            <RoleOptions appRoles={appRoles.roles} custom />
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

      {note && <p role="status" className="text-sm text-[var(--muted)]">{note}</p>}
      {revokeError && <p role="alert" className="text-sm text-[var(--error)]">{revokeError}</p>}
    </section>
  )
}

function MemberRow({ r, confirming, revoking, onAskRemove, onCancel, onRemove, onChangeRole, appRoles }: {
  r: RoleAssignment; confirming: boolean; revoking: boolean
  onAskRemove: () => void; onCancel: () => void; onRemove: () => void; onChangeRole: (role: string) => void
  appRoles: AppRoles
}) {
  const [copied, setCopied] = useState(false)
  const name = r.userLogin ? `@${r.userLogin}` : r.userId
  const isOwner = r.roleName === 'owner'
  const label = roleLabel(r.roleName, appRoles.roles)
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
          <RoleBadge role={r.roleName} label={label} />
        </div>
        <p className="text-xs text-[var(--muted)] truncate">
          {roleDescription(r.roleName, appRoles) ?? 'Custom role.'}{r.grantedAt ? ` Added ${formatGrantedDate(r.grantedAt)}.` : ''}
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
          {![...ASSIGNABLE_ROLES, ...appRoles.roles.map((a) => a.id)].includes(r.roleName) && r.roleName !== SIGNED_IN_ROLE && <option value={r.roleName}>{r.roleName}</option>}
          <RoleOptions appRoles={appRoles.roles} />
        </select>
      )}
      {isOwner ? null : confirming ? (
        <span className="shrink-0 flex items-center gap-1">
          <button type="button" onClick={onRemove} disabled={revoking}
            className="rounded-lg bg-[var(--error)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {revoking ? 'Removing…' : `Remove ${label}`}
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

/**
 * What a role means. The owner of an app that declares roles holds all of them
 * (platform#695); a declared role says what it also includes.
 */
function roleDescription(role: string, appRoles: AppRoles): string | undefined {
  if (role === 'owner' && appRoles.declared) {
    return `Owner — holds every role this app declares: ${labelList(appRoles.roles.map((r) => r.id), appRoles.roles)}.`
  }
  const own = appRoles.roles.find((r) => r.id === role)
  if (!own) return ROLE_DESCRIPTIONS[role]
  const text = own.description ?? ROLE_DESCRIPTIONS[role] ?? APP_ROLE_DESCRIPTION
  return own.requires.length > 0 ? `${text} (includes ${labelList(own.requires, appRoles.roles)})` : text
}

function roleLabel(role: string, appRoles: AppRole[]): string {
  return appRoles.find((r) => r.id === role)?.label ?? role
}

function labelList(roles: string[], appRoles: AppRole[]): string {
  return roles.map((r) => roleLabel(r, appRoles)).join(', ')
}

/** The roles the platform granted with `role` because it requires them, in words. */
function requiredNote(role: string, required: string[], appRoles: AppRole[]): string | null {
  if (required.length === 0) return null
  return `${roleLabel(role, appRoles)} also needs ${labelList(required, appRoles)}, so ${required.length === 1 ? 'that was' : 'those were'} granted too.`
}

/** The roles the platform revoked with `role` because they require it, in words. */
function dependentNote(role: string, dependents: string[], appRoles: AppRole[]): string | null {
  if (dependents.length === 0) return null
  const one = dependents.length === 1
  return `${labelList(dependents, appRoles)} ${one ? 'needs' : 'need'} ${roleLabel(role, appRoles)}, so ${one ? 'it was' : 'they were'} removed too.`
}

/** The app's own roles by label first, then the generic ones under "More roles" (console#24, #25). */
function RoleOptions({ appRoles, custom = false }: { appRoles: AppRole[]; custom?: boolean }) {
  const own = new Set(appRoles.map((r) => r.id))
  const more = ASSIGNABLE_ROLES.filter((r) => !own.has(r))
    .map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)
  if (custom) more.push(<option key="custom" value="custom">Custom…</option>)
  if (appRoles.length === 0) return <>{more}</>
  return (
    <>
      <optgroup label="This app's roles">{appRoles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</optgroup>
      <optgroup label="More roles">{more}</optgroup>
    </>
  )
}

function RoleBadge({ role, label }: { role: string; label: string }) {
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
      {label}
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
