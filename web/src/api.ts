// Single source for API base URLs + the shared typed fetch wrapper.
// Previously API_BASE was copy-pasted into ~9 files and the same apiFetch<T>
// existed in PublishView and AdminView verbatim — consolidated here.

export const API_BASE = 'https://api.proappstore.online/v1'
export const AGENT_BASE = 'https://agents.proappstore.online/v1'

/** Bearer auth header (empty object when signed out). */
export function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Error thrown by apiFetch on a non-2xx response. Carries the HTTP status and
 *  parsed body so callers can branch (e.g. PublishView checks status === 409). */
export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    let message = `Request failed (${status})`
    if (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string') {
      message = (body as { error: string }).error
    } else if (typeof body === 'string' && body) {
      message = body
    }
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/**
 * Typed fetch against the PAS API. Sends JSON, attaches bearer auth, parses the
 * response (JSON when possible, else text), and throws ApiError on non-2xx.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit & { token: string | null },
): Promise<T> {
  const { token, headers, ...rest } = init
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
      ...(headers ?? {}),
    },
  })
  const text = await res.text()
  let body: unknown = null
  if (text) {
    try { body = JSON.parse(text) } catch { body = text }
  }
  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}
