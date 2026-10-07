import { apiFetch } from './api'

/** Wire shapes of platform/packages/backend/src/routes/connectors.ts (#258). */
export interface ConnectorDecl { name: string; kind: string; modes: string[]; pat_secret: string | null; events: string[]; hook: string | null }
export interface ConnectorInstallation { connector: string; installation_id: number; account_login: string; account_type: string; created_at: number }
export interface ConnectorsResponse { configured: boolean; connectors: ConnectorDecl[]; installations: ConnectorInstallation[] }

export const fetchConnectors = (appId: string, token: string | null) =>
  apiFetch<ConnectorsResponse>(`/apps/${appId}/connectors`, { token })

/** A browser fetch cannot follow the cross-origin 302, so ask for the URL as JSON. */
export const githubInstallUrl = (appId: string, token: string | null) =>
  apiFetch<{ url: string }>(`/apps/${appId}/connectors/github/install`, { token, headers: { Accept: 'application/json' } })

export const unbindGithubInstallation = (appId: string, installationId: number, token: string | null) =>
  apiFetch<{ ok: true }>(`/apps/${appId}/connectors/github/installations/${installationId}`, { token, method: 'DELETE' })

/** The setup parameters GitHub returned, relayed by the platform's GET redirect. */
export const completeGithubSetup = (params: Record<string, string>, token: string | null) =>
  apiFetch<{ ok: true; app_id: string; installation_id: number; account: string }>('/connectors/github/setup', {
    token, method: 'POST', body: JSON.stringify(params),
  })
