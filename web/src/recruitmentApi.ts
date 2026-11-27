import { apiFetch } from './api'

export interface RecruitmentSettings { appId: string; accepting_requests: boolean; updated_at: number | null }
const path = (appId: string) => `/apps/${encodeURIComponent(appId)}/team/recruitment`

function settings(value: unknown, appId: string): RecruitmentSettings {
  const x = value as Partial<RecruitmentSettings> | null
  if (!x || x.appId !== appId || typeof x.accepting_requests !== 'boolean'
    || !(x.updated_at === null || typeof x.updated_at === 'number' && Number.isSafeInteger(x.updated_at) && x.updated_at >= 0)) {
    throw new Error('Recruitment settings could not be read.')
  }
  return x as RecruitmentSettings
}

export async function fetchRecruitment(appId: string, token: string | null) {
  return settings(await apiFetch<unknown>(path(appId), { token, credentials: 'omit', cache: 'no-store' }), appId)
}

export async function setRecruitment(appId: string, token: string | null, accepting_requests: boolean) {
  return settings(await apiFetch<unknown>(path(appId), {
    token, credentials: 'omit', cache: 'no-store', method: 'PUT', body: JSON.stringify({ accepting_requests }),
  }), appId)
}
