/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { syncTokenToCookie, readTokenFromCookie, restoreFromCookie } from './authSync'

// Mock document.cookie
let cookieStore = ''
const originalDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')

beforeEach(() => {
  cookieStore = ''
  Object.defineProperty(document, 'cookie', {
    get: () => cookieStore,
    set: (val: string) => {
      // Parse and store (simplified cookie jar for testing)
      const [pair] = val.split(';')
      const [name, value] = pair!.split('=')
      if (val.includes('Max-Age=0')) {
        // Delete
        cookieStore = cookieStore
          .split('; ')
          .filter(c => !c.startsWith(`${name}=`))
          .join('; ')
      } else {
        const existing = cookieStore.split('; ').filter(c => c && !c.startsWith(`${name}=`))
        existing.push(`${name}=${value}`)
        cookieStore = existing.join('; ')
      }
    },
    configurable: true,
  })
  localStorage.clear()
})

afterEach(() => {
  if (originalDescriptor) Object.defineProperty(document, 'cookie', originalDescriptor)
  localStorage.clear()
})

describe('syncTokenToCookie', () => {
  it('sets the cookie when token is provided', () => {
    syncTokenToCookie('test-token-123')
    expect(cookieStore).toContain('pas_token=test-token-123')
  })

  it('clears the cookie when token is null', () => {
    syncTokenToCookie('test-token-123')
    expect(cookieStore).toContain('pas_token')
    syncTokenToCookie(null)
    expect(cookieStore).not.toContain('test-token-123')
  })

  it('encodes special characters in the token', () => {
    syncTokenToCookie('token with spaces & symbols=yes')
    expect(cookieStore).toContain('pas_token=token%20with%20spaces%20%26%20symbols%3Dyes')
  })
})

describe('readTokenFromCookie', () => {
  it('returns null when no cookie exists', () => {
    expect(readTokenFromCookie()).toBeNull()
  })

  it('reads the token from the cookie', () => {
    syncTokenToCookie('my-token')
    expect(readTokenFromCookie()).toBe('my-token')
  })

  it('decodes URL-encoded tokens', () => {
    syncTokenToCookie('token%20encoded')
    const result = readTokenFromCookie()
    expect(result).toBe('token%20encoded') // readTokenFromCookie decodes, but we set it encoded
  })
})

describe('restoreFromCookie', () => {
  it('does nothing when localStorage already has a session', () => {
    localStorage.setItem('pas:session', JSON.stringify({ token: 'existing', user: null }))
    syncTokenToCookie('cookie-token')
    restoreFromCookie()
    const stored = JSON.parse(localStorage.getItem('pas:session')!)
    expect(stored.token).toBe('existing') // unchanged
  })

  it('does nothing when no cookie exists', () => {
    restoreFromCookie()
    expect(localStorage.getItem('pas:session')).toBeNull()
  })

  it('restores from cookie when localStorage is empty', () => {
    syncTokenToCookie('cross-subdomain-token')
    restoreFromCookie()
    const stored = JSON.parse(localStorage.getItem('pas:session')!)
    expect(stored.token).toBe('cross-subdomain-token')
    expect(stored.user).toBeNull()
  })

  it('does not write the obsolete FAS session key', () => {
    syncTokenToCookie('cross-subdomain-token')
    restoreFromCookie()
    expect(localStorage.getItem('fas:session')).toBeNull()
  })
})
