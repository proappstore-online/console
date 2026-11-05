import { initPro } from '@proappstore/sdk'
import { restoreFromCookie } from './authSync'
import { candidate } from './runtime'

/** Shared ProAppStore SDK instance for the console. */
if (candidate && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
  throw new Error('Candidate Console must be served on a loopback origin')
}
restoreFromCookie()
export const pro = initPro({ appId: 'console', ...(candidate ? {
  proApiBase: location.origin,
  dataApiBase: `${location.origin}/.pas/data`,
} : {}) })
