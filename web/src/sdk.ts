import { initPro } from '@proappstore/sdk'
import { restoreFromCookie } from './authSync'

/** Shared ProAppStore SDK instance for the console. */
restoreFromCookie()
export const pro = initPro({ appId: 'console' })
